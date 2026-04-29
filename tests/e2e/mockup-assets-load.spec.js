import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mockupAssetsDir = path.join(__dirname, 'mockup_assets');

const decodeXmlText = (value = '') => {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

const parseDocxText = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) return '';
  const textMatches = [...documentXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
  return textMatches.map((match) => decodeXmlText(match[1] || '')).join(' ').replace(/\s+/g, ' ').trim();
};

const parsePptxText = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
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
    merged += ` ${textMatches.map((match) => decodeXmlText(match[1] || '')).join(' ')}`;
  }

  return merged.replace(/\s+/g, ' ').trim();
};

test('loads mockup assets and extracts text', async ({}, testInfo) => {
  if (!['chromium', 'webkit'].includes(testInfo.project.name)) {
    test.skip(true, 'Run asset parsing smoke test in desktop browser projects only.');
  }

  const pdfPath = path.join(mockupAssetsDir, '4th 9 Weeks.pdf');
  const docxPath = path.join(mockupAssetsDir, 'module 11.docx');
  const pptxPath = path.join(mockupAssetsDir, 'module 11.pptx');

  const [pdfBytes, docxBytes] = await Promise.all([
    fs.readFile(pdfPath),
    fs.readFile(docxPath),
  ]);

  expect(pdfBytes.byteLength).toBeGreaterThan(1000);
  expect(docxBytes.byteLength).toBeGreaterThan(1000);

  const pdfDoc = await getDocument({
    data: new Uint8Array(pdfBytes),
    disableWorker: true,
  }).promise;

  expect(pdfDoc.numPages).toBeGreaterThan(0);

  const firstPage = await pdfDoc.getPage(1);
  const textContent = await firstPage.getTextContent();
  const pdfText = textContent.items
    .map((item) => item.str || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  expect(pdfText.length).toBeGreaterThan(20);

  const docxText = await parseDocxText(Buffer.from(docxBytes));

  expect(docxText.length).toBeGreaterThan(20);

  const pptxExists = await fs.access(pptxPath).then(() => true).catch(() => false);
  if (pptxExists) {
    const pptxBytes = await fs.readFile(pptxPath);
    expect(pptxBytes.byteLength).toBeGreaterThan(1000);
    const pptxText = await parsePptxText(Buffer.from(pptxBytes));
    expect(pptxText.length).toBeGreaterThan(20);
  }
});
