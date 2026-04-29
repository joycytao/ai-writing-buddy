import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { extractUniquePracticeWords } from './wordExtraction';
import { downloadGoogleDriveFile, listGoogleDriveChildren } from './googleDrive';
import { downloadOneDriveFile, listOneDriveChildren } from './oneDrive';

const WORD_CACHE_KEY = 'journal_buddy_cloud_words_cache_v1';
const WORD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

try {
  // Explicit workerSrc avoids "No GlobalWorkerOptions.workerSrc specified" in some environments.
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
} catch {
  GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs';
}

const docxMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const pptxMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);

const pdfMimeTypes = new Set(['application/pdf']);

const textLikeMimePattern = /^(text\/|application\/(json|xml|csv))/i;

const loadWordsCache = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORD_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveWordsCache = (cache) => {
  try {
    localStorage.setItem(WORD_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // no-op
  }
};

const buildReferenceCacheKey = ({ provider = '', sourceId = '', resourceType = '', mimeType = '', modifiedTime = '' }) => {
  return [provider, sourceId, resourceType, mimeType || '', modifiedTime || ''].join('|');
};

const getCachedWords = (cache, cacheKey) => {
  const record = cache[cacheKey];
  if (!record || !Array.isArray(record.words) || !record.cachedAt) return [];
  if (Date.now() - Number(record.cachedAt) > WORD_CACHE_TTL_MS) return [];
  return record.words;
};

const writeCachedWords = (cache, cacheKey, words = []) => {
  if (!Array.isArray(words) || !words.length) return;
  cache[cacheKey] = {
    words: [...new Set(words.map((word) => String(word || '').trim()).filter(Boolean))],
    cachedAt: Date.now(),
  };
};

const isSessionExpired = (session) => {
  const expiresAt = Number(session?.expiresAt || 0);
  if (!expiresAt) return false;
  return Date.now() >= (expiresAt - 60 * 1000);
};

const getFileExtension = (fileName = '') => {
  const normalized = String(fileName || '').trim().toLowerCase();
  const idx = normalized.lastIndexOf('.');
  return idx >= 0 ? normalized.slice(idx + 1) : '';
};

const decodeArrayBufferAsText = (arrayBuffer) => {
  try {
    return new TextDecoder('utf-8').decode(arrayBuffer || new ArrayBuffer(0));
  } catch {
    return '';
  }
};

const arrayBufferToDataUrl = (arrayBuffer, mimeType = 'application/octet-stream') => {
  const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const renderPdfFirstPageToDataUrl = async (arrayBuffer) => {
  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return '';

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toDataURL('image/png');
};

const renderPdfPageToDataUrl = async (arrayBuffer, pageNumber = 1) => {
  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  }).promise;

  const safePage = Math.max(1, Math.min(pdf.numPages, Number(pageNumber || 1)));
  const page = await pdf.getPage(safePage);
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return '';

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toDataURL('image/png');
};

const findPdfPageForWeekDay = async ({ arrayBuffer, weekNumber, dayNumber }) => {
  const week = Number(weekNumber || 0);
  const day = Number(dayNumber || 0);
  if (!Number.isFinite(week) || !Number.isFinite(day) || week <= 0 || day <= 0) return null;

  const weekDayRegex = new RegExp(`\\bweek\\b[^\\n\\r\\d]{0,12}${week}\\b[\\s\\S]{0,220}?\\bday\\b[^\\n\\r\\d]{0,12}${day}\\b|\\bday\\b[^\\n\\r\\d]{0,12}${day}\\b[\\s\\S]{0,220}?\\bweek\\b[^\\n\\r\\d]{0,12}${week}\\b`, 'i');
  const weekOnlyRegex = new RegExp(`\\bweek\\b[^\\n\\r\\d]{0,12}${week}\\b`, 'i');
  const dayOnlyRegex = new RegExp(`\\bday\\b[^\\n\\r\\d]{0,12}${day}\\b`, 'i');

  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  }).promise;

  let bestPage = 1;
  let bestScore = -1;
  const pageLimit = Math.min(pdf.numPages, 40);

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content.items || [])
      .map((item) => String(item?.str || '').trim())
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!pageText) continue;

    let score = 0;
    if (weekDayRegex.test(pageText)) score += 10;
    if (weekOnlyRegex.test(pageText)) score += 3;
    if (dayOnlyRegex.test(pageText)) score += 3;
    if (/teacher lesson plan|correlated to state|common core state standards/i.test(pageText)) score -= 8;

    if (score > bestScore) {
      bestScore = score;
      bestPage = pageNumber;
    }
  }

  return bestScore > 0 ? bestPage : null;
};

