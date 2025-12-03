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
    const { messages, prolific_id, session_id, task_type, use_memory } =
      await req.json()

    const normalizedSession = String(session_id).trim()
    const tableName =
      normalizedSession === '2' ? 'chat_sessions_2' : 'chat_sessions'

    console.log(`💾 Saving to table: ${tableName} (session_id=${normalizedSession})`)

    // system message
    const systemMessage = await getSystemMessage(normalizedSession, use_memory, prolific_id)

    // openai response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'system', content: systemMessage }, ...messages],
      temperature: 0.7,
    })

    const assistantMessage = completion.choices[0].message.content
    const userMessages = messages.filter((m) => m.role === 'user')

    // write to correct table
    const { error } = await supabase
      .from(tableName)
      .upsert(
        {
          prolific_id,
          session_id: normalizedSession,
          task_type,
          use_memory,
          chat_memory: userMessages,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'prolific_id,session_id' }
      )

    if (error) console.error('Supabase error:', error)
    else console.log(`Saved to ${tableName} for prolific_id ${prolific_id}`)

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