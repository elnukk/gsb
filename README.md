# Chatbot Interface for Qualtrics Embed

A Next.js chatbot application for a research study where participants interact with an AI assistant. Integrates with Qualtrics surveys, OpenAI GPT-4, and Supabase.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Pipeline](#data-pipeline)
- [System Prompts](#system-prompts)
- [API Routes](#api-routes)
- [Database Tables](#database-tables)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│    Qualtrics    │────▶│   Next.js App    │────▶│   OpenAI    │
│    (Survey)     │     │  (Vercel hosted) │     │   GPT-4     │
└─────────────────┘     └────────┬─────────┘     └─────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    Supabase     │
                        │   (PostgreSQL)  │
                        └─────────────────┘
```

**Tech Stack:**
- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Next.js API Routes
- **AI**: OpenAI GPT-4 (temperature: 0.7)
- **Database**: Supabase (PostgreSQL)
- **Survey**: Stanford Qualtrics
- **Hosting**: Vercel

---

## Data Pipeline

### Flow: Qualtrics → Chatbot → Supabase

1. **User starts from Qualtrics survey** with embedded chatbot URL containing parameters:
   ```
   https://gsb-session1.vercel.app/?prolific_id=XXX&session_id=1&use_memory=0&task_type=structured
   ```

2. **URL Parameters passed to chatbot:**
   | Parameter | Values | Description |
   |-----------|--------|-------------|
   | `prolific_id` | string | Unique participant ID from Prolific |
   | `session_id` | `1` or `2` | Which session of the study |
   | `use_memory` | `0` or `1` | Whether to use memory from Session 1 (Session 2 only) |
   | `task_type` | `structured`, `exploratory` | Experimental condition |

3. **Each message exchange:**
   - User sends message → POST to `/api/chat`
   - System generates appropriate prompt based on session/task type
   - OpenAI returns response
   - **Full conversation history is upserted to Supabase** (appended, not overwritten)

4. **Data stored in Supabase:**
   ```javascript
   {
     prolific_id: "user123",
     session_id: "1",
     task_type: "structured",
     use_memory: "0",
     chat_memory: [
       { role: "assistant", content: "...", timestamp: "2024-..." },
       { role: "user", content: "...", timestamp: "2024-..." },
       // ... all messages
     ],
     updated_at: "2024-..."
   }
   ```

### Session 2 Memory Feature

When `session_id=2` and `use_memory=1`:
1. System fetches statements from `memory_statements` table for that `prolific_id`
2. Statements are injected into the system prompt
3. AI uses this context naturally in responses

---

## System Prompts

### Where to Find

All system prompts are defined in:
```
app/api/chat/route.js
```

Look for the `getSystemMessage()` function (starts around line 20).

### Session 1 Prompt (Default)

**Location:** `route.js` lines 38-63

The Session 1 prompt instructs the AI to:
1. Ask questions covering: schedule, energy patterns, values, constraints, format preferences
2. Co-create a Saturday plan with specific timing and activities
3. **6-reply turn limit**: On the 6th reply, deliver the final plan without asking more questions

### Session 2 Prompts

**Structured Task** (lines ~75-80):
- Helps create organized timetable
- Methodical, structured approach

**Exploratory Task** (lines ~82-90):
- Brainstorms new ideas
- Creative, open-ended questions
- Encourages thinking outside the box

### How to Modify Prompts

1. Open `app/api/chat/route.js`
2. Find the `getSystemMessage()` function
3. Edit the relevant template strings:

```javascript
// Session 1 prompt - edit this block:
if (sessionId === '1') {
  // ... modify the prompt text here
}

// Session 2 structured - edit this block:
if (taskType === 'structured') {
  // ... modify the prompt text here
}

// Session 2 exploratory - edit this block:
if (taskType === 'exploratory') {
  // ... modify the prompt text here
}
```

4. Deploy changes to Vercel

### Memory Augmentation

When memory is enabled, this is appended to the system prompt:
```
This is what you know about the user from a previous conversation:
- [statement 1]
- [statement 2]
...

Use this information naturally in your responses when relevant.
Do not explicitly mention that you have this information unless asked.
```

---

## API Routes

### POST `/api/chat`

**File:** `app/api/chat/route.js`

Main conversation endpoint.

**Request:**
```javascript
{
  messages: [{ role: "user", content: "..." }, ...],
  prolific_id: "string",
  session_id: "1" | "2",
  use_memory: "0" | "1",
  task_type: "structured" | "exploratory"
}
```

**Response:**
```javascript
{
  message: "Assistant's response text"
}
```

### GET `/api/get-task`

**File:** `app/api/get-task/route.js`

Retrieves task type from Session 1 for Session 2 continuity.

**Request:**
```
GET /api/get-task?prolific_id=XXX
```

**Response:**
```javascript
{
  task_type: "structured" | "exploratory" | "default"
}
```

---

## Database Tables

### Supabase Tables

| Table | Purpose |
|-------|---------|
| `chat_sessions` | Session 1 conversation storage |
| `chat_sessions_2` | Session 2 conversation storage |
| `memory_statements` | Extracted memory points for Session 2 |

### Schema: `chat_sessions` / `chat_sessions_2`

| Column | Type | Description |
|--------|------|-------------|
| `prolific_id` | text (PK) | Participant identifier |
| `session_id` | text (PK) | Session number |
| `task_type` | text | Experimental condition |
| `use_memory` | text | Memory feature flag |
| `chat_memory` | jsonb | Array of message objects |
| `updated_at` | timestamp | Last update time |

### Schema: `memory_statements`

| Column | Type | Description |
|--------|------|-------------|
| `prolific_id` | text | Participant identifier |
| `statement` | text | Memory statement extracted from Session 1 |

---

## Environment Variables

Required environment variables (set in Vercel dashboard):

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase (Public - used by client)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase (Server - used by API routes)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Local Development

### Setup

1. Clone the repo:
   ```bash
   git clone <repo-url>
   cd gsb
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` with required environment variables (see above)

4. Run development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

### Testing with Parameters

Test locally with URL parameters:
```
http://localhost:3000?prolific_id=test123&session_id=1&task_type=structured&use_memory=0
```

---

## Deployment

Deployed on Vercel. Pushes to `main` trigger automatic deployments.

**Production URLs:**
- `https://gsb-gray.vercel.app` (main)
- `https://gsb-session1.vercel.app` (session 1 specific)

### CORS Allowed Origins

The API allows requests from:
- `https://stanforduniversity.qualtrics.com`
- `https://gsb-gray.vercel.app`
- `https://gsb-session1.vercel.app`
- `http://localhost:3000`

To add new origins, edit the `allowedOrigins` array in `app/api/chat/route.js`.

---

## File Structure

```
gsb/
├── app/
│   ├── api/
│   │   ├── chat/route.js        # Main chat endpoint + system prompts
│   │   └── get-task/route.js    # Task type retrieval
│   ├── ChatbotExperiment.css    # UI styling
│   ├── layout.js                # Root layout
│   └── page.js                  # Chat UI component
├── lib/
│   ├── supabase.js              # Client-side Supabase config
│   └── supabaseServer.js        # Server-side Supabase config
├── package.json
└── README.md
```

---

## Quick Reference

| Task | File | Location |
|------|------|----------|
| Change system prompts | `app/api/chat/route.js` | `getSystemMessage()` function |
| Modify chat UI | `app/page.js` | React component |
| Change styling | `app/ChatbotExperiment.css` | CSS file |
| Add CORS origins | `app/api/chat/route.js` | `allowedOrigins` array |
| Change AI model/temperature | `app/api/chat/route.js` | OpenAI API call |
| Modify database logic | `app/api/chat/route.js` | Supabase upsert section |
