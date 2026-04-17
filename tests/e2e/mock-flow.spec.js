import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1beta/models/gemini-2.5-flash:generateContent?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Today I was with my big brother. We went to the zoo on Saturday morning at the city zoo. It was special because we saw a huge elephant. I felt so excited.',
                },
              ],
            },
          },
        ],
      }),
    });
  });

  await page.addInitScript(() => {
    const instantSpeechSynthesis = {
      speak(utterance) {
        setTimeout(() => utterance?.onend?.(), 0);
      },
      cancel() {},
      pause() {},
      resume() {},
      speaking: false,
      pending: false,
      paused: false,
      getVoices() {
        return [];
      },
    };

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      writable: true,
      value: instantSpeechSynthesis,
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test('mock flow advances from story to who on the first click', async ({ page }) => {
  await page.getByTestId('mock-toggle').click();
  await page.getByTestId('home-mic-button').click();

  await expect(page.getByText('Tell me about your story.')).toBeVisible();
  await expect(page.getByTestId('debug-step')).toHaveText('who', { timeout: 10000 });
  await expect(page.getByText('Who were you with today?')).toBeVisible();
});

test('mock flow can complete end to end', async ({ page }) => {
  await page.getByTestId('mock-toggle').click();
  await page.getByTestId('home-mic-button').click();

  await expect(page.getByRole('button', { name: /start writing/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Today I was with|Today was a fun day/i)).toBeVisible();
});
