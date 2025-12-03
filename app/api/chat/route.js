import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabaseServer as supabase } from '@/lib/supabaseServer'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const allowedOrigins = [
  'https://stanforduniversity.qualtrics.com',
  'https://gsb-gray.vercel.app',
  'https://gsb-session1.vercel.app',
  'http://localhost:3000'
]

const getCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
})

export async function OPTIONS(req) {
  const origin = req.headers.get('origin') || ''
  return new NextResponse(null, { headers: getCorsHeaders(origin) })
}

// ----- system message -----
const getSystemMessage = async (sessionId, useMemory, prolificId) => {
  let systemMessage = ''

  if (sessionId === '1') {
    systemMessage =
      'You are a helpful research assistant for Session 1. Engage naturally with the participant and answer their questions thoughtfully.'
  } else if (sessionId === '2') {
    systemMessage = 'You are a helpful research assistant for Session 2.'

    // pull prior chat from session 1 table ONLY if requested
    if (useMemory === 1) {
      const { data, error } = await supabase
        .from('chat_sessions') // always session 1 memory source
        .select('chat_memory')
        .eq('prolific_id', prolificId)
        .eq('session_id', '1')
        .single()

      if (!error && data?.chat_memory?.length) {
        const previousChat = data.chat_memory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n')
        systemMessage += `\n\nPrevious conversation from Session 1:\n${previousChat}\n\nPlease reference this conversation naturally when relevant.`
      }
    }
  }
  return systemMessage
}

// ----- main POST -----

export async function POST(req) {
  const origin = req.headers.get('origin') || ''
  
  try {
    let { messages, prolific_id, session_id, task_type, use_memory } = await req.json()

    const normalizedSession = String(session_id).trim()
    
    // If Session 2, fetch task_type from Session 1 if not provided
    if (normalizedSession === '2' && !task_type) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('task_type')
        .eq('prolific_id', prolific_id)
        .eq('session_id', '1')
        .single()
      
      if (!error && data) {
        task_type = data.task_type
        console.log(`Retrieved task_type from Session 1: ${task_type}`)
      } else {
        console.error('Could not fetch task_type from Session 1:', error)
        task_type = 'default'
      }
    }

    const tableName = normalizedSession === '2' ? 'chat_sessions_2' : 'chat_sessions'

    console.log(`Saving to table: ${tableName} (session_id=${normalizedSession})`)

    // system message
    const systemMessage = await getSystemMessage(normalizedSession, use_memory, prolific_id)

    // openai response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'system', content: systemMessage }, ...messages],
      temperature: 0.7,
    })

    const assistantMessage = completion.choices[0].message.content


    // Get existing chat history
    const { data: existingData } = await supabase
      .from(tableName)
      .select('chat_memory')
      .eq('prolific_id', prolific_id)
      .eq('session_id', normalizedSession)
      .single()

    // Start with existing messages or empty array
    let allMessages = existingData?.chat_memory || []
    
    // Get only the NEW user message (last message in the array)
    const newUserMessage = messages[messages.length - 1]
    
    // Append the new user message and assistant response
    if (newUserMessage && newUserMessage.role === 'user') {
      allMessages.push({
        role: 'user',
        content: newUserMessage.content,
        timestamp: new Date().toISOString()
      })
      
      allMessages.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString()
      })
    }

    // ========== Save updated chat history ==========
    
    const { error } = await supabase
      .from(tableName)
      .upsert(
        {
          prolific_id,
          session_id: normalizedSession,
          task_type,
          use_memory,
          chat_memory: allMessages,  // ← Now contains full history
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'prolific_id,session_id' }
      )

    if (error) console.error('Supabase error:', error)
    else console.log(`Saved to ${tableName} - Total messages: ${allMessages.length}`)

    return NextResponse.json(
      { message: assistantMessage }, 
      { headers: getCorsHeaders(origin) }
    )
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500, headers: getCorsHeaders(origin) }
    )
  }
}