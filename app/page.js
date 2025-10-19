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
    task_type: '',
    use_memory: ''
  });
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setParams({
      prolific_id: urlParams.get('prolific_id') || 'demo_user',
      session_id: urlParams.get('session_id') || '1',
      task_type: urlParams.get('task_type') || 'default',
      use_memory: urlParams.get('use_memory') || 'no'
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          prolific_id: params.prolific_id,
          session_id: params.session_id,
          task_type: params.task_type,
          use_memory: params.use_memory
        })
      });

      const data = await response.json();

      if (data?.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Please try again.' }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <h1>Experiment</h1>
        <p>
          Session {params.session_id} • {params.prolific_id}
        </p>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-placeholder">Start by typing a message below.</p>
        )}

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

      {/* Input */}
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
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
