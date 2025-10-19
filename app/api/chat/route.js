import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabaseServer as supabase } from '@/lib/supabaseServer'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const allowedOrigin = 'https://stanforduniversity.qualtrics.com'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Handle preflight requests (for browser CORS)
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

// Build system message
const getSystemMessage = async (sessionId, useMemory, prolificId) => {
  let systemMessage = ''

  if (sessionId === '1') {
    systemMessage =
      'You are a helpful research assistant for Session 1. Engage naturally with the participant and answer their questions thoughtfully.'
  } else if (sessionId === '2') {
    systemMessage = 'You are a helpful research assistant for Session 2.'

    // Load memory from session 1 if enabled
    if (useMemory === 1) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('chat_memory')
        .eq('prolific_id', prolificId)
        .eq('session_id', '1')
        .single()

      if (!error && data && data.chat_memory?.length > 0) {
        const previousChat = data.chat_memory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n')

        systemMessage += `\n\nPrevious conversation from Session 1:\n${previousChat}\n\nPlease reference this conversation naturally when relevant.`
      }
    }
  }

  return systemMessage
}

export async function POST(req) {
  try {
    const { messages, prolific_id, session_id, task_type, use_memory } =
      await req.json()

    // Choose table based on session
    const tableName =
      String(session_id) === '2' ? 'chat_sessions_2' : 'chat_sessions'

    // Build system message
    const systemMessage = await getSystemMessage(session_id, use_memory, prolific_id)

    // Get OpenAI completion
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        ...messages,
      ],
      temperature: 0.7,
    })

    const assistantMessage = completion.choices[0].message.content
    const userMessages = messages.filter((msg) => msg.role === 'user')

    // Save to the table
    const { error } = await supabase
      .from(tableName)
      .upsert(
        {
          prolific_id,
          session_id,
          task_type,
          use_memory,
          chat_memory: userMessages,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'prolific_id,session_id' }
      )

    if (error) console.error('Supabase error:', error)
    else console.log(`Saved to ${tableName} for ${prolific_id}`)

    // Return AI message with CORS headers
    return NextResponse.json({ message: assistantMessage }, { headers: corsHeaders })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500, headers: corsHeaders }
    )
  }
}