const decodeXmlText = (value = '') => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const extractStructuredPdfRows = (items = []) => {
  const normalized = (items || [])
    .map((item) => ({
      text: String(item?.str || '').trim(),
      x: Number(item?.transform?.[4] || 0),
      y: Number(item?.transform?.[5] || 0),
    }))
    .filter((item) => item.text);

  if (!normalized.length) return [];

  // Group by approximate y-position to recover table/text rows.
  const yTolerance = 2.5;
  const rows = [];
  const sortedByY = [...normalized].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const token of sortedByY) {
    const row = rows.find((r) => Math.abs(r.y - token.y) <= yTolerance);
    if (!row) {
      rows.push({ y: token.y, cells: [token] });
    } else {
      row.cells.push(token);
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const cells = [...row.cells].sort((a, b) => a.x - b.x);
      const rebuilt = [];
      let prevX = null;

      for (const cell of cells) {
        if (prevX !== null && Math.abs(cell.x - prevX) > 24) {
          rebuilt.push(' | ');
        } else if (rebuilt.length > 0) {
          rebuilt.push(' ');
        }
        rebuilt.push(cell.text);
        prevX = cell.x;
      }

      return rebuilt.join('').trim();
    })
    .filter(Boolean);
};

const parsePdfText = async (arrayBuffer) => {
  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  }).promise;

  const pageLimit = Math.min(pdf.numPages, 20);
  let merged = '';

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const plainText = (content.items || [])
      .map((item) => item.str || '')
      .join(' ');

    const structuredRows = extractStructuredPdfRows(content.items || []);
    const structuredText = structuredRows.join('\n');

    merged += ` ${plainText}\n${structuredText}`;
  }

  return merged;
};

const parsePdfPageText = async (arrayBuffer, pageNumber) => {
  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  }).promise;

  const safePage = Math.max(1, Math.min(pdf.numPages, Number(pageNumber || 1)));
  const page = await pdf.getPage(safePage);
  const content = await page.getTextContent();
  const plainText = (content.items || []).map((item) => item.str || '').join(' ');
  const structuredRows = extractStructuredPdfRows(content.items || []);
  return `${plainText}\n${structuredRows.join('\n')}`.trim();
};

const parseDocxText = async (arrayBuffer) => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return '';

  const textMatches = [...documentXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
  return textMatches
    .map((match) => decodeXmlText(match[1] || ''))
    .join(' ');
};

const parsePptxText = async (arrayBuffer) => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const left = Number(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
      const right = Number(b.match(/slide(\d+)\.xml$/)?.[1] || '0');
      return left - right;
    });

  let merged = '';

  for (const slidePath of slideFiles) {
    const xml = await zip.file(slidePath)?.async('string');
    if (!xml) continue;

    const textMatches = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)];
    const slideText = textMatches
      .map((match) => decodeXmlText(match[1] || ''))
      .join(' ');

    merged += ` ${slideText}`;
  }

  return merged;
};

const extractWordsFromBuffer = async ({ arrayBuffer, mimeType = '', fileName = '' }) => {
  const text = await extractTextFromBuffer({ arrayBuffer, mimeType, fileName });
  if (!text.trim()) return [];
  return extractUniquePracticeWords(text);
};

const extractTextFromBuffer = async ({ arrayBuffer, mimeType = '', fileName = '' }) => {
  const normalizedMimeType = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const extension = getFileExtension(fileName);

  let text = '';

  if (pdfMimeTypes.has(normalizedMimeType) || extension === 'pdf') {
    text = await parsePdfText(arrayBuffer);
  } else if (docxMimeTypes.has(normalizedMimeType) || extension === 'docx' || extension === 'doc') {
    text = await parseDocxText(arrayBuffer);
  } else if (pptxMimeTypes.has(normalizedMimeType) || extension === 'pptx' || extension === 'ppt') {
    text = await parsePptxText(arrayBuffer);
  } else if (textLikeMimePattern.test(normalizedMimeType) || ['txt', 'csv', 'md', 'json'].includes(extension)) {
    text = decodeArrayBufferAsText(arrayBuffer);
  }

  return text;
};

