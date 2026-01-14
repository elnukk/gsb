import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer as supabase } from '@/lib/supabaseServer';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const allowedOrigins = [
  'https://stanforduniversity.qualtrics.com',
  'https://gsb-gray.vercel.app',
  'https://gsb-session1.vercel.app',
  'http://localhost:3000'
];

const getCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

export async function OPTIONS(req) {
  const origin = req.headers.get('origin') || '';
  return new NextResponse(null, { headers: getCorsHeaders(origin) });
}

const countAssistantReplies = (msgs = []) =>
  msgs.filter((m) => m.role === 'assistant').length;

// ----- system message -----
const getSystemMessage = async (sessionId, useMemory, prolificId, messages) => {
  const normalizedSession = String(sessionId).trim();
  const useMemoryOn = String(useMemory).trim() === '1';

  // assistant replies so far in this conversation
  const assistantRepliesSoFar = countAssistantReplies(messages);
  // 6th assistant reply => 0..5 (so >=5 means we are on the 6th one)
  const isFinalAssistantReply = assistantRepliesSoFar >= 5;

  let systemMessage = '';

  if (normalizedSession === '1') {
    systemMessage = `
You are helping a participant design a concrete plan for their upcoming Saturday.

You must do two things:
(1) Elicit information by asking questions that cover ALL of the following:
  - Typical day (work schedule, wake time, commitments)
  - Energy patterns across the day
  - Values in free time
  - What prevents good weekends (constraints, obligations, budget)
  - How they want the schedule presented (format/detail)

(2) Then co-create a specific Saturday plan that includes:
  - Timing (aligned with their wake-up preferences and energy patterns)
  - Specific activities
  - Constraint-aware choices
  - Presented in their preferred format

Turn limit requirement:
- You may ask questions in your replies 1–5.
- On your 6th reply, do NOT ask any questions. Deliver the best complete Saturday plan you can based on what you have.
- If details are missing, make reasonable assumptions and state them briefly.

${isFinalAssistantReply ? 'This is your 6th reply now: do not ask questions; output the final plan.' : ''}
`.trim();

    return systemMessage;
  }

  // Session 2 (keep this minimal; add your session-2 logic later)
  systemMessage = 'You are a helpful research assistant for Session 2.';

  // If in the future you need memory in session 2, this is the corrected gate:
  if (normalizedSession === '2' && useMemoryOn) {
    const { data, error } = await supabase
      .from('chat_sessions') // session 1 memory source
      .select('chat_memory')
      .eq('prolific_id', prolificId)
      .eq('session_id', '1')
      .single();

    if (!error && data?.chat_memory?.length) {
      const previousChat = data.chat_memory
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');
      systemMessage += `

Previous conversation from Session 1:
${previousChat}

Please reference this conversation naturally when relevant.
`.trim();
    }
  }

  return systemMessage;
};

// ----- main POST -----
export async function POST(req) {
  const origin = req.headers.get('origin') || '';

  try {
    const body = await req.json();

    let { messages, prolific_id, session_id, use_memory } = body;

    // Basic normalization
    const normalizedSession = String(session_id || '').trim() || '1';
    const prolificId = String(prolific_id || '').trim() || 'placeholder';
    const useMemory = String(use_memory ?? '0').trim();

    const tableName = normalizedSession === '2' ? 'chat_sessions_2' : 'chat_sessions';

    // System message (includes 6-reply cap logic)
    const systemMessage = await getSystemMessage(
      normalizedSession,
      useMemory,
      prolificId,
      messages || []
    );

    // OpenAI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'system', content: systemMessage }, ...(messages || [])],
      temperature: 0.7
    });

    const assistantMessage = completion?.choices?.[0]?.message?.content ?? 'Error: no response.';

    // Get existing chat history
    const { data: existingData } = await supabase
      .from(tableName)
      .select('chat_memory')
      .eq('prolific_id', prolificId)
      .eq('session_id', normalizedSession)
      .single();

    let allMessages = existingData?.chat_memory || [];

    // Append only the NEW user message + assistant response
    const newUserMessage = (messages || [])[ (messages || []).length - 1 ];

    if (newUserMessage && newUserMessage.role === 'user') {
      allMessages.push({
        role: 'user',
        content: newUserMessage.content,
        timestamp: new Date().toISOString()
      });

      allMessages.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString()
      });
    } else {
      // Fallback: if client ever sends malformed messages, still save assistant response
      allMessages.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString()
      });
    }

    // Save updated chat history
    const { error } = await supabase
      .from(tableName)
      .upsert(
        {
          prolific_id: prolificId,
          session_id: normalizedSession,
          // Keep these for logging/debugging even if you don't use them in session 1
          use_memory: useMemory,
          task_type: 'weekend_planning',
          chat_memory: allMessages,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'prolific_id,session_id' }
      );

    if (error) console.error('Supabase error:', error);

    return NextResponse.json(
      { message: assistantMessage },
      { headers: getCorsHeaders(origin) }
    );
  } catch (err) {
    console.error('Error:', err);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500, headers: getCorsHeaders(origin) }
    );
  }
}
