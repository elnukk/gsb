import { NextResponse } from 'next/server'
import { supabaseServer as supabase } from '@/lib/supabaseServer'

const allowedOrigins = [
  'https://stanforduniversity.qualtrics.com',
  'https://gsb-gray.vercel.app',
  'https://gsb-session1.vercel.app',
  'http://localhost:3000'
]

const getCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
})

export async function OPTIONS(req) {
  const origin = req.headers.get('origin') || ''
  return new NextResponse(null, { headers: getCorsHeaders(origin) })
}

export async function GET(req) {
  const origin = req.headers.get('origin') || ''
  
  try {
    const { searchParams } = new URL(req.url)
    const prolific_id = searchParams.get('prolific_id')
    
    if (!prolific_id) {
      return NextResponse.json(
        { error: 'prolific_id required' },
        { status: 400, headers: getCorsHeaders(origin) }
      )
    }

    // Fetch task_type from Session 1
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('task_type')
      .eq('prolific_id', prolific_id)
      .eq('session_id', '1')
      .single()
    
    if (error || !data) {
      return NextResponse.json(
        { error: 'No Session 1 data found', task_type: 'default' },
        { status: 404, headers: getCorsHeaders(origin) }
      )
    }

    return NextResponse.json(
      { task_type: data.task_type },
      { headers: getCorsHeaders(origin) }
    )
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch task type' },
      { status: 500, headers: getCorsHeaders(origin) }
    )
  }
}