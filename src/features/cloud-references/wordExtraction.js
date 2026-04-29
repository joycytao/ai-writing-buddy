export const extractUniquePracticeWords = (input = '') => {
  const latinWords = input
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  const cjkCharacters = (input.match(/[\u3400-\u9FFF]/g) || [])
    .map((char) => char.trim())
    .filter(Boolean);

  return [...new Set([...latinWords, ...cjkCharacters])];
};
