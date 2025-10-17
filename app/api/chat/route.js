import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabase } from '@/lib/supabase'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// System messages for different sessions
const getSystemMessage = async (sessionId, useMemory, prolificId) => {
  let systemMessage = ''
  
  if (sessionId === '1') {
    systemMessage = 'You are a helpful research assistant for Session 1. Engage naturally with the participant and answer their questions thoughtfully.'
  } else if (sessionId === '2') {
    systemMessage = 'You are a helpful research assistant for Session 2.'
    
    // Load Session 1 memory if use_memory is 1
    if (useMemory === 1) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('chat_memory')
        .eq('prolific_id', prolificId)
        .eq('session_id', '1')
        .single()
      
      if (!error && data && data.chat_memory.length > 0) {
        const previousChat = data.chat_memory
          .map(msg => `${msg.role}: ${msg.content}`)
          .join('\n')
        
        systemMessage += `\n\nPrevious conversation from Session 1:\n${previousChat}\n\nPlease reference this conversation naturally when relevant.`
      }
    }
  }
  
  return systemMessage
}

export async function POST(req) {
  try {
    const { messages, prolific_id, session_id, task_type, use_memory } = await req.json()

    // Get system message based on session
    const systemMessage = await getSystemMessage(session_id, use_memory, prolific_id)

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        ...messages
      ],
      temperature: 0.7,
    })

    const assistantMessage = completion.choices[0].message.content

    // Extract only user messages for storage
    const userMessages = messages.filter(msg => msg.role === 'user')

    // Update database with user messages
    const { error } = await supabase
      .from('chat_sessions')
      .upsert({
        prolific_id,
        session_id,
        task_type,
        use_memory,
        chat_memory: userMessages,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'prolific_id,session_id'
      })

    if (error) {
      console.error('Supabase error:', error)
    }

    return NextResponse.json({ message: assistantMessage })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}