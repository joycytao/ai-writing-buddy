# Journal Buddy

A voice-first journaling app for elementary school children (K–5). Children answer guided 5W1H questions about their day by speaking, and the app generates a grade-appropriate journal entry using Google Gemini.

## Features

- **Voice-guided journaling** — children speak their story; no typing required
- **Grade-adaptive writing** — output is tailored from simple Kindergarten sentences to structured 5th-grade paragraphs
- **Gemini Live dialogue** — a persistent WebSocket session acts as a warm, child-friendly interviewer
- **Offline-resilient** — falls back to local question prompts if the AI is unavailable
- **Firebase persistence** — journals saved to Firestore under anonymous user accounts
- **Mock mode** — fast local testing without API keys (localhost only)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set your Gemini API key
cp .env.example .env
# Edit .env and add your VITE_GEMINI_API_KEY

# 3. Run dev server
npm run dev
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright E2E tests (headless) |
| `npm run test:e2e:ui` | Playwright tests with interactive UI |
| `bash scripts/deploy.sh` | Deploy to Firebase Hosting |

## Tech Stack

- **React 19** + **Vite 8** + **Tailwind CSS 4**
- **Firebase** (Anonymous Auth + Firestore + Hosting)
- **Google Gemini 2.5 Flash** (journal generation via REST)
- **Gemini Live** `gemini-3.1-flash-live-preview` (dialogue guidance via WebSocket)
- **Playwright** (E2E testing)

## Project Structure

```
journal-buddy/
├── CLAUDE.md                   # Claude AI instructions for this project
├── .claude/
│   ├── settings.json           # Claude permissions
│   └── skills/review/SKILL.md  # Code review skill
├── .claudeignore               # Files excluded from Claude context
├── docs/
│   └── ARCHITECTURE.md         # Detailed architecture reference
├── scripts/
│   └── deploy.sh               # Firebase deploy helper
├── src/
│   ├── App.jsx                 # Entire app (~2100 lines)
│   ├── main.jsx                # React root
│   └── index.css               # Tailwind entry
└── tests/
    └── e2e/
        └── mock-flow.spec.js   # Full journaling flow E2E test
```

## Documentation

- [Architecture deep-dive](docs/ARCHITECTURE.md) — state machine, Gemini Live WebSocket, Firebase schema, mock mode
