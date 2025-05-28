const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const mongoURI = process.env.MONGO_URI || 'mongodb+srv://BisratAbrham:nchnHeyHqCh46rLT@cluster0.hjgnw.mongodb.net/BookCompassGcProject';
let isMongoConnected = false;

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log('MongoDB connected successfully');
        isMongoConnected = true;
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        isMongoConnected = false;
    });

mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
    isMongoConnected = true;
});

mongoose.connection.on('connected', () => {
    console.log('MongoDB connected');
    isMongoConnected = true;
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
    isMongoConnected = false;
});

const forumSchema = new mongoose.Schema({
    introduction: String,
    guidelines: String,
    features: [{ name: String, description: String }],
    support: String,
});
const Forum = mongoose.model('Forum', forumSchema);

const chatMessageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    role: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

const userInteractionSchema = new mongoose.Schema({
    userQuery: { type: String, required: true },
    botResponse: String,
    feedback: String,
    label: String,
    createdAt: { type: Date, default: Date.now },
});
const UserInteraction = mongoose.model('UserInteraction', userInteractionSchema);

// Add rate limiting setup
const rateLimit = {
    tokens: 60, // Tokens per minute (adjust based on your quota)
    lastRefill: Date.now(),
    lastRequest: Date.now(),
    waitingRequests: [],
};

// Rate limiting function
const checkRateLimit = () => {
    const now = Date.now();
    const minutesPassed = (now - rateLimit.lastRefill) / (60 * 1000);
    
    // Refill tokens based on time passed
    if (minutesPassed >= 1) {
        rateLimit.tokens = 60; // Reset to max tokens
        rateLimit.lastRefill = now;
    }

    if (rateLimit.tokens > 0) {
        rateLimit.tokens--;
        rateLimit.lastRequest = now;
        return true;
    }
    return false;
};

// Exponential backoff function
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const exponentialBackoff = async (retryCount) => {
    const baseDelay = 1000; // 1 second
    const maxDelay = 32000; // 32 seconds
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    await wait(delay);
};

app.post('/api/chat/messages', async (req, res) => {
    try {
        const { sessionId, role, text } = req.body;
        if (!sessionId || !role || !text) {
            return res.status(400).json({ message: 'sessionId, role, and text are required' });
        }
        const newMessage = new ChatMessage({ sessionId, role, text });
        await newMessage.save();
        return res.status(201).json({ message: 'Chat message saved' });
    } catch (error) {
        console.error('Error saving chat message:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/chat/sessions', async (req, res) => {
    try {
        const sessions = await ChatMessage.distinct('sessionId');
        res.json({ sessions });
    } catch (error) {
        console.error('Failed to fetch chat sessions:', error);
        res.status(500).json({ message: 'Failed to fetch chat sessions', error: error.message });
    }
});

app.get('/api/chat/messages/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const messages = await ChatMessage.find({ sessionId }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        console.error('Failed to fetch chat messages:', error);
        res.status(500).json({ message: 'Failed to fetch chat messages', error: error.message });
    }
});

app.post('/api/interactions', async (req, res) => {
    try {
        const { userQuery, botResponse, feedback, label } = req.body;
        if (!userQuery) {
            return res.status(400).json({ message: 'userQuery is required' });
        }
        const interaction = new UserInteraction({
            userQuery,
            botResponse: botResponse || '',
            feedback: feedback || '',
            label: label || '',
        });
        await interaction.save();
        return res.status(201).json({ message: 'Interaction saved' });
    } catch (error) {
        console.error('Failed to save interaction:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/api/interactions', async (req, res) => {
    try {
        const interactions = await UserInteraction.find().sort({ createdAt: -1 });
        return res.json(interactions);
    } catch (error) {
        console.error('Failed to get interactions:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        console.log('Received chat request:', JSON.stringify(req.body, null, 2));
        const fetch = (await import('node-fetch')).default;
        const { userQuery } = req.body;

        if (!userQuery || userQuery.trim() === '') {
            return res.status(400).json({ message: 'userQuery is required' });
        }

        if (!isMongoConnected) {
            return res.status(500).json({ message: 'MongoDB is not connected' });
        }

        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set in environment variables');
            return res.status(500).json({
                message: 'Server configuration error: API key not set',
                error: 'GEMINI_API_KEY is missing'
            });
        }

        // Check rate limit
        if (!checkRateLimit()) {
            const retryAfter = Math.ceil((60 - (Date.now() - rateLimit.lastRefill) / 1000));
            return res.status(429).json({
                message: 'Rate limit exceeded',
                retryAfter: retryAfter,
                error: 'Please try again after ' + retryAfter + ' seconds'
            });
        }

        const forumData = await Forum.findOne();
        let context = forumData
            ? `You are BookCompass, a chatbot for book recommendations. Website context: ${forumData.introduction}\nFeatures: ${JSON.stringify(forumData.features)}`
            : 'You are BookCompass, a chatbot for book recommendations.';
        if (userQuery.toLowerCase().includes('backend') || userQuery.toLowerCase().includes('books')) {
            const genres = forumData?.features.map(f => f.name).join(', ') || 'various genres';
            context += `\nAvailable book genres in the backend: ${genres}.`;
        }

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: context + '\n\nUser query: ' + userQuery }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 200
            }
        };

        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                console.log('Sending request to Gemini API with body:', JSON.stringify(requestBody, null, 2));

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    }
                );

                const responseText = await response.text();
                console.log('Raw API Response:', responseText);

                if (!response.ok) {
                    let errorDetails;
                    try {
                        errorDetails = JSON.parse(responseText);
                    } catch {
                        errorDetails = responseText;
                    }

                    // Handle rate limit errors specifically
                    if (response.status === 429) {
                        if (retryCount < maxRetries - 1) {
                            console.log(`Rate limit hit, attempt ${retryCount + 1}/${maxRetries}. Waiting before retry...`);
                            await exponentialBackoff(retryCount);
                            retryCount++;
                            continue;
                        } else {
                            return res.status(429).json({
                                message: 'Rate limit exceeded after retries',
                                error: 'Please try again later'
                            });
                        }
                    }

                    console.error('Gemini API error response:', JSON.stringify({
                        status: response.status,
                        statusText: response.statusText,
                        body: errorDetails
                    }, null, 2));

                    return res.status(response.status).json({
                        message: 'Gemini API error',
                        error: `${response.status} - ${JSON.stringify(errorDetails)}`
                    });
                }

                const data = JSON.parse(responseText);
                console.log('Parsed API response:', JSON.stringify(data, null, 2));

                if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
                    console.error('Invalid response format from Gemini API:', JSON.stringify(data, null, 2));
                    return res.status(500).json({
                        message: 'Invalid response format from Gemini API',
                        error: JSON.stringify(data)
                    });
                }

                const botReply = data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, '$1').trim();
                console.log('Bot reply:', botReply);

                return res.json({ response: botReply });
            } catch (error) {
                if (retryCount < maxRetries - 1) {
                    console.log(`Request failed, attempt ${retryCount + 1}/${maxRetries}. Retrying...`);
                    await exponentialBackoff(retryCount);
                    retryCount++;
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});