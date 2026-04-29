const dayNameToNumber = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
};

const normalizeDayNumber = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (dayNameToNumber[raw]) return dayNameToNumber[raw];
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(1, Math.min(7, Math.round(numeric)));
};

const buildWeekDayKey = (weekNumber, dayNumber) => `week-${weekNumber}-day-${dayNumber}`;

const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildTargetWeekDayRegex = (weekNumber, dayNumber) => {
  const week = Number(weekNumber || 1);
  const day = Number(dayNumber || 1);
  const safeWeek = Number.isFinite(week) ? Math.max(1, Math.min(60, Math.round(week))) : 1;
  const safeDay = Number.isFinite(day) ? Math.max(1, Math.min(7, Math.round(day))) : 1;

  const weekPattern = `\\bweek\\b[^\\n\\r\\d]{0,12}${escapeRegExp(String(safeWeek))}\\b`;
  const dayPattern = `\\bday\\b[^\\n\\r\\da-z]{0,12}${escapeRegExp(String(safeDay))}\\b`;
  return new RegExp(`${weekPattern}[\\s\\S]{0,220}?${dayPattern}|${dayPattern}[\\s\\S]{0,220}?${weekPattern}`, 'i');
};

const getSectionBoundsAroundIndex = (source = '', index = 0) => {
  const markers = [];
  const weekHeader = /\bweek\b[^\n\r]{0,40}?\d{1,2}\b/gi;
  let matched = weekHeader.exec(source);
  while (matched) {
    markers.push(matched.index);
    matched = weekHeader.exec(source);
  }

  if (!markers.length) {
    const start = Math.max(0, index - 2200);
    const end = Math.min(source.length, index + 9000);
    return { start, end };
  }

  const sorted = markers.sort((a, b) => a - b);
  let start = 0;
  let end = source.length;

  for (let i = 0; i < sorted.length; i += 1) {
    const marker = sorted[i];
    if (marker <= index) {
      start = marker;
      end = sorted[i + 1] || source.length;
    }
  }

  if (end - start < 1200) {
    end = Math.min(source.length, start + 9000);
  }

  return { start, end };
};

export const extractWorksheetSectionForWeekDay = ({ text = '', weekNumber, dayNumber }) => {
  const source = String(text || '');
  if (!source.trim()) return '';

  const matcher = buildTargetWeekDayRegex(weekNumber, dayNumber);
  const hit = matcher.exec(source);
  if (!hit) return '';

  const bounds = getSectionBoundsAroundIndex(source, hit.index);
  return source.slice(bounds.start, bounds.end).trim();
};

const parseQuestionOptions = (questionBody = '') => {
  const optionRegex = /(?:^|\n)\s*([A-D])(?:\)|\.|:)\s+([^\n]+)/gi;
  const options = [];
  let match = optionRegex.exec(questionBody);
  while (match) {
    options.push({
      label: match[1].toUpperCase(),
      text: String(match[2] || '').trim(),
    });
    match = optionRegex.exec(questionBody);
  }
  return options;
};

const parseQuestions = (sectionText = '') => {
  const questions = [];
  const questionRegex = /(?:^|\n)\s*(\d{1,2})[\).]\s+([\s\S]*?)(?=(?:\n\s*\d{1,2}[\).]\s+)|$)/g;
  let match = questionRegex.exec(sectionText);

  while (match) {
    const questionNumber = Number(match[1]);
    const body = String(match[2] || '').trim();
    const firstLine = body.split('\n')[0]?.trim() || body;
    const options = parseQuestionOptions(body);

    questions.push({
      id: `q-${questionNumber}`,
      questionNumber,
      stem: firstLine,
      options,
      correctOptionLabel: null,
    });

    match = questionRegex.exec(sectionText);
  }

  return questions.slice(0, 3);
};

