# Architecture Reference

## Overview

Journal Buddy is a single-page React application. All app logic lives in `src/App.jsx` (~2100 lines). There is no backend server — the app talks directly to Firebase and Gemini APIs from the browser.

```
Browser
  ├── React App (src/App.jsx)
  │     ├── Firebase SDK → Firestore (journal persistence)
  │     ├── Firebase SDK → Anonymous Auth
  │     ├── Gemini Live WebSocket → Dialogue guidance
  │     ├── Gemini REST API → Journal text generation
  │     ├── Web Speech API → Voice input
  │     └── Web Speech Synthesis → TTS output
  └── Firebase Hosting (static file serving)
```

---

## State Machine: Journaling Flow

The core UX is a linear guided flow driven by the `step` state variable.

```
'idle'
  ↓  (user presses mic on home screen)
'story'       ← "Tell me about your day!"
  ↓
'who'         ← "Who was with you?"
  ↓
'what'        ← "What did you do?"
  ↓
'when'        ← "When did it happen?"
  ↓
'where'       ← "Where were you?"
  ↓
'why'         ← "Why was it special?"
  ↓
'how'         ← "How did you feel?"
  ↓
'generating'  ← Calls Gemini REST API
  ↓
'result'      ← Shows generated journal + save option
```

The `answers` object accumulates responses: `{ story: "...", who: "...", ... }`.

When `isConfirming` is `true`, the app asks the child to confirm or redo their last answer before advancing.

---

## Voice Input Pipeline

```
User speaks
  → Browser SpeechRecognition API
  → onresult: transcript string
  → handleVoiceInput(transcript)
  → (if Gemini Live available) requestGuidedStep(transcript)
       → Gemini Live WebSocket (function call response)
       → extract nextStep, question, capturedAnswer
  → (fallback) local step logic
  → speak(question) via window.speechSynthesis
  → advance step
```

**Silence timeout:** 10 seconds of silence stops the mic automatically.

**SpeechRecognition is re-instantiated** in a `useEffect` that depends on `[step, isConfirming, answers, view]` — this ensures the callback closure always has fresh state.

---

## Gemini Live WebSocket

**Model:** `gemini-3.1-flash-live-preview`

**Connection lifecycle:**
1. `ensureGeminiLiveSession()` — lazy-opens WebSocket on first need
2. Session is kept alive for the duration of the journaling flow
3. Closed and nulled on error or when the user leaves the journaling view

**Function calling:**
The model is constrained to only respond via the `capture_story_step` function (never plain text). The function schema includes:
- `requestId` — echoed back to match requests to responses
- `nextStep` — which step to advance to
- `question` — child-friendly prompt to speak next
- `shouldConfirm` — whether to ask for confirmation
- `capturedAnswer` — cleaned version of the child's answer

**Timeout + fallback:**
Each guidance request has a 9-second timeout (`livePendingGuidanceRef`). If the WebSocket doesn't respond in time, the app falls back to a local static question map.

**`liveStatus` values:**

| Value | Meaning |
|-------|---------|
| `'hidden'` | Not on localhost — debug UI not shown |
| `'idle'` | Ready but not yet connected |
| `'connecting'` | WebSocket opening |
| `'open'` | Connected and active |
| `'fallback'` | No API key — using local questions |
| `'mock'` | Mock mode enabled |
| `'error'` | WebSocket error (detail in `liveErrorDetail`) |

---

## Journal Generation (REST)

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`

**Input:** All captured `answers` + grade level + optional `customExpectation`

**Grade-specific prompt variations:**
- Kindergarten/1st: Simple sentences, no punctuation requirements
- 2nd/3rd: Paragraph form, basic punctuation
- 4th/5th: Multi-paragraph, richer vocabulary, introduction/conclusion

**Image generation:** Optional call to Gemini image generation API. Result stored in `journalImage` state.

---

## Firebase

### Anonymous Auth
`signInAnonymously()` is called on mount. All Firestore writes are user-scoped via the anonymous UID.

### Firestore Schema

```
artifacts/
  {appId}/
    users/
      {uid}/
        journals/
          {docId}/
            text: string
            grade: string
            answers: object
            imageUrl: string | null
            createdAt: serverTimestamp
```

`appId` is read from the `__app_id` global injected by Firebase Hosting, or defaults to `'writing-buddy-app'` for local dev.

---

## Mock Mode

Enabled via a `🧪 Mock` toggle visible only on `localhost`. When active:
- `SpeechRecognition` is not started — `isListening` is set directly
- `triggerMockInput()` fires after a short delay with hardcoded answers
- Gemini Live WebSocket is bypassed entirely
- `handleSpellAssistPress()` is auto-triggered 300ms after the journaling view loads

Mock mode is used by the Playwright E2E tests in `tests/e2e/mock-flow.spec.js`.

---

## Views

| `view` value | Description |
|---|---|
| `'home'` | Landing screen — mic button, grade badge, mock toggle (localhost only) |
| `'setup'` | Grade selector slider, custom expectation modal |
| `'journaling'` | Active guided flow — step progress, listening indicator, spell assist |

The result (generated journal) is shown inline within the `'journaling'` view when `step === 'result'`.

---

## Key State Variables

| Variable | Type | Purpose |
|---|---|---|
| `view` | string | Which screen is shown |
| `step` | string | Current journaling step |
| `answers` | object | Captured answers per step |
| `isListening` | bool | Mic is active |
| `isSpeaking` | bool | TTS is playing (blocks new listening) |
| `isConfirming` | bool | In answer confirmation sub-flow |
| `isMockMode` | bool | Mock mode enabled |
| `liveStatus` | string | Gemini Live WebSocket state |
| `generatedJournal` | string | Final journal text |
| `grade` | string | Selected grade level |
| `customExpectation` | string | Parent-set writing goal |

---

## Build & Deploy

```bash
npm run build          # Outputs to dist/
bash scripts/deploy.sh # firebase deploy (hosting only)
```

Firebase config: `firebase.json` and `.firebaserc` at root.
