export const getLandingIntent = (text = '') => {
  const normalized = text.toLowerCase().trim();

  if (/(writing journal|writing|journal|story time|start writing)/.test(normalized)) return 'writing-journal';
  if (/(spelling champion|spelling|spell)/.test(normalized)) return 'spelling-champion';
  if (/(sightwords master|sight words|sightword|sight word)/.test(normalized)) return 'sightwords-master';
  if (/(識字高手|chinese|hanzi|character practice)/.test(normalized)) return 'chinese-literacy';
  if (/(settings|set up|setup)/.test(normalized)) return 'setup';

  return null;
};
