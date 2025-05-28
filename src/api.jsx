import React, { useState } from 'react';
import axios from 'axios';

function Chatbot() {
  const [userQuery, setUserQuery] = useState('');
  const [messages, setMessages] = useState([]);

  const sendMessage = async () => {
    if (!userQuery.trim()) return;

    // Show user query in chat
    setMessages(prev => [...prev, { sender: 'user', text: userQuery }]);

    try {
      // 1. Send user query to backend chat endpoint to get bot response
      const response = await axios.post('http://localhost:5000/api/chat', { userQuery });
      const botReply = response.data.response;
      // this one
      console.log(botReply)

      // Show bot reply in chat
      setMessages(prev => [...prev, { sender: 'bot', text: botReply }]);

      // 2. Optionally send the entire interaction to /api/interactions for saving + training
      await axios.post('http://localhost:5000/api/interactions', {
        userQuery,
        botResponse: botReply,
        feedback: '', // You can add feedback functionality
        label: ''     // You can add labeling functionality
      });

    } catch (error) {
      console.error('Error talking to backend:', error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Sorry, something went wrong.' }]);
    }

    setUserQuery('');
  };

  return (
    <div style={{ maxWidth: 400, margin: '20px auto', fontFamily: 'Arial, sans-serif' }}>
      <h2>Chatbot</h2>
      <div style={{ border: '1px solid #ccc', padding: 10, minHeight: 300, marginBottom: 10, overflowY: 'auto' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ textAlign: msg.sender === 'user' ? 'right' : 'left', margin: '8px 0' }}>
            <span style={{ display: 'inline-block', padding: 8, borderRadius: 5, backgroundColor: msg.sender === 'user' ? '#007bff' : '#eee', color: msg.sender === 'user' ? '#fff' : '#000', maxWidth: '80%' }}>
              {msg.text}
            </span>
          </div>
        ))}
      </div>
      <input
        type="text"
        value={userQuery}
        onChange={e => setUserQuery(e.target.value)}
        onKeyPress={e => e.key === 'Enter' && sendMessage()}
        placeholder="Type your message..."
        style={{ width: '80%', padding: 10, fontSize: 16 }}
      />
      <button onClick={sendMessage} style={{ padding: '10px 15px', marginLeft: 5 }}>Send</button>
    </div>
  );
}

export default Chatbot;
