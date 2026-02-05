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

const getSystemMessage = async (sessionId, useMemory, prolificId, messages, taskType) => {
  const normalizedSession = String(sessionId).trim();
  const useMemoryOn = String(useMemory).trim() === '1';
  const normalizedTaskType = String(taskType || '').trim().toLowerCase();

  const assistantRepliesSoFar = countAssistantReplies(messages);
  const isFinalReply = assistantRepliesSoFar >= 5;

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

${isFinalReply ? 'This is your 6th reply now: do not ask questions; output the final plan.' : ''}
`.trim();
    return systemMessage;
  }

  if (normalizedTaskType === 'structured') {
    systemMessage = `You are a helpful assistant. The user wants to plan their upcoming Saturday and develop a schedule or timetable.

Help them create a concrete, organized plan with specific times and activities.
Be structured and methodical in your approach.
First, ask 3–5 closed-ended questions to understand their constraints, must-dos, location, budget, and energy level. This should be conversational, not a list of questions.
Then, produce a time-block schedule with exactly six blocks, each with a start time, end time, and a short rationale for the activity.
`.trim();
  } else if (normalizedTaskType === 'exploratory') {
    systemMessage = `
You are a helpful assistant. The user wants to get new inspiration for how to spend their upcoming Saturday and brainstorm new ideas.

Help them explore possibilities and discover fresh ideas for their weekend.
Be creative and encouraging. Suggest diverse options they might not have considered.
Ask open-ended questions to spark their imagination and help them think outside the box. This should be conversational. You should never return a list of questions.
Do not produce a schedule or timetable. Instead, organize suggestions into idea clusters and include a short shortlisting step where you ask the user to choose a direction. First, ask 3–5 open-ended questions about their mood, novelty-seeking, social vs. solo preferences, and similar topics. Then, generate exactly six ideas organized into thematic clusters, and ask the user to select a direction before going deeper.
`.trim();
  } else {
    systemMessage = 'You are a helpful research assistant for Session 2.';
  }

  if (normalizedSession === '2' && useMemoryOn) {
    const { data, error } = await supabase
      .from('memory_statements')
      .select('statement')
      .eq('prolific_id', prolificId);

    if (!error && data?.length > 0) {
      const memoryStatements = data.map((row) => `- ${row.statement}`).join('\n');
      systemMessage += `

This is what you know about the user from a previous conversation:
${memoryStatements}

Use this information naturally in your responses when relevant. Do not explicitly mention that you have this information unless asked.
`.trim();
    }
  }

  return systemMessage;
};

export async function POST(req) {
  const origin = req.headers.get('origin') || '';

  try {
    const body = await req.json();
    let { messages, prolific_id, session_id, use_memory, task_type } = body;

    const normalizedSession = String(session_id || '').trim() || '1';
    const prolificId = String(prolific_id || '').trim() || 'placeholder';
    const useMemory = String(use_memory ?? '0').trim();
    const taskType = String(task_type || '').trim();

    const tableName = normalizedSession === '2' ? 'chat_sessions_2' : 'chat_sessions';

    const systemMessage = await getSystemMessage(
      normalizedSession,
      useMemory,
      prolificId,
      messages || [],
      taskType
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'system', content: systemMessage }, ...(messages || [])],
      temperature: 0.7
    });

    const assistantMessage = completion?.choices?.[0]?.message?.content ?? 'Error: no response.';

    const { data: existingData } = await supabase
      .from(tableName)
      .select('chat_memory')
      .eq('prolific_id', prolificId)
      .eq('session_id', normalizedSession)
      .single();

    let allMessages = existingData?.chat_memory || [];
    const newUserMessage = (messages || [])[(messages || []).length - 1];

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
      allMessages.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date().toISOString()
      });
    }

    const { error } = await supabase
      .from(tableName)
      .upsert(
        {
          prolific_id: prolificId,
          session_id: normalizedSession,
          use_memory: useMemory,
          task_type: taskType || 'weekend_planning',
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
