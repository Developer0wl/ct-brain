# C&T Brain — Setup Guide

## Prerequisites

- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project with pgvector enabled
- An [Anthropic API key](https://console.anthropic.com)
- An [OpenAI API key](https://platform.openai.com) (for embeddings)

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

You need:
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase project settings
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `OPENAI_API_KEY` — for text-embedding-3-small
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — same as above (Vite exposes these to the browser)

---

## 2. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. In the SQL editor, run the migration:

```sql
-- Copy and paste the contents of supabase/migrations/001_init.sql
```

3. Go to **Authentication → Settings** and disable "Enable email confirmations" for the prototype (so Kishor can sign in immediately after you create his account)

4. Create the first admin user:
   - Go to **Authentication → Users → Add user**
   - Enter email + password
   - After creation, run this SQL to make them admin:
     ```sql
     UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
     ```

---

## 3. Install Dependencies

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install

# Python scripts
cd ../scripts && pip install -r requirements.txt
```

---

## 4. Run Locally

Open two terminals:

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Visit http://localhost:5173 and sign in.

---

## 5. Add Knowledge

### Option A — Python CLI (recommended for PDF/DOCX)

```bash
cd scripts

# Single file
python ingest.py --file path/to/document.pdf

# Entire folder
python ingest.py --dir path/to/docs/

# Preview without saving
python ingest.py --file doc.pdf --dry-run
```

### Option B — Admin Panel (TXT files + manual FAQ)

1. Sign in as admin
2. Click **Knowledge Base** in the header
3. Use **Upload** tab for .txt files
4. Use **Add FAQ** tab to type Q&A pairs directly

---

## 6. Week 1 Test (Kishor's Voice Check)

Once the knowledge base has some entries, test these 5 questions:

1. What are C&T's core service lines?
2. What does C&T do for Healthcare clients?
3. What is Enable AI?
4. What are C&T's core values?
5. How does C&T approach a new client engagement?

At least 4 of 5 answers should feel grounded and representative of how Kishor would answer.

---

## Project Structure

```
C&T_AI/
├── client/              React + Vite + Tailwind frontend
│   └── src/
│       ├── pages/       LoginPage, ChatPage, AdminPage
│       ├── lib/         supabase.ts, api.ts
│       └── App.tsx
├── server/              Express + TypeScript backend
│   └── src/
│       ├── config/      systemPrompt.ts (C&T Brain persona)
│       ├── middleware/  auth.ts
│       ├── routes/      chat.ts, knowledge.ts
│       └── services/    claude.ts, rag.ts, embeddings.ts
├── scripts/             Python document ingestion
│   ├── ingest.py
│   └── requirements.txt
├── supabase/
│   └── migrations/      001_init.sql (pgvector schema)
└── .env.example
```

---

## Architecture: How a Query Flows

```
User types question
       ↓
Frontend (ChatPage) → POST /api/chat with message history
       ↓
Server: embed the question (OpenAI text-embedding-3-small)
       ↓
pgvector cosine search → top 5 relevant knowledge chunks
       ↓
Chunks + C&T system prompt + question → Claude claude-sonnet-4-6
       ↓
Streamed response back to frontend (SSE)
       ↓
Chat bubble with source attribution
```
