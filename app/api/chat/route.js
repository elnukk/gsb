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

// Returns the correct seed message for Session 2 based on task type and memory condition
const getSeedMessage = (taskType, useMemoryOn) => {
  if (taskType === 'structured') {
    return useMemoryOn
      ? "Welcome back! I'm here to help you build a 5-day dinner plan for the upcoming week. Is there anything that's changed about your cooking situation since we last spoke?"
      : "Hi! I'm here to help you build a 5-day dinner plan for the upcoming week. Tell me a bit about your cooking situation — who are you cooking for, and are there any dietary restrictions I should know about?";
  }
  if (taskType === 'exploratory') {
    return useMemoryOn
      ? "Welcome back! I'm here to help you discover some new food experiences. Is there anything that's changed about what you've been cooking since we last spoke?"
      : "Hi! I'm here to help you discover some new food experiences. Tell me a bit about what you've been cooking lately — what's been feeling stale or repetitive?";
  }
  return null;
};

const getSystemMessage = async (sessionId, useMemory, prolificId, messages, taskType) => {
  const normalizedSession = String(sessionId).trim();
  const useMemoryOn = String(useMemory).trim() === '1';
  const normalizedTaskType = String(taskType || '').trim().toLowerCase();

  let systemMessage = '';

  if (normalizedSession === '1') {
    systemMessage = `You are a warm, curious assistant getting to know the user's relationship with food and cooking. Your goal is to learn as much as possible about their food life — not to produce any plan or recommendations.

Explore these areas through natural conversation, not as a checklist:
- Cooking habits: how often they cook, skill level, how they feel about cooking (love it, tolerate it, dread it)
- Household: who they cook for, how many people, ages of kids if relevant
- Constraints: dietary restrictions, allergies, intolerances, foods they hate
- Kitchen setup: equipment they have or lack, pantry staples they keep on hand
- Time and schedule: how much time they have for cooking on weekdays vs. weekends, what time dinner needs to happen
- Budget: rough weekly grocery budget, where they shop
- Preferences: favorite cuisines, comfort foods, foods they eat too often and are bored of
- Past experiences: recipes or meals they've tried and loved, ones that flopped, cuisines they're curious about but haven't tried
- Goals or frustrations: anything they wish were different about how they eat or cook

Ask genuine follow-up questions. If they mention something in passing — e.g., "I don't really have time" — dig into it. Aim for 8-12 exchanges. Keep the tone conversational, not clinical. Do not produce any meal plan, recipe, or recommendation. End by thanking them for sharing.`.trim();
    return systemMessage;
  }

  if (normalizedTaskType === 'structured') {
    systemMessage = `You are a helpful assistant. The user wants to build a concrete 5-day dinner plan for the upcoming week, with specific recipes, a consolidated grocery list, and a prep schedule.

Make sure you understand the user's situation before producing the plan — their dietary restrictions, household size, time constraints, budget, and kitchen setup. Ask questions if you need information you don't already have.

Produce a 5-day dinner plan. For each day, include: the meal name, estimated prep/cook time, a brief ingredient list, and a one-sentence rationale for why it fits their constraints. Then provide a consolidated grocery list and a short weekend prep guide for anything that can be done in advance.`.trim();
  } else if (normalizedTaskType === 'exploratory') {
    systemMessage = `You are a creative, encouraging assistant. The user wants to discover new food experiences — unfamiliar cuisines, unexpected ingredients, cooking techniques they haven't tried, or completely new ways of thinking about meals.

Make sure you understand what the user is looking for before suggesting ideas — their current food mood, what feels stale, how adventurous they're feeling, and whether they're cooking solo or with others. Ask questions if you need information you don't already have.

Suggest 6 diverse ideas organized into 2-3 thematic clusters (e.g., "Flavor Adventures," "Hands-On Experiments," "Social Food Experiences"). Include at least 2 ideas that are genuinely unexpected — things most people wouldn't think of on their own. Ask the user which direction excites them before going deeper.`.trim();
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

      if (normalizedTaskType === 'structured') {
        systemMessage = `You are a helpful assistant. The user wants to build a concrete 5-day dinner plan for the upcoming week, with specific recipes, a consolidated grocery list, and a prep schedule.

Here is what you know about the user from a previous conversation:
${memoryStatements}

You MUST use this information naturally in your responses. When you reference something you know, do so explicitly — e.g., "Since you mentioned you get home at 6:30 and need dinner by 7, I've kept everything under 30 minutes."

Make sure you understand the user's situation before producing the plan — their dietary restrictions, household size, time constraints, budget, and kitchen setup. Ask questions if you need information you don't already have.

Produce a 5-day dinner plan. For each day, include: the meal name, estimated prep/cook time, a brief ingredient list, and a one-sentence rationale for why it fits their constraints. Then provide a consolidated grocery list and a short weekend prep guide for anything that can be done in advance.`.trim();
      } else if (normalizedTaskType === 'exploratory') {
        systemMessage = `You are a creative, encouraging assistant. The user wants to discover new food experiences — unfamiliar cuisines, unexpected ingredients, cooking techniques they haven't tried, or completely new ways of thinking about meals.

Here is what you know about the user from a previous conversation:
${memoryStatements}

You MUST use this information naturally in your responses. When you reference something you know, do so explicitly — e.g., "You mentioned you mostly cook Italian — what if we went in a completely different direction?"

Make sure you understand what the user is looking for before suggesting ideas — their current food mood, what feels stale, how adventurous they're feeling, and whether they're cooking solo or with others. Ask questions if you need information you don't already have.

Suggest 6 diverse ideas organized into 2-3 thematic clusters (e.g., "Flavor Adventures," "Hands-On Experiments," "Social Food Experiences"). Include at least 2 ideas that are genuinely unexpected — things most people wouldn't think of on their own. Ask the user which direction excites them before going deeper.`.trim();
      } else {
        systemMessage += `

This is what you know about the user from a previous conversation:
${memoryStatements}

Use this information naturally in your responses when relevant. Do not explicitly mention that you have this information unless asked.`.trim();
      }
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
    const useMemoryOn = useMemory === '1';
    const taskType = String(task_type || '').trim().toLowerCase();

    const tableName = normalizedSession === '2' ? 'chat_sessions_2' : 'chat_sessions';

    // For Session 2, inject the seed message as the first assistant turn
    // if no messages have been exchanged yet (i.e. this is the opening request)
    const isOpening = normalizedSession === '2' && (!messages || messages.length === 0);

    if (isOpening) {
      const seedMessage = getSeedMessage(taskType, useMemoryOn);

      if (seedMessage) {
        // Persist the seed message as the first assistant turn
        const { data: existingData } = await supabase
          .from(tableName)
          .select('chat_memory')
          .eq('prolific_id', prolificId)
          .eq('session_id', normalizedSession)
          .single();

        const allMessages = existingData?.chat_memory || [];

        // Only insert seed if the conversation is truly empty
        if (allMessages.length === 0) {
          allMessages.push({
            role: 'assistant',
            content: seedMessage,
            timestamp: new Date().toISOString()
          });

          await supabase
            .from(tableName)
            .upsert(
              {
                prolific_id: prolificId,
                session_id: normalizedSession,
                use_memory: useMemory,
                task_type: taskType || 'unknown',
                chat_memory: allMessages,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'prolific_id,session_id' }
            );
        }

        return NextResponse.json(
          { message: seedMessage },
          { headers: getCorsHeaders(origin) }
        );
      }
    }

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