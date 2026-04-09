'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
      seedContent = "Hi! I'd love to get to know your relationship with food and cooking. Some people love it, some see it as a chore — there's no wrong answer. To start: how would you describe your typical approach to feeding yourself (and anyone else in your household) on a regular weeknight?";
    } else if (params.session_id === '2') {
      if (params.task_type === 'structured' && params.use_memory !== '1') {
        seedContent = "Hi! I'm here to help you build a 5-day dinner plan for the upcoming week. Tell me a bit about your cooking situation — who are you cooking for, and are there any dietary restrictions I should know about?";
      } else if (params.task_type === 'structured' && params.use_memory === '1') {
        seedContent = "Welcome back! I'm here to help you build a 5-day dinner plan for the upcoming week. Is there anything that's changed about your cooking situation since we last spoke?";
      } else if (params.task_type === 'exploratory' && params.use_memory !== '1') {
        seedContent = "Hi! I'm here to help you discover some new food experiences. Tell me a bit about what you've been cooking lately — what's been feeling stale or repetitive.";
      } else if (params.task_type === 'exploratory' && params.use_memory === '1') {
        seedContent = "Welcome back! I'm here to help you discover some new food experiences. Is there anything that's changed about what you've been cooking since we last spoke?";
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
        <h1>Meal Planning</h1>
        <p>Session {params.session_id} • {params.prolific_id}</p>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}
          >
            <ReactMarkdown>{msg.content}</ReactMarkdown>
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
