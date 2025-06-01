const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Configure multer for PDF uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'backend/pdfs/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// PDF Document Schema
const pdfDocumentSchema = new mongoose.Schema({
    filename: String,
    content: String,
    uploadDate: { type: Date, default: Date.now }
});
const PdfDocument = mongoose.model('PdfDocument', pdfDocumentSchema);

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
    isMongoConnected = false;
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

// Load static data
const loadStaticData = async () => {
    try {
        const websiteInfo = JSON.parse(await fs.readFile(path.join(__dirname, 'static', 'websiteInfo.json'), 'utf8'));
        const faq = JSON.parse(await fs.readFile(path.join(__dirname, 'static', 'faq.json'), 'utf8'));
        const history = JSON.parse(await fs.readFile(path.join(__dirname, 'static', 'history.json'), 'utf8'));
        return { websiteInfo, faq, history };
    } catch (error) {
        console.error('Error loading static data:', error);
        return { websiteInfo: {}, faq: {}, history: {} };
    }
};

let staticData = {};
loadStaticData().then(data => {
    staticData = data;
    console.log('Static data loaded successfully');
});

app.post('/api/chat', async (req, res) => {
    try {
        console.log('Received chat request:', JSON.stringify(req.body, null, 2));
        const fetch = (await import('node-fetch')).default;
        const { userQuery } = req.body;

        if (!userQuery || userQuery.trim() === '') {
            return res.status(400).json({ message: 'userQuery is required' });
        }

        let context = 'You are an AI assistant with access to the following information:\n\n';
        
        // Add website info to context
        context += 'WEBSITE INFORMATION:\n';
        context += JSON.stringify(staticData.websiteInfo, null, 2) + '\n\n';
        
        // Add historical information if query seems history-related
        if (userQuery.toLowerCase().includes('ginbot') || 
            userQuery.toLowerCase().includes('history') || 
            userQuery.toLowerCase().includes('ethiopia') ||
            userQuery.toLowerCase().includes('tigray') ||
            userQuery.toLowerCase().includes('derg')) {
            context += 'HISTORICAL INFORMATION:\n';
            context += JSON.stringify(staticData.history, null, 2) + '\n\n';
        }
        
        // Add FAQ to context if query seems question-related
        if (userQuery.toLowerCase().includes('how') || 
            userQuery.toLowerCase().includes('what') || 
            userQuery.toLowerCase().includes('?')) {
            context += 'FREQUENTLY ASKED QUESTIONS:\n';
            context += JSON.stringify(staticData.faq, null, 2) + '\n\n';
        }

        context += 'USER QUERY:\n' + userQuery;

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: context }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000
            }
        };

        // ... rest of the existing chat endpoint code ...
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

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

// PDF Upload and Processing Endpoint
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No PDF file uploaded' });
        }

        const pdfPath = req.file.path;
        const dataBuffer = await fs.readFile(pdfPath);
        const pdfData = await pdfParse(dataBuffer);

        // Save PDF content to database
        const pdfDoc = new PdfDocument({
            filename: req.file.originalname,
            content: pdfData.text
        });
        await pdfDoc.save();

        // Clean up the uploaded file
        await fs.unlink(pdfPath);

        res.status(200).json({
            message: 'PDF processed successfully',
            filename: req.file.originalname
        });
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ message: 'Error processing PDF', error: error.message });
    }
});

// Get all PDF documents
app.get('/api/pdfs', async (req, res) => {
    try {
        const pdfs = await PdfDocument.find({}, { filename: 1, uploadDate: 1 });
        res.json(pdfs);
    } catch (error) {
        console.error('Error fetching PDFs:', error);
        res.status(500).json({ message: 'Error fetching PDFs', error: error.message });
    }
});

// Process existing PDF endpoint
app.post('/api/process-existing-pdf', async (req, res) => {
    try {
        console.log('Starting PDF processing...');
        const pdfPath = 'C:/Users/hp/Downloads/Telegram Desktop/Exit Study Plan.pdf';
        console.log('PDF path:', pdfPath);
        
        console.log('Reading file...');
        const dataBuffer = await fs.readFile(pdfPath);
        console.log('File read successfully, parsing PDF...');
        
        const pdfData = await pdfParse(dataBuffer);
        console.log('PDF parsed successfully, content length:', pdfData.text.length);

        // Save PDF content to database
        const pdfDoc = new PdfDocument({
            filename: 'Exit Study Plan.pdf',
            content: pdfData.text
        });
        console.log('Saving to database...');
        await pdfDoc.save();
        console.log('PDF saved to database successfully');

        res.status(200).json({
            message: 'PDF processed successfully',
            filename: 'Exit Study Plan.pdf'
        });
    } catch (error) {
        console.error('Error processing PDF:', error);
        res.status(500).json({ message: 'Error processing PDF', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});