import React, { useRef, useState } from 'react';
import { IoIosArrowUp } from "react-icons/io";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import './ChatBot.css';

const ChatForm = ({ chatHistory, setChatHistory, generateResponse, sessionId }) => {
  const inputRef = useRef();
  const [listening, setListening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  const saveUserMessage = async (message) => {
    if (sessionId) {
      try {
        await fetch('http://localhost:5000/api/chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId,
            role: 'user',
            text: message
          }),
        });
      } catch (error) {
        console.error('Error saving user message:', error);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userMessage = inputRef.current.value.trim();
    if (!userMessage || isSubmitting) return;

    try {
      setIsSubmitting(true);
      inputRef.current.value = '';
      
      // Add user message to chat
      setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
      
      // Save user message to session
      await saveUserMessage(userMessage);
      
      // Add thinking message
      setChatHistory(prev => [...prev, { role: 'model', text: 'Thinking...' }]);
      
      // Generate response
      await generateResponse([...chatHistory, { role: 'user', text: userMessage }]);
    } catch (error) {
      console.error('Error in chat submission:', error);
      setChatHistory(prev => {
        const newHistory = [...prev];
        if (newHistory[newHistory.length - 1].text === 'Thinking...') {
          newHistory[newHistory.length - 1] = {
            role: 'model',
            text: 'Sorry, I encountered an error. Please try again.'
          };
        }
        return newHistory;
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMicClick = () => {
    if (!recognition) {
      alert('Your browser does not support voice input.');
      return;
    }

    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputRef.current.value = transcript;
        handleSubmit({ preventDefault: () => {} }); // Simulate form submit
      };

      recognition.onerror = (event) => {
        console.error('Voice input error:', event.error);
        setListening(false);
      };

      recognition.onend = () => setListening(false);

      recognition.start();
      setListening(true);
    }
  };

  return (
    <form action="#" className="chat__form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder={isSubmitting ? "Processing..." : "message..."}
        required
        ref={inputRef}
        className="message__input"
        disabled={isSubmitting}
      />
      <button
        type="button"
        className="mic-button"
        onClick={handleMicClick}
        style={{ marginRight: '0.5rem' }}
        title="Toggle Voice Input"
        disabled={isSubmitting}
      >
        {listening ? <FaMicrophoneSlash className="icon" /> : <FaMicrophone className="icon" />}
      </button>
      <button 
        type="submit" 
        className="material-symbols-rounded"
        disabled={isSubmitting}
      >
        <IoIosArrowUp className="icon" />
      </button>
    </form>
  );
};

export default ChatForm;