const downloadReferenceFile = async ({ reference, session }) => {
  if (reference.provider === 'googleDrive') {
    return downloadGoogleDriveFile({
      accessToken: session.accessToken,
      fileId: reference.sourceId,
      mimeType: reference.mimeType || '',
    });
  }

  return downloadOneDriveFile({
    accessToken: session.accessToken,
    fileId: reference.sourceId,
  });
};

const listReferenceFolderChildren = async ({ reference, session }) => {
  if (reference.provider === 'googleDrive') {
    return listGoogleDriveChildren({
      accessToken: session.accessToken,
      parentId: reference.sourceId,
    });
  }

  return listOneDriveChildren({
    accessToken: session.accessToken,
    parentId: reference.sourceId,
  });
};

export const loadWordsFromLinkedReferences = async ({ references, cloudSessions, maxWords = 250 }) => {
  const warnings = [];
  const allWords = [];
  const cache = loadWordsCache();

  for (const reference of references) {
    const referenceCacheKey = buildReferenceCacheKey(reference);
    const cachedReferenceWords = getCachedWords(cache, referenceCacheKey);

    if (!reference.sourceId || !reference.provider) {
      warnings.push(`Reference \"${reference.label || 'untitled'}\" has no source id.`);
      continue;
    }

    const session = cloudSessions[reference.provider];
    if (!session?.accessToken) {
      if (cachedReferenceWords.length > 0) {
        allWords.push(...cachedReferenceWords);
        warnings.push(`Using cached words for ${reference.label || reference.sourceId}. Reconnect ${reference.provider} to refresh.`);
        continue;
      }
      throw new Error(`Reconnect ${reference.provider} to refresh access, then load again.`);
    }

    if (isSessionExpired(session)) {
      if (cachedReferenceWords.length > 0) {
        allWords.push(...cachedReferenceWords);
        warnings.push(`Using cached words for ${reference.label || reference.sourceId} because ${reference.provider} session expired.`);
        continue;
      }
      throw new Error(`${reference.provider === 'googleDrive' ? 'Google Drive' : 'OneDrive'} session expired and no cache is available. Reconnect and try again.`);
    }

    if (reference.resourceType === 'file') {
      try {
        const fileResult = await downloadReferenceFile({ reference, session });
        const words = await extractWordsFromBuffer({
          arrayBuffer: fileResult.arrayBuffer,
          mimeType: reference.mimeType || fileResult.contentType,
          fileName: reference.label || '',
        });
        if (!words.length) {
          warnings.push(`No extractable text words found in file ${reference.label || reference.sourceId}.`);
        }
        allWords.push(...words);
        writeCachedWords(cache, referenceCacheKey, words);
      } catch (error) {
        if (cachedReferenceWords.length > 0) {
          allWords.push(...cachedReferenceWords);
          warnings.push(`Using cached words for ${reference.label || reference.sourceId}. ${error?.message || ''}`.trim());
          continue;
        }
        warnings.push(error.message || `Could not read file ${reference.label || reference.sourceId}.`);
      }
      continue;
    }

    if (reference.resourceType === 'folder') {
      try {
        const children = await listReferenceFolderChildren({ reference, session });
        const files = children.filter((item) => item.resourceType === 'file').slice(0, 10);
        const folderWords = [];

        for (const file of files) {
          try {
            const fileResult = reference.provider === 'googleDrive'
              ? await downloadGoogleDriveFile({
                  accessToken: session.accessToken,
                  fileId: file.id,
                  mimeType: file.mimeType || '',
                })
              : await downloadOneDriveFile({
                  accessToken: session.accessToken,
                  fileId: file.id,
                });

            const words = await extractWordsFromBuffer({
              arrayBuffer: fileResult.arrayBuffer,
              mimeType: file.mimeType || fileResult.contentType,
              fileName: file.name || '',
            });
            if (!words.length) {
              warnings.push(`No extractable text words found in file ${file.name || file.id}.`);
            }
            folderWords.push(...words);
          } catch (error) {
            warnings.push(error?.message || `Could not read file ${file.name || file.id}.`);
            // Continue with remaining files in the folder even if one file fails.
          }
        }

        allWords.push(...folderWords);
        writeCachedWords(cache, referenceCacheKey, folderWords);
      } catch (error) {
        if (cachedReferenceWords.length > 0) {
          allWords.push(...cachedReferenceWords);
          warnings.push(`Using cached words for folder ${reference.label || reference.sourceId}. ${error?.message || ''}`.trim());
          continue;
        }
        warnings.push(error.message || `Could not read folder ${reference.label || reference.sourceId}.`);
      }
    }
  }

  const words = [...new Set(allWords)]
    .map((word) => word.trim())
    .filter((word) => {
      if (!word) return false;
      if (/[\u3400-\u9FFF]/.test(word)) return true;
      if (/^[a-z]$/i.test(word)) return true;
      return word.length >= 2;
    })
    .slice(0, maxWords);

  if (!words.length && warnings.length === 0) {
    warnings.push('No extractable words found. If this PDF is scanned/image-only, use OCR or the pdfplumber helper script.');
  }

  saveWordsCache(cache);

  return {
    words,
    warnings,
  };
};

export const clearWordsCacheForReferences = (references = []) => {
  const cache = loadWordsCache();
  const next = { ...cache };

  for (const reference of references) {
    const key = buildReferenceCacheKey(reference || {});
    delete next[key];
  }

  saveWordsCache(next);
};

export const loadWorksheetTextFromLinkedReferences = async ({ references, cloudSessions, maxChars = 120000 }) => {
  const warnings = [];
  const blocks = [];

  for (const reference of references) {
    if (!reference.sourceId || !reference.provider) {
      warnings.push(`Reference "${reference.label || 'untitled'}" has no source id.`);
      continue;
    }

    const session = cloudSessions[reference.provider];
    if (!session?.accessToken) {
      warnings.push(`Reconnect ${reference.provider} before loading ${reference.label || reference.sourceId}.`);
      continue;
    }

    if (isSessionExpired(session)) {
      warnings.push(`${reference.provider} session expired for ${reference.label || reference.sourceId}. Reconnect first.`);
      continue;
    }

    if (reference.resourceType === 'file') {
      try {
        const fileResult = await downloadReferenceFile({ reference, session });
        const text = await extractTextFromBuffer({
          arrayBuffer: fileResult.arrayBuffer,
          mimeType: reference.mimeType || fileResult.contentType,
          fileName: reference.label || '',
        });
        if (!text.trim()) {
          warnings.push(`No readable worksheet text found in ${reference.label || reference.sourceId}.`);
          continue;
        }
        blocks.push({
          label: reference.label || reference.sourceId,
          text,
        });
      } catch (error) {
        warnings.push(error.message || `Could not read file ${reference.label || reference.sourceId}.`);
      }
      continue;
    }

    if (reference.resourceType === 'folder') {
      try {
        const children = await listReferenceFolderChildren({ reference, session });
        const files = children.filter((item) => item.resourceType === 'file').slice(0, 10);

        for (const file of files) {
          try {
            const fileResult = reference.provider === 'googleDrive'
              ? await downloadGoogleDriveFile({
                  accessToken: session.accessToken,
                  fileId: file.id,
                  mimeType: file.mimeType || '',
                })
              : await downloadOneDriveFile({
                  accessToken: session.accessToken,
                  fileId: file.id,
                });

            const text = await extractTextFromBuffer({
              arrayBuffer: fileResult.arrayBuffer,
              mimeType: file.mimeType || fileResult.contentType,
              fileName: file.name || '',
            });
            if (!text.trim()) continue;
            blocks.push({
              label: file.name || file.id,
              text,
            });
          } catch (error) {
            warnings.push(error?.message || `Could not read file ${file.name || file.id}.`);
          }
        }
      } catch (error) {
        warnings.push(error.message || `Could not read folder ${reference.label || reference.sourceId}.`);
      }
    }
  }

  const mergedText = blocks.map((block) => `### ${block.label}\n${block.text}`).join('\n\n').slice(0, maxChars);

  return {
    text: mergedText,
    blocks,
    warnings,
  };
};

