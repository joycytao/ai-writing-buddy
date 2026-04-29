import { test, expect } from '@playwright/test';
import { isLeitnerBoxDueToday, pickLeitnerWordsForToday, resolvePracticeDate } from '../../src/features/sightwords-master/leitnerSchedule';

test.describe('Leitner weekday scheduling', () => {
  test('loads box 1 and 2 on Monday', async () => {
    const monday = new Date('2026-04-20T10:00:00');
    const dueBoxes = [1, 2, 3, 4, 5].filter((box) => isLeitnerBoxDueToday(box, monday));
    expect(dueBoxes).toEqual([1, 2, 5]);
  });

  test('loads only box 1 on Tuesday (plus box 5 only on day 20)', async () => {
    const tuesdayNot20th = new Date('2026-04-21T10:00:00');
    const dueBoxes = [1, 2, 3, 4, 5].filter((box) => isLeitnerBoxDueToday(box, tuesdayNot20th));
    expect(dueBoxes).toEqual([1]);
  });

  test('filters words by box for a specific date', async () => {
    const monday = new Date('2026-04-13T10:00:00');
    const words = [
      { word: 'a', reviewFrequency: 1 },
      { word: 'about', reviewFrequency: 2 },
      { word: 'after', reviewFrequency: 3 },
      { word: 'again', reviewFrequency: 4 },
      { word: 'all', reviewFrequency: 5 },
    ];

    const dueWords = pickLeitnerWordsForToday(words, monday).map((item) => item.word);
    expect(dueWords).toEqual(['a', 'about']);
  });

  test('supports mock date parsing fallback', async () => {
    const valid = resolvePracticeDate('2026-04-21');
    expect(Number.isNaN(valid.getTime())).toBeFalsy();

    const invalid = resolvePracticeDate('not-a-date');
    expect(Number.isNaN(invalid.getTime())).toBeFalsy();
  });
});
