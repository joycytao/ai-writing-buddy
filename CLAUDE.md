# Journal Buddy

A voice-first journaling app for elementary school children (K–5). Children answer guided questions about their day using their voice, and the app generates a grade-appropriate written journal entry using the Gemini API.

## Tech Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS 4
- **AI:** Google Gemini 2.5 Flash (REST, journal generation) + Gemini Live WebSocket (dialogue guidance)
- **Backend/Auth:** Firebase (Anonymous Auth + Firestore)
- **Testing:** Playwright (E2E)
- **Deployment:** Firebase Hosting

## Dev Commands

```bash
npm run dev          # Start Vite dev server (localhost:5173)
npm run build        # Production build → dist/
npm run lint         # ESLint
npm run test:e2e     # Playwright E2E tests (headless)
npm run test:e2e:ui  # Playwright tests with interactive UI
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the value:

```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

> The Firebase config in `src/App.jsx` is public (Firebase security rules enforce per-user access via anonymous auth).

## Project Structure

```
src/
  App.jsx          # Entire app — ~2100 lines (single-file architecture)
  App.css          # Global styles
  index.css        # Tailwind entry
  main.jsx         # React root
  firebase.config  # Firebase config reference (config is inline in App.jsx)
tests/
  e2e/
    mock-flow.spec.js  # Full journaling flow E2E test using mock mode
scripts/
  deploy.sh        # Firebase deploy helper
docs/
  ARCHITECTURE.md  # Detailed architecture reference
```

## Key Architecture Concepts

### Journaling Flow (State Machine)

The app guides children through a 7-step flow using the `step` state variable:

```
idle → story → who → what → when → where → why → how → generating → result
```

Each step captures a different part of the story (5W1H). Voice input is collected via the browser `SpeechRecognition` API with a 10-second silence timeout.

### Gemini Live WebSocket

`ensureGeminiLiveSession()` opens a persistent WebSocket to the Gemini Live API (`gemini-3.1-flash-live-preview`) on demand. The model acts as a **dialogue planner**, always responding by calling the `capture_story_step` function — never plain text.

Each guidance request has a 9-second timeout. If the WebSocket is unavailable, the app falls back to a local static question set.

### Grade-Specific Journal Generation

When all steps are captured, a REST call to `gemini-2.5-flash:generateContent` generates the journal. The prompt is adapted per grade level (Kindergarten through 5th grade) and optionally includes a parent-set custom expectation.

### Mock Mode

A `🧪 Mock` toggle (visible on localhost only) bypasses real voice input and Gemini Live with hardcoded responses, enabling fast E2E testing without API keys.

### Firebase

- **Auth:** Anonymous sign-in on load; all operations are user-scoped
- **Firestore path:** `artifacts/{appId}/users/{uid}/journals`
- **appId:** Reads `__app_id` global (set by Firebase Hosting) or defaults to `'writing-buddy-app'`

## Important Patterns

- **`isLocal`** gates dev-only UI (mock toggle, Gemini Live debug badge)
- **`liveStatus`** tracks WebSocket state: `'hidden' | 'idle' | 'connecting' | 'open' | 'fallback' | 'mock' | 'error'`
- **`isSpeaking`** blocks new listening while TTS is playing (uses `window.speechSynthesis`)
- **`answers`** — plain object keyed by step name, e.g. `{ who: "my dog", what: "ate my homework" }`
- Grade values: `'Kindergarten' | '1st' | '2nd' | '3rd' | '4th' | '5th'`