const extractStory = (sectionText = '') => {
  const lines = String(sectionText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const firstQuestionIdx = lines.findIndex((line) => /^\d{1,2}[\).]\s+/.test(line));
  const storyLines = firstQuestionIdx >= 0 ? lines.slice(0, firstQuestionIdx) : lines;

  if (!storyLines.length) return '';

  const maybeTitle = storyLines[0];
  const body = storyLines.slice(1).join(' ').trim();
  if (!body) return maybeTitle;
  return `${maybeTitle}\n${body}`.trim();
};

export const parseWorksheetDocument = (text = '', options = {}) => {
  const fallbackWeek = Math.max(1, Number(options?.targetWeek || 1));
  const fallbackDay = Math.max(1, Number(options?.targetDay || 1));
  const fallbackKey = buildWeekDayKey(fallbackWeek, fallbackDay);
  const source = String(text || '');
  if (!source.trim()) {
    return { units: [], byWeekDay: {}, warnings: ['Worksheet text is empty.'] };
  }

  const weekHeaderRegex = /\bweek\b[^\n\r\d]{0,14}(\d{1,2})[^\n\r]{0,220}?\bday\b[^\n\r\d]{0,14}(\d|monday|tuesday|wednesday|thursday|friday)\b/gi;
  const headers = [];
  let headerMatch = weekHeaderRegex.exec(source);

  while (headerMatch) {
    headers.push({
      index: headerMatch.index,
      weekNumber: Number(headerMatch[1]),
      dayNumber: normalizeDayNumber(headerMatch[2]),
      marker: headerMatch[0],
    });
    headerMatch = weekHeaderRegex.exec(source);
  }

  if (!headers.length) {
    const fallbackQuestions = parseQuestions(source);
    return {
      units: [{
        key: fallbackKey,
        weekNumber: fallbackWeek,
        dayNumber: fallbackDay,
        title: 'Reading Worksheet',
        story: extractStory(source),
        questions: fallbackQuestions,
      }],
      byWeekDay: {
        [fallbackKey]: {
          key: fallbackKey,
          weekNumber: fallbackWeek,
          dayNumber: fallbackDay,
          title: 'Reading Worksheet',
          story: extractStory(source),
          questions: fallbackQuestions,
        },
      },
      warnings: ['Could not detect explicit week/day markers. Using fallback worksheet section.'],
    };
  }

  const dedupedHeaders = headers.filter((header, idx) => {
    if (idx === 0) return true;
    const prev = headers[idx - 1];
    const sameWeekDay = prev.weekNumber === header.weekNumber && prev.dayNumber === header.dayNumber;
    const tooClose = Math.abs(prev.index - header.index) < 80;
    return !(sameWeekDay && tooClose);
  });

  const units = dedupedHeaders.map((header, idx) => {
    const start = header.index;
    const end = dedupedHeaders[idx + 1]?.index || source.length;
    const section = source.slice(start, end);
    const titleLine = section.split('\n').map((line) => line.trim()).find((line) => line && !/week\s*\d+/i.test(line)) || `Week ${header.weekNumber} Day ${header.dayNumber || 1}`;
    const weekNumber = header.weekNumber || 1;
    const dayNumber = header.dayNumber || 1;

    return {
      key: buildWeekDayKey(weekNumber, dayNumber),
      weekNumber,
      dayNumber,
      title: titleLine,
      story: extractStory(section),
      questions: parseQuestions(section),
    };
  });

  const byWeekDay = Object.fromEntries(units.map((unit) => [unit.key, unit]));

  return {
    units,
    byWeekDay,
    warnings: [],
  };
};

export const getWorksheetUnitForDate = ({ worksheetData, weekNumber, dayNumber }) => {
  const safeWeek = Math.max(1, Number(weekNumber || 1));
  const safeDay = Math.max(1, Number(dayNumber || 1));
  const key = buildWeekDayKey(safeWeek, safeDay);

  if (worksheetData?.byWeekDay?.[key]) return worksheetData.byWeekDay[key];
  return worksheetData?.units?.[0] || null;
};
