# Code Review Skill

A structured workflow for reviewing code changes in this repository.

## When to Use

Apply this skill when asked to review a PR, diff, or specific file for quality, security, or correctness.

---

## Review Checklist

### 1. Correctness
- [ ] Does the code do what it claims to do?
- [ ] Are edge cases handled (empty input, null/undefined, network failure)?
- [ ] Are async operations awaited correctly?
- [ ] Are React state updates batched or sequenced correctly?

### 2. Security (OWASP Top 10)
- [ ] No secrets or API keys hardcoded in source (check against `.env.example`)
- [ ] No `eval()`, `dangerouslySetInnerHTML`, or unescaped user input rendered as HTML
- [ ] Firebase security rules enforced — never trust client-side auth alone for data access
- [ ] No sensitive data logged to the console in production paths
- [ ] User input is validated/sanitized before being sent to AI APIs

### 3. Performance
- [ ] No unnecessary re-renders (missing `useCallback`, `useMemo`, or dependency array issues)
- [ ] No memory leaks (event listeners, timers, and WebSocket connections cleaned up in `useEffect` returns)
- [ ] Large computations not done on every render
- [ ] Firestore reads are minimal and not triggered in a loop

### 4. Maintainability
- [ ] Functions are small and single-purpose
- [ ] Variable and function names are descriptive
- [ ] No dead code or commented-out blocks left in
- [ ] Shared constants defined once at the module level

### 5. Accessibility
- [ ] Interactive elements have accessible labels (`aria-label`, `aria-describedby`)
- [ ] Focus management is correct (modals trap focus; dialogs return focus on close)
- [ ] Color contrast meets WCAG AA minimums
- [ ] Voice-dependent flows have a non-voice fallback

### 6. Testing
- [ ] New user-facing flows have or update corresponding Playwright E2E tests
- [ ] Mock mode still works end-to-end after the change

---

## Review Output Format

Provide feedback in this structure:

```
## Summary
One-paragraph description of what the change does.

## Issues

### 🔴 Blocker
<issue> — <file>:<line>
Suggested fix: ...

### 🟡 Warning
<issue> — <file>:<line>
Suggestion: ...

### 🟢 Suggestion
<nit or improvement> — optional

## Verdict
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```

---

## Project-Specific Notes

- `src/App.jsx` is a single large file — focus review on the specific functions modified, not the whole file
- Mock mode (`isMockMode`) must remain functional for CI; don't break mock paths
- The Firebase config object in `App.jsx` is intentionally public — this is safe per Firebase's client-side auth model
- Gemini Live WebSocket has a 9-second timeout and local fallback — changes to timing should be tested manually
