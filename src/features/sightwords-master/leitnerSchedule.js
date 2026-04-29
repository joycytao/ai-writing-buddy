const clampBox = (value) => {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, Math.round(numeric)));
};

const isoWeekNumber = (date) => {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
};

export const isLeitnerBoxDueToday = (box, date = new Date()) => {
  const currentBox = clampBox(box);
  const day = date.getDay();
  const dateOfMonth = date.getDate();

  if (currentBox === 1) return true;
  if (currentBox === 2) return day === 1 || day === 4;
  if (currentBox === 3) return day === 5;
  if (currentBox === 4) return day === 5 && (isoWeekNumber(date) % 2 === 0);
  if (currentBox === 5) return dateOfMonth === 20;

  return false;
};

export const pickLeitnerWordsForToday = (items = [], date = new Date()) => {
  return (items || []).filter((item) => isLeitnerBoxDueToday(item?.reviewFrequency, date));
};

export const resolvePracticeDate = (mockToday = '') => {
  const raw = String(mockToday || '').trim();
  if (!raw) return new Date();

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};