export const loadWorksheetTargetTextFromLinkedReferences = async ({ references, cloudSessions, weekNumber, dayNumber, maxChars = 24000 }) => {
  const warnings = [];
  const week = Math.max(1, Number(weekNumber || 1));
  const day = Math.max(1, Number(dayNumber || 1));

  for (const reference of references) {
    if (!reference.sourceId || !reference.provider) continue;

    const session = cloudSessions[reference.provider];
    if (!session?.accessToken || isSessionExpired(session)) continue;

    const tryExtractFromPdfFile = async ({ fileLikeReference, fileName = '' }) => {
      const fileResult = await downloadReferenceFile({ reference: fileLikeReference, session });
      const mimeType = String(fileLikeReference.mimeType || fileResult.contentType || '').toLowerCase();
      const extension = getFileExtension(fileName || fileLikeReference.label || '');
      if (!(pdfMimeTypes.has(mimeType) || extension === 'pdf')) return '';

      const matchedPage = await findPdfPageForWeekDay({
        arrayBuffer: fileResult.arrayBuffer,
        weekNumber: week,
        dayNumber: day,
      });
      if (!matchedPage) return '';

      const pageBlocks = [];
      for (const page of [matchedPage - 1, matchedPage, matchedPage + 1]) {
        if (page < 1) continue;
        try {
          const text = await parsePdfPageText(fileResult.arrayBuffer, page);
          if (!text.trim()) continue;
          const lowered = text.toLowerCase();
          if (/what's in this book|correlated to state|student record sheet|teacher lesson plan/.test(lowered)) continue;
          pageBlocks.push(`## page-${page}\n${text}`);
        } catch {
          // skip unreadable neighbor pages
        }
      }

      if (!pageBlocks.length) return '';
      const joined = pageBlocks.join('\n\n').slice(0, maxChars);
      return joined;
    };

    if (reference.resourceType === 'file') {
      try {
        const targetedText = await tryExtractFromPdfFile({
          fileLikeReference: reference,
          fileName: reference.label || '',
        });
        if (targetedText) {
          return {
            text: targetedText,
            warnings,
            sourceLabel: reference.label || reference.sourceId,
          };
        }
      } catch (error) {
        warnings.push(error?.message || `Could not target-read file ${reference.label || reference.sourceId}.`);
      }
      continue;
    }

    if (reference.resourceType === 'folder') {
      try {
        const children = await listReferenceFolderChildren({ reference, session });
        const candidateFiles = children
          .filter((item) => item.resourceType === 'file')
          .filter((item) => {
            const mimeType = String(item.mimeType || '').toLowerCase();
            const ext = getFileExtension(item.name || '');
            return pdfMimeTypes.has(mimeType) || ext === 'pdf';
          })
          .slice(0, 12);

        for (const file of candidateFiles) {
          try {
            const targetedText = await tryExtractFromPdfFile({
              fileLikeReference: {
                ...reference,
                sourceId: file.id,
                label: file.name || file.id,
                mimeType: file.mimeType || '',
                resourceType: 'file',
              },
              fileName: file.name || '',
            });
            if (targetedText) {
              return {
                text: targetedText,
                warnings,
                sourceLabel: file.name || file.id,
              };
            }
          } catch {
            // keep trying candidate files
          }
        }
      } catch (error) {
        warnings.push(error?.message || `Could not read folder ${reference.label || reference.sourceId}.`);
      }
    }
  }

  return {
    text: '',
    warnings,
    sourceLabel: '',
  };
};

export const loadWorksheetPreviewImageFromLinkedReferences = async ({ references, cloudSessions, weekNumber, dayNumber }) => {
  for (const reference of references) {
    if (!reference.sourceId || !reference.provider) continue;

    const session = cloudSessions[reference.provider];
    if (!session?.accessToken || isSessionExpired(session)) continue;

    const tryBuildPreviewFromFile = async ({ fileLikeReference, fileName = '' }) => {
      const fileResult = await downloadReferenceFile({ reference: fileLikeReference, session });
      const mimeType = String(fileLikeReference.mimeType || fileResult.contentType || '').toLowerCase();
      const extension = getFileExtension(fileName || fileLikeReference.label || '');

      if (mimeType.startsWith('image/')) {
        return arrayBufferToDataUrl(fileResult.arrayBuffer, mimeType || 'image/png');
      }

      if (pdfMimeTypes.has(mimeType) || extension === 'pdf') {
        const matchedPage = await findPdfPageForWeekDay({
          arrayBuffer: fileResult.arrayBuffer,
          weekNumber,
          dayNumber,
        });
        if (matchedPage) {
          return renderPdfPageToDataUrl(fileResult.arrayBuffer, matchedPage);
        }
        return renderPdfFirstPageToDataUrl(fileResult.arrayBuffer);
      }

      return '';
    };

    if (reference.resourceType === 'file') {
      try {
        const previewDataUrl = await tryBuildPreviewFromFile({
          fileLikeReference: reference,
          fileName: reference.label || '',
        });
        if (previewDataUrl) return previewDataUrl;
      } catch {
        // keep trying next references
      }
      continue;
    }

    if (reference.resourceType === 'folder') {
      try {
        const children = await listReferenceFolderChildren({ reference, session });
        const candidateFiles = children
          .filter((item) => item.resourceType === 'file')
          .filter((item) => {
            const mimeType = String(item.mimeType || '').toLowerCase();
            const ext = getFileExtension(item.name || '');
            return mimeType.startsWith('image/') || pdfMimeTypes.has(mimeType) || ext === 'pdf';
          })
          .slice(0, 8);

        for (const file of candidateFiles) {
          try {
            const previewReference = {
              ...reference,
              sourceId: file.id,
              label: file.name || file.id,
              mimeType: file.mimeType || '',
              resourceType: 'file',
            };
            const previewDataUrl = await tryBuildPreviewFromFile({
              fileLikeReference: previewReference,
              fileName: file.name || '',
            });
            if (previewDataUrl) return previewDataUrl;
          } catch {
            // keep trying remaining files
          }
        }
      } catch {
        // continue with next reference
      }
    }
  }

  return '';
};

const scoreWorksheetCandidateFile = (file = {}) => {
  const name = String(file.name || '').toLowerCase();
  const mimeType = String(file.mimeType || '').toLowerCase();
  const extension = getFileExtension(name);

  let score = 0;
  if (pdfMimeTypes.has(mimeType) || extension === 'pdf') score += 8;
  if (docxMimeTypes.has(mimeType) || extension === 'docx' || extension === 'doc') score += 5;
  if (pptxMimeTypes.has(mimeType) || extension === 'pptx' || extension === 'ppt') score += 3;
  if (/worksheet|reading|comprehension|week|day/.test(name)) score += 4;
  if (/teacher|plan|answer\s*key|cover/.test(name)) score -= 3;
  return score;
};

export const loadWorksheetSourceFileFromLinkedReferences = async ({ references, cloudSessions }) => {
  for (const reference of references) {
    if (!reference.sourceId || !reference.provider) continue;

    const session = cloudSessions[reference.provider];
    if (!session?.accessToken || isSessionExpired(session)) continue;

    if (reference.resourceType === 'file') {
      try {
        const fileResult = await downloadReferenceFile({ reference, session });
        const mimeType = String(reference.mimeType || fileResult.contentType || '').toLowerCase();
        const extension = getFileExtension(reference.label || '');
        const isSupported = pdfMimeTypes.has(mimeType) || docxMimeTypes.has(mimeType) || pptxMimeTypes.has(mimeType)
          || ['pdf', 'doc', 'docx', 'ppt', 'pptx'].includes(extension);
        if (!isSupported) continue;

        return {
          arrayBuffer: fileResult.arrayBuffer,
          mimeType: mimeType || 'application/pdf',
          fileName: reference.label || reference.sourceId,
          provider: reference.provider,
          sourceId: reference.sourceId,
        };
      } catch {
        // try next reference
      }
      continue;
    }

    if (reference.resourceType === 'folder') {
      try {
        const children = await listReferenceFolderChildren({ reference, session });
        const candidates = children
          .filter((item) => item.resourceType === 'file')
          .map((item) => ({ ...item, score: scoreWorksheetCandidateFile(item) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);

        for (const file of candidates) {
          try {
            const fileResult = reference.provider === 'googleDrive'
              ? await downloadGoogleDriveFile({
                  accessToken: session.accessToken,
                  fileId: file.id,
                  mimeType: file.mimeType || '',
                })
              : await downloadOneDriveFile({
                  accessToken: session.accessToken,
                  fileId: file.id,
                });

            const mimeType = String(file.mimeType || fileResult.contentType || '').toLowerCase();
            return {
              arrayBuffer: fileResult.arrayBuffer,
              mimeType: mimeType || 'application/pdf',
              fileName: file.name || file.id,
              provider: reference.provider,
              sourceId: file.id,
            };
          } catch {
            // try remaining candidates
          }
        }
      } catch {
        // try next reference
      }
    }
  }

  return null;
};
