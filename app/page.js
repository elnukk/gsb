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
    use_memory: ''
  });

  const messagesEndRef = useRef(null);
  const seededRef = useRef(false);

  // Keep a ref in sync with messages to avoid stale state when sending
  const messagesRef = useRef([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Read URL params once
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setParams({
      prolific_id: urlParams.get('prolific_id') || 'demo_user',
      session_id: urlParams.get('session_id') || '1',
      use_memory: urlParams.get('use_memory') || '0'
    });
  }, []);

  // Seed first assistant message once
  useEffect(() => {
    if (seededRef.current) return;
    if (!params.session_id) return;

    seededRef.current = true;

    const seeded = [
      {
        role: 'assistant',
        content:
          "You have a free Saturday coming up. Let's design a plan for how you'd like to spend it. I'll ask you some questions to understand what would make for a good weekend for you."
      }
    ];

    setMessages(seeded);
    messagesRef.current = seeded; // ensure ref is aligned immediately
  }, [params.session_id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input.trim() };

    // Update UI immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Build outgoing messages from ref (latest), not possibly-stale state
    const outgoingMessages = [...messagesRef.current, userMessage];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: outgoingMessages,
          prolific_id: params.prolific_id,
          session_id: params.session_id,
          use_memory: params.use_memory
        })
      });

      const data = await response.json();

      if (data?.message) {
        const assistantMsg = { role: 'assistant', content: data.message };
        setMessages((prev) => [...prev, assistantMsg]);
        // keep ref aligned (setMessages is async)
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
        <p>
          Session {params.session_id} • {params.prolific_id}
        </p>
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
          placeholder="Type a message..."
          rows={1}
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="loader" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
