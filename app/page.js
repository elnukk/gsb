'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import './ChatbotExperiment.css';

export default function ChatbotExperiment() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState({
    prolific_id: '',
    session_id: '',
    use_memory: '',
    task_type: ''
  });

  const messagesEndRef = useRef(null);
  const seededRef = useRef(false);
  const messagesRef = useRef([]);

  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const maxMessagesReached = params.session_id === '2' && userMessageCount >= 5;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setParams({
      prolific_id: urlParams.get('prolific_id') || 'demo_user',
      session_id: urlParams.get('session_id') || '1',
      use_memory: urlParams.get('use_memory') || '0',
      task_type: urlParams.get('task_type') || ''
    });
  }, []);

  useEffect(() => {
    if (seededRef.current || !params.session_id) return;
    seededRef.current = true;

    let seedContent = '';

    if (params.session_id === '1') {
      seedContent = "You have a free Saturday coming up. Let's design a plan for how you'd like to spend it. I'll ask you some questions to understand what would make for a good weekend for you.";
    } else if (params.session_id === '2') {
      if (params.task_type === 'structured') {
        seedContent = "Welcome! I'm here to help you plan your upcoming Saturday and develop a schedule. Let's create a timetable together - what time do you usually wake up on Saturdays?";
      } else if (params.task_type === 'exploratory') {
        seedContent = "Welcome! I'm here to help you get new inspiration for your upcoming Saturday and brainstorm fresh ideas. What kinds of things have you been curious to try, or what would make this Saturday feel special?";
      } else {
        seedContent = "Welcome! How can I help you today?";
      }
    } else {
      seedContent = "Hello! How can I help you today?";
    }

    const seeded = [{ role: 'assistant', content: seedContent }];
    setMessages(seeded);
    messagesRef.current = seeded;
  }, [params.session_id, params.task_type]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading || maxMessagesReached) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const outgoingMessages = [...messagesRef.current, userMessage];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: outgoingMessages,
          prolific_id: params.prolific_id,
          session_id: params.session_id,
          use_memory: params.use_memory,
          task_type: params.task_type
        })
      });

      const data = await response.json();

      if (data?.message) {
        const assistantMsg = { role: 'assistant', content: data.message };
        setMessages((prev) => [...prev, assistantMsg]);
        messagesRef.current = [...outgoingMessages, assistantMsg];
      } else {
        const assistantMsg = { role: 'assistant', content: 'Error: Please try again.' };
        setMessages((prev) => [...prev, assistantMsg]);
        messagesRef.current = [...outgoingMessages, assistantMsg];
      }
    } catch (err) {
      console.error(err);
      const assistantMsg = { role: 'assistant', content: 'Connection error.' };
      setMessages((prev) => [...prev, assistantMsg]);
      messagesRef.current = [...outgoingMessages, assistantMsg];
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Weekend Planning</h1>
        <p>Session {params.session_id} • {params.prolific_id}</p>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}
          >
            {msg.content}
          </div>
        ))}

        {loading && (
          <div className="chat-bubble assistant">
            <Loader2 className="loader" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={maxMessagesReached ? "You've reached the message limit" : "Type a message..."}
          rows={1}
          disabled={loading || maxMessagesReached}
        />
        <button onClick={handleSend} disabled={loading || !input.trim() || maxMessagesReached}>
          {loading ? <Loader2 className="loader" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
