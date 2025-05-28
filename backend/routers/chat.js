const express = require('express');
const router = express.Router();
const ChatMessage = require('./models/ChatMessage');


router.post('/messages', async (req, res) => {
  try {
    const { sessionId, role, text } = req.body;

    if (!sessionId || !role || !text) {
      return res.status(400).json({ error: 'sessionId, role, and text are required' });
    }

    const message = new ChatMessage({ sessionId, role, text });
    await message.save();
    res.status(201).json(message);
  } catch (error) {
    console.error('Error saving chat message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get chat messages by sessionId, ordered oldest first
router.get('/messages/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const messages = await ChatMessage.find({ sessionId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
