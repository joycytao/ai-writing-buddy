import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = 'en-US';
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
      }

      start() {
        const queue = Array.isArray(window.__mockSpeechQueue) ? window.__mockSpeechQueue : [];
        const next = queue.shift();
        window.__mockSpeechQueue = queue;

        setTimeout(() => {
          if (!next) {
            this.onerror?.({ error: 'no-speech' });
            this.onend?.();
            return;
          }

          this.onresult?.({
            results: [[{ transcript: next }]],
          });
          this.onend?.();
        }, 10);
      }

      stop() {
        this.onend?.();
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    });

    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    });

    window.__mockSpeechQueue = [];
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test('reading tutor is visible on landing and supports worksheet scan entrypoint', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Reading Tutor/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /Reading Tutor/i }).first().click();
  await expect(page.getByRole('heading', { name: /Reading Tutor/i })).toBeVisible();

  await page.getByRole('button', { name: /Open reading tutor menu/i }).click();
  const scanButton = page.getByRole('button', { name: /Scan Worksheet/i });
  await expect(scanButton).toBeVisible();
  await scanButton.click();
  await expect(page.getByRole('heading', { name: /Reading Tutor/i })).toBeVisible();
});
