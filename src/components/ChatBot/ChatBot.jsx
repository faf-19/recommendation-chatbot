import React, { useEffect, useRef, useState } from 'react';
import ChatForm from './ChatForm';
import ChatMessage from './ChatMessage';
import './ChatBot.css';
import { TbMessageChatbotFilled } from "react-icons/tb";
import { MdKeyboardArrowDown } from "react-icons/md";
import { MdModeComment } from "react-icons/md";
import { IoMdClose } from "react-icons/io";

const ChatBot = () => {
    const [chatHistory, setChatHistory] = useState([
        {
            role: 'model',
            text: 'Hello 👋 Welcome to BookCompass! I’m here to help you find your next great read! 📚✨ What are you looking for today? 😊',
            hideInChat: false
        }
    ]);
    const [showChat, setShowChat] = useState(false);
    const chatBodyRef = useRef();

    const toggleChat = () => {
        setShowChat(prevState => !prevState);
    };

    const generateBotResponse = async (history) => {
        const updateHistory = (text) => {
            setChatHistory(prev => [
                ...prev.filter(msg => msg.text !== 'Thinking...'),
                { role: 'model', text }
            ]);
        };

        const userQuery = history[history.length - 1]?.text;
        if (!userQuery || userQuery.trim() === '') {
            updateHistory('Please enter a valid message.');
            return;
        }

        console.log('Sending userQuery to backend:', JSON.stringify({ userQuery }, null, 2));

        try {
            const response = await fetch('http://localhost:5000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userQuery })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Backend error response:', JSON.stringify({ status: response.status, errorText }, null, 2));
                throw new Error(`Failed to get response from server: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            if (!data.response) {
                throw new Error('No response from backend');
            }
            console.log('Backend response:', data.response);
            updateHistory(data.response);

            try {
                await fetch('http://localhost:5000/api/interactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userQuery,
                        botResponse: data.response,
                        feedback: '',
                        label: ''
                    })
                });
            } catch (error) {
                console.error('Error saving interaction:', error.message);
            }
        } catch (error) {
            console.error('Error in generateBotResponse:', JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
            updateHistory(`Sorry, I encountered an error: ${error.message}. Please try again.`);
        }
    };

    useEffect(() => {
        if (chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [chatHistory]);

    return (
        <div className="container">
            <button onClick={toggleChat} id="chatbot__toggle">
                <span>
                    {showChat ? <IoMdClose className='icon' /> : <MdModeComment className='icon' />}
                </span>
            </button>
            {showChat && (
                <div className="chatbot__popup">
                    <div className="chatbot__header">
                        <div className="header__info">
                            <TbMessageChatbotFilled />
                            <h2 className="logo__text">BookCompass</h2>
                        </div>
                        <button className="material-symbols-rounded">
                            <MdKeyboardArrowDown />
                        </button>
                    </div>
                    <div ref={chatBodyRef} className="chat__body">
                        {chatHistory.map((chat, index) => (
                            <ChatMessage key={index} chat={chat} />
                        ))}
                    </div>
                    <div className="chat__footer">
                        <ChatForm
                            chatHistory={chatHistory}
                            setChatHistory={setChatHistory}
                            generateResponse={generateBotResponse}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatBot;