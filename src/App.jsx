import React, { useState, useEffect, useRef } from 'react';
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import LandingView from './features/landing/LandingView';
import { featureCards } from './features/landing/config';
import { getLandingIntent } from './features/landing/intent';
import ReadingTutorView from './features/reading-tutor/ReadingTutorView';
import readingTutoringInstructionMarkdown from './features/reading-tutor/reading_tutoring_instruction.md?raw';
import StoryADayView from './features/story-a-day/StoryADayView';
import SpellingChampionView from './features/spelling-champion/SpellingChampionView';
import SightwordsMasterView from './features/sightwords-master/SightwordsMasterView';
import ChineseLiteracyView from './features/chinese-literacy/ChineseLiteracyView';
import { pickLeitnerWordsForToday, resolvePracticeDate } from './features/sightwords-master/leitnerSchedule';
import WritingHomeView from './features/writing-journal/WritingHomeView';
import WritingJournalView from './features/writing-journal/WritingJournalView';
import CloudReferenceSettings from './features/cloud-references/CloudReferenceSettings';
import { loadWordsFromLinkedReferences, clearWordsCacheForReferences, loadWorksheetTextFromLinkedReferences, loadWorksheetTargetTextFromLinkedReferences, loadWorksheetSourceFileFromLinkedReferences } from './features/cloud-references/documentWordLoader';
import { parseWorksheetDocument, getWorksheetUnitForDate, extractWorksheetSectionForWeekDay } from './features/reading-tutor/worksheetParser';
import {
  cleanupExpiredCloudReferences,
  loadCloudReferenceState,
  loadSpellingCacheState,
  removeCloudReference,
  removeSpellingCacheState,
  saveCloudConnections,
  saveCloudReference,
  saveSpellingCacheState,
  loadFeatureWordBank,
  upsertFeatureWord,
  upsertFeatureWords,
  removeFeatureWord,
} from './features/cloud-references/storage';
import { connectGoogleDrive, listGoogleDriveChildren } from './features/cloud-references/googleDrive';
import { connectOneDrive, listOneDriveChildren } from './features/cloud-references/oneDrive';
import useSpeechRecognitionLifecycle from './shared/voice/useSpeechRecognitionLifecycle';
import { 
  Mic, 
  Settings, 
  BookOpen, 
  RefreshCw, 
  FlaskConical,
  Camera,
  Check
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyDwUK5xYMdq7ko5-gsgPo_5CZX10A8MtTA",
  authDomain: "journal-buddy-6096d.firebaseapp.com",
  projectId: "journal-buddy-6096d",
  storageBucket: "journal-buddy-6096d.firebasestorage.app",
  messagingSenderId: "1004942576297",
  appId: "1:1004942576297:web:a90e042cbe4f659e32f7b8",
  measurementId: "G-C16JH7BE95"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'writing-buddy-app';
const googleAIKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const guidedFlow = ['story', 'who', 'what', 'when', 'where', 'why', 'how'];
const fiveWSteps = ['who', 'what', 'when', 'where', 'why', 'how'];
const geminiLiveModel = 'gemini-3.1-flash-live-preview';
const readingTutorLiveModel = 'gemini-3.1-flash-live';
const readingTutorLiveFallbackModel = 'gemini-3.1-flash-live-preview';
const geminiLiveFunctionName = 'capture_story_step';
const geminiLiveFunctionDeclaration = {
  name: geminiLiveFunctionName,
  description: 'Returns the next structured action for the child journaling flow.',
  parameters: {
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        description: 'Echo the latest client requestId exactly.',
      },
      nextStep: {
        type: 'string',
        enum: ['story', 'who', 'what', 'when', 'where', 'why', 'how', 'generating'],
        description: 'The next step the app should move to.',
      },
      question: {
        type: 'string',
        description: 'The short child-friendly prompt the app should speak next.',
      },
      shouldConfirm: {
        type: 'boolean',
        description: 'Whether the app should confirm the answer before advancing.',
      },
      capturedAnswer: {
        type: 'string',
        description: 'The cleaned answer captured from the child. Use an empty string when nothing new was captured.',
      },
    },
    required: ['requestId', 'nextStep', 'question', 'shouldConfirm', 'capturedAnswer'],
  },
};
const geminiLiveSystemInstruction = `You are the dialogue planner for a child journaling app.
Always respond by calling the function ${geminiLiveFunctionName}. Never reply with plain text.

Rules:
- Keep prompts warm, brief, and age-appropriate.
- Stay faithful to the child's words. Light cleanup is allowed, but do not invent facts.
- Use previous answers to make follow-up questions more specific.
- For answer capture, ask a concise confirmation question.
- For step advancement, ask only one next question.
- If the next step is generating, set question to an empty string.
- Always echo the requestId exactly.`;

const readingTutorLiveSystemInstruction = `${String(readingTutoringInstructionMarkdown || '').trim()}

Output requirements:
- Speak to one student turn at a time.
- Never provide direct final answers to comprehension questions unless explicitly asked.
- Keep each response concise, actionable, and age-appropriate.`;

const featureIdAliases = {
  'writing-journal': 'writing-journal',
  writingJournal: 'writing-journal',
  home: 'writing-journal',
  'reading-tutor': 'reading-tutor',
  readingTutor: 'reading-tutor',
  'story-a-day': 'story-a-day',
  storyADay: 'story-a-day',
  'spelling-champion': 'spelling-champion',
  spellingChampion: 'spelling-champion',
  'sightwords-master': 'sightwords-master',
  sightwordsMaster: 'sightwords-master',
  'chinese-literacy': 'chinese-literacy',
  chineseLiteracy: 'chinese-literacy',
};

const simplifiedFeatureAliases = {
  writingjournal: 'writing-journal',
  journalbuddy: 'writing-journal',
  home: 'writing-journal',
  readingtutor: 'reading-tutor',
  storyaday: 'story-a-day',
  astoryaday: 'story-a-day',
  spellingchampion: 'spelling-champion',
  sightwordsmaster: 'sightwords-master',
  sightwordschampion: 'sightwords-master',
  chineseliteracy: 'chinese-literacy',
};

const simplifyFeatureKey = (value = '') => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

const normalizeFeatureId = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (featureIdAliases[raw]) return featureIdAliases[raw];
  if (raw.includes('識字高手')) return 'chinese-literacy';

  const simplified = simplifyFeatureKey(raw);
  if (featureIdAliases[simplified]) return featureIdAliases[simplified];
  if (simplifiedFeatureAliases[simplified]) return simplifiedFeatureAliases[simplified];

  return raw;
};

const REFERENCE_METADATA_TTL_MS = 24 * 60 * 60 * 1000;

const getReferenceMetadataExpiryMs = (resource = {}) => {
  const explicitExpiryIso = String(resource.metadataExpiresAtIso || '').trim();
  const explicitExpiryMs = explicitExpiryIso ? Date.parse(explicitExpiryIso) : NaN;
  if (Number.isFinite(explicitExpiryMs)) return explicitExpiryMs;

  const createdAtIso = String(resource.createdAtIso || '').trim();
  const createdAtMs = createdAtIso ? Date.parse(createdAtIso) : NaN;
  if (Number.isFinite(createdAtMs)) return createdAtMs + REFERENCE_METADATA_TTL_MS;

  return Date.now() + REFERENCE_METADATA_TTL_MS;
};

const isReferenceMetadataExpired = (resource = {}) => Date.now() >= getReferenceMetadataExpiryMs(resource);

const normalizeLinkedResource = (resource = {}) => ({
  ...resource,
  feature: normalizeFeatureId(resource.feature || ''),
  metadataExpiresAtIso: new Date(getReferenceMetadataExpiryMs(resource)).toISOString(),
});

const createLinkedResourceDedupKey = (resource = {}) => {
  const provider = String(resource.provider || '').trim().toLowerCase();
  const feature = normalizeFeatureId(resource.feature || '');
  const sourceId = String(resource.sourceId || '').trim().toLowerCase();
  const target = String(resource.target || '').trim().toLowerCase();
  return `${provider}::${feature}::${sourceId || target}`;
};

const dedupeLinkedResources = (resources = []) => {
  const seen = new Set();
  return [...resources]
    .sort((left, right) => {
      const leftIso = String(left?.createdAtIso || '');
      const rightIso = String(right?.createdAtIso || '');
      return rightIso.localeCompare(leftIso);
    })
    .filter((resource) => {
      const key = createLinkedResourceDedupKey(resource);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const isCloudSessionValid = (session) => {
  if (!session?.accessToken) return false;
  const expiresAt = Number(session.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  return Date.now() < expiresAt;
};

const getEffectiveCloudConnections = (connections = {}, sessions = {}) => ({
  googleDrive: Boolean(connections.googleDrive) && isCloudSessionValid(sessions.googleDrive),
  oneDrive: Boolean(connections.oneDrive) && isCloudSessionValid(sessions.oneDrive),
});

const hiddenLandingFeatureIds = new Set(['story-a-day', 'reading-tutor']);

const SPELLING_CACHE_KEY = 'journal_buddy_spelling_cache';
const SPELLING_HISTORY_KEY = 'journal_buddy_spelling_history';
const SPELLING_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SPELLING_TEACHER_SYSTEM_PROMPT = 'You are an experienced teacher and expert on phonetic awareness.';
const SIGHTWORD_TEACHER_SYSTEM_PROMPT = `You are an experienced, patient, and fun English Teacher specializing in early childhood literacy. Your mission is to help kids sharpen and enhance their Sight Words and reading fluency.

Core Competencies:

Accent & Noise Tolerance: You must be highly adaptive to various accents, stuttering, repetitive words, or "messy" speech patterns typical of kids learning to read. You excel at deciphering the "true intent" behind broken English.

Encouraging Tone: You always provide positive reinforcement. If a child makes a mistake, you gently guide them to the right answer without being discouraging.`;
const CHINESE_LITERACY_TEACHER_SYSTEM_PROMPT = `你是一位有經驗、耐心且有趣的中文老師，專門幫助兒童識字與閱讀流暢度。

核心能力：

口音與雜訊容錯：你能高度適應不同口音、口吃、重複詞與兒童常見的不完整語句，擅長判斷孩子真正想表達的內容。

鼓勵式語氣：你總是先肯定孩子的努力。即使答錯，也用溫柔、具體的方式引導到正確答案，不打擊信心。`;

const normalizeWordToken = (value = '') => String(value || '').trim().toLowerCase();

const normalizeSpokenPhrase = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[\u2019]/g, "'")
  .replace(/[^a-z\u3400-\u9fff'\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isCjkToken = (value = '') => /[\u3400-\u9fff]/.test(value);

const getSchoolWeekNumber = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const getSchoolDayNumber = (date = new Date()) => {
  const day = date.getDay();
  if (day === 0) return 1;
  if (day === 6) return 5;
  return Math.min(5, Math.max(1, day));
};

const READING_KEYWORD_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'did', 'does', 'do', 'to', 'from', 'with', 'and', 'or', 'in', 'on', 'at', 'of', 'for', 'this', 'that',
]);

const extractQuestionKeywords = (questionStem = '', maxTerms = 3) => {
  const words = String(questionStem || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !READING_KEYWORD_STOPWORDS.has(word));

  return Array.from(new Set(words)).slice(0, maxTerms);
};

const matchesSpokenWord = (expectedRaw = '', spokenRaw = '') => {
  const expected = normalizeSpokenPhrase(expectedRaw);
  const spoken = normalizeSpokenPhrase(spokenRaw);
  if (!expected || !spoken) return false;
  if (expected === spoken) return true;

  if (isCjkToken(expected)) {
    return spoken.includes(expected);
  }

  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundaryMatch = new RegExp(`(^|\\s)${escaped}($|\\s)`).test(spoken);
  if (wordBoundaryMatch) return true;
  return false;
};

const levenshteinDistance = (left = '', right = '') => {
  const a = String(left || '');
  const b = String(right || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const likelySpokenTokenMatch = (expectedRaw = '', spokenRaw = '') => {
  const expected = normalizeWordToken(expectedRaw);
  const spokenTokens = normalizeSpokenPhrase(spokenRaw)
    .split(' ')
    .map((token) => normalizeWordToken(token))
    .filter(Boolean)
    .slice(0, 4);

  if (!expected || !spokenTokens.length || isCjkToken(expected)) return false;

  return spokenTokens.some((token) => {
    if (token === expected) return true;
    const maxDistance = expected.length <= 4 ? 1 : 2;
    return levenshteinDistance(token, expected) <= maxDistance;
  });
};

const spellOutWordNaturally = (value = '') => String(value || '')
  .trim()
  .split('')
  .map((char) => char.toLowerCase())
  .join(', ');

const shuffled = (items = []) => {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = cloned[i];
    cloned[i] = cloned[j];
    cloned[j] = tmp;
  }
  return cloned;
};


  const App = () => {
  // --- 狀態管理 ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); 
  const [studentName, setStudentName] = useState(() => localStorage.getItem('journal_buddy_name') || ''); 
  const [grade, setGrade] = useState(() => localStorage.getItem('journal_buddy_grade') || 'Kindergarten'); 
  const [customExpectation, setCustomExpectation] = useState(() => localStorage.getItem('journal_buddy_custom_expectation') || '');
  const [draftCustomExpectation, setDraftCustomExpectation] = useState(() => localStorage.getItem('journal_buddy_custom_expectation') || '');
  const [selectedCustomizeFeature, setSelectedCustomizeFeature] = useState('writing-journal');
  const [featureCustomMessages, setFeatureCustomMessages] = useState(() => {
    const defaultMessages = {
      'writing-journal': '',
      'reading-tutor': '',
      'story-a-day': '',
      'spelling-champion': '',
      'sightwords-master': '',
      'chinese-literacy': '',
    };

    try {
      const stored = JSON.parse(localStorage.getItem('journal_buddy_feature_custom_messages') || '{}');
      const legacyWriting = localStorage.getItem('journal_buddy_custom_expectation') || '';
      return {
        ...defaultMessages,
        ...Object.fromEntries(Object.entries(stored).map(([key, value]) => [normalizeFeatureId(key), value || ''])),
        'writing-journal': (stored['writing-journal'] || legacyWriting || '').trim(),
      };
    } catch {
      return {
        ...defaultMessages,
        'writing-journal': (localStorage.getItem('journal_buddy_custom_expectation') || '').trim(),
      };
    }
  });
  const [draftFeatureCustomMessage, setDraftFeatureCustomMessage] = useState('');
  const [isCustomListening, setIsCustomListening] = useState(false);
  const [step, setStep] = useState('idle'); 
  const [isConfirming, setIsConfirming] = useState(false); 
  const [answers, setAnswers] = useState({}); 
  const [generatedJournal, setGeneratedJournal] = useState(''); 
  const [imageUrl, setImageUrl] = useState(null); 
  const [isListening, setIsListening] = useState(false); 
  const [userInput, setUserInput] = useState(''); 
  const [isSpeaking, setIsSpeaking] = useState(false); 
  const [spellResult, setSpellResult] = useState(''); 
  const [isMockMode, setIsMockMode] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCustomExpectationModal, setShowCustomExpectationModal] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [journalImage, setJournalImage] = useState(null);
  const [liveStatus, setLiveStatus] = useState(() => {
    if (!isLocal) return 'hidden';
    if (isMockMode) return 'mock';
    return googleAIKey ? 'idle' : 'fallback';
  });
  const [liveUsage, setLiveUsage] = useState(null);
  const [liveErrorDetail, setLiveErrorDetail] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastRecognitionState, setLastRecognitionState] = useState('Idle');
  const [liveRawPreview, setLiveRawPreview] = useState('');
  const [cloudConnections, setCloudConnections] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('journal_buddy_cloud_connections') || '{}');
      return {
        googleDrive: Boolean(parsed.googleDrive),
        oneDrive: Boolean(parsed.oneDrive),
      };
    } catch {
      return { googleDrive: false, oneDrive: false };
    }
  });
  const [linkedResources, setLinkedResources] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('journal_buddy_linked_resources') || '[]');
      return Array.isArray(parsed) ? dedupeLinkedResources(parsed.map(normalizeLinkedResource)) : [];
    } catch {
      return [];
    }
  });
  const [linkDraft, setLinkDraft] = useState({
    provider: '',
    feature: '',
    target: '',
    selectedName: '',
    selectedType: '',
    sourceId: '',
    selectedMimeType: '',
    selectedModifiedTime: '',
  });
  const [cloudWordBanks, setCloudWordBanks] = useState({
    'reading-tutor': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
    'story-a-day': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
    'spelling-champion': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
    'sightwords-master': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
    'chinese-literacy': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
  });
  const [featureWordBanks, setFeatureWordBanks] = useState({
    'sightwords-master': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
    'chinese-literacy': {
      words: [],
      isLoading: false,
      error: '',
      loadedAtIso: '',
    },
  });
  const [featurePracticeSession, setFeaturePracticeSession] = useState({
    active: false,
    featureId: '',
    index: 0,
    words: [],
    feedback: '',
    finished: false,
  });
  const [spellingCache, setSpellingCache] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SPELLING_CACHE_KEY) || '{}');
      const expiresAt = Number(stored.expiresAt || 0);
      const words = Array.isArray(stored.words) ? stored.words : [];
      if (!expiresAt || Date.now() > expiresAt || words.length === 0) {
        return { words: [], expiresAt: 0 };
      }
      return { words, expiresAt };
    } catch {
      return { words: [], expiresAt: 0 };
    }
  });
  const [spellingHistory, setSpellingHistory] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SPELLING_HISTORY_KEY) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [spellingPracticeState, setSpellingPracticeState] = useState({
    open: false,
    index: 0,
  });
  const [spellingQuizState, setSpellingQuizState] = useState({
    open: false,
    index: 0,
    words: [],
    answer: '',
    score: 0,
    feedback: '',
    awaitingVoiceAnswer: false,
  });
  const [spellingQuizInputFocusNonce, setSpellingQuizInputFocusNonce] = useState(0);
  const [featureActionMessage, setFeatureActionMessage] = useState('');
  const [readingTutorFeedback, setReadingTutorFeedback] = useState('');
  const [readingPracticeFeatureId, setReadingPracticeFeatureId] = useState('reading-tutor');
  const [readingTutorTranscriptBuffer, setReadingTutorTranscriptBuffer] = useState('');
  const [readingTutorContinuousListening, setReadingTutorContinuousListening] = useState(false);
  const [readingTutorWorksheetData, setReadingTutorWorksheetData] = useState({ units: [], byWeekDay: {}, warnings: [] });
  const [readingTutorActiveUnit, setReadingTutorActiveUnit] = useState(null);
  const [readingTutorWeekNumber, setReadingTutorWeekNumber] = useState(1);
  const [readingTutorDayNumber, setReadingTutorDayNumber] = useState(1);
  const [readingTutorQuestionIndex, setReadingTutorQuestionIndex] = useState(0);
  const [readingTutorScore, setReadingTutorScore] = useState(0);
  const [readingTutorAnswers, setReadingTutorAnswers] = useState({});
  const [readingTutorHighlightTerms, setReadingTutorHighlightTerms] = useState([]);
  const [readingTutorCelebrating, setReadingTutorCelebrating] = useState(false);
  const [readingTutorIllustrationUrl, setReadingTutorIllustrationUrl] = useState('');
  const [readingTutorImageStatus, setReadingTutorImageStatus] = useState('idle');
  const [readingTutorUnfamiliarWords, setReadingTutorUnfamiliarWords] = useState([]);
  const [readingTutorWordReviewInProgress, setReadingTutorWordReviewInProgress] = useState(false);
  const [readingTutorWordReviewCompleted, setReadingTutorWordReviewCompleted] = useState(false);
  const [readingTutorReviewWordIndex, setReadingTutorReviewWordIndex] = useState(0);
  const [readingTutorReadingDoneSignal, setReadingTutorReadingDoneSignal] = useState(0);
  const [readingTutorDiscussionQuestion, setReadingTutorDiscussionQuestion] = useState('');
  const [readingTutorDiscussionTurns, setReadingTutorDiscussionTurns] = useState(0);
  const [readingTutorDiscussionDone, setReadingTutorDiscussionDone] = useState(false);
  const [readingTutorSession, setReadingTutorSession] = useState({
    worksheetTopic: '',
    awaitingQuestionLabel: false,
    awaitingQuestionRead: false,
    currentQuestionLabel: '',
  });
  const [isCloudStateReady, setIsCloudStateReady] = useState(false);
  const [cloudActionError, setCloudActionError] = useState('');
  const [isCloudActionBusy, setIsCloudActionBusy] = useState(false);
  const [cloudConnectProvider, setCloudConnectProvider] = useState('googleDrive');
  const [cloudSessions, setCloudSessions] = useState(() => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem('journal_buddy_cloud_sessions') || '{}');
      return {
        googleDrive: parsed.googleDrive || null,
        oneDrive: parsed.oneDrive || null,
      };
    } catch {
      return { googleDrive: null, oneDrive: null };
    }
  });
  const [cloudBrowser, setCloudBrowser] = useState({
    open: false,
    provider: '',
    isLoading: false,
    error: '',
    items: [],
    path: [{ id: 'root', name: 'Root' }],
  });
  const hasLoadedCloudStateRef = useRef(false);

  const customRecognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const mockActionTimerRef = useRef(null);
  const mockResumeTimerRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const hasAutoTriggeredSpellMockRef = useRef(false);
  const hasPausedAtStoryMockRef = useRef(false);
  const liveSocketRef = useRef(null);
  const liveSetupPromiseRef = useRef(null);
  const livePendingGuidanceRef = useRef(null);
  const liveRequestCounterRef = useRef(0);
  const readingTutorLiveSocketRef = useRef(null);
  const readingTutorLiveSetupPromiseRef = useRef(null);
  const readingTutorLivePendingRef = useRef(null);
  const readingTutorLiveRequestCounterRef = useRef(0);
  const spellingPracticeTimerRef = useRef(null);
  const fireworksStopRef = useRef(null);
  const [liveLastEvent, setLiveLastEvent] = useState('Idle');

  const landingFeatureCards = featureCards.filter((feature) => !hiddenLandingFeatureIds.has(feature.id));
  const effectiveCloudConnections = getEffectiveCloudConnections(cloudConnections, cloudSessions);


  /// Firebase Authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Firebase 登入失敗:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);


  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    customRecognitionRef.current = new SpeechRecognition();
    customRecognitionRef.current.continuous = false;
    customRecognitionRef.current.interimResults = false;
    customRecognitionRef.current.lang = 'en-US';

    customRecognitionRef.current.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;

      setDraftCustomExpectation((prev) => {
        const trimmedPrev = prev.trim();
        return trimmedPrev ? `${trimmedPrev} ${transcript}` : transcript;
      });
    };

    customRecognitionRef.current.onerror = () => setIsCustomListening(false);
    customRecognitionRef.current.onend = () => setIsCustomListening(false);

    return () => {
      try {
        customRecognitionRef.current?.stop();
      } catch (e) {
        setIsCustomListening(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLocal) return;

    if (isMockMode) {
      setLiveStatus('mock');
      setLiveErrorDetail('');
      setLiveLastEvent('Mock mode enabled. Gemini Live is bypassed.');
      return;
    }

    setLiveStatus(googleAIKey ? 'idle' : 'fallback');
    if (googleAIKey) setLiveErrorDetail('');
    setLiveLastEvent(googleAIKey ? 'Waiting to open Gemini Live.' : 'No Gemini API key found.');
  }, [isMockMode]);

  useEffect(() => {
    if (isListening) {
      silenceTimerRef.current = setTimeout(() => {
        if (isListening) {
          console.log("10s timeout: Stopping microphone");
          stopListening();
        }
      }, 10000);
    
    if (isMockMode && view !== 'journaling') {
      mockActionTimerRef.current = setTimeout(() => {
        triggerMockInput();
      }, step === 'story' ? 1800 : 500);
    }
    } else {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    }

    return () => { 
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); 
      if (mockActionTimerRef.current) clearTimeout(mockActionTimerRef.current);
    };
  }, [isListening, isMockMode, step, isConfirming, view]);

  useEffect(() => {
    if (view === 'journaling' && isMockMode && !hasAutoTriggeredSpellMockRef.current) {
      hasAutoTriggeredSpellMockRef.current = true;
      const timer = setTimeout(() => {
        handleSpellAssistPress();
      }, 300);
      return () => clearTimeout(timer);
    }

    if (view !== 'journaling' || !isMockMode) {
      hasAutoTriggeredSpellMockRef.current = false;
    }
  }, [view, isMockMode]);

  useEffect(() => {
    if (!isMockMode || step !== 'story') {
      hasPausedAtStoryMockRef.current = false;
      if (mockResumeTimerRef.current) {
        clearTimeout(mockResumeTimerRef.current);
        mockResumeTimerRef.current = null;
      }
    }
  }, [isMockMode, step]);

  useEffect(() => {
    localStorage.setItem('journal_buddy_cloud_connections', JSON.stringify(cloudConnections));
  }, [cloudConnections]);

  useEffect(() => {
    localStorage.setItem('journal_buddy_linked_resources', JSON.stringify(linkedResources));
  }, [linkedResources]);

  useEffect(() => {
    setLinkedResources((prev) => prev.map(normalizeLinkedResource));
  }, []);

  useEffect(() => {
    localStorage.setItem('journal_buddy_feature_custom_messages', JSON.stringify(featureCustomMessages));
  }, [featureCustomMessages]);

  useEffect(() => {
    if (!spellingCache?.words?.length || !spellingCache.expiresAt || Date.now() > spellingCache.expiresAt) {
      localStorage.removeItem(SPELLING_CACHE_KEY);
      if (user?.uid) {
        removeSpellingCacheState({ db, appId, uid: user.uid }).catch((error) => {
          console.error('Could not remove expired spelling cache from Firestore:', error);
        });
      }
      return;
    }

    localStorage.setItem(SPELLING_CACHE_KEY, JSON.stringify(spellingCache));
    if (user?.uid) {
      saveSpellingCacheState({
        db,
        appId,
        uid: user.uid,
        words: spellingCache.words,
        expiresAt: spellingCache.expiresAt,
      }).catch((error) => {
        console.error('Could not sync spelling cache to Firestore:', error);
      });
    }
  }, [spellingCache, user?.uid]);

  useEffect(() => {
    localStorage.setItem(SPELLING_HISTORY_KEY, JSON.stringify(spellingHistory));
  }, [spellingHistory]);

  useEffect(() => {
    const writingMessage = (featureCustomMessages['writing-journal'] || '').trim();
    if (writingMessage === customExpectation.trim()) return;
    setCustomExpectation(writingMessage);
  }, [featureCustomMessages, customExpectation]);

  useEffect(() => {
    if (selectedCustomizeFeature === 'writing-journal') {
      setDraftFeatureCustomMessage(customExpectation);
      return;
    }

    setDraftFeatureCustomMessage(featureCustomMessages[selectedCustomizeFeature] || '');
  }, [selectedCustomizeFeature, featureCustomMessages, customExpectation]);

  useEffect(() => {
    sessionStorage.setItem('journal_buddy_cloud_sessions', JSON.stringify(cloudSessions));
  }, [cloudSessions]);

  useEffect(() => {
    if (view !== 'setup' || !user?.uid || hasLoadedCloudStateRef.current) return;

    let isMounted = true;
    const loadCloudState = async () => {
      try {
        const cloudState = await loadCloudReferenceState({
          db,
          appId,
          uid: user.uid,
        });
        const cleanupResult = await cleanupExpiredCloudReferences({
          db,
          appId,
          uid: user.uid,
        });
        const removedByCleanup = new Set(cleanupResult?.removedReferenceIds || []);
        const normalizedReferences = dedupeLinkedResources((cloudState.references || []).map(normalizeLinkedResource));
        const activeReferences = normalizedReferences.filter((reference) => {
          if (removedByCleanup.has(reference.id)) return false;
          return !isReferenceMetadataExpired(reference);
        });
        const locallyExpiredReferenceIds = normalizedReferences
          .filter((reference) => isReferenceMetadataExpired(reference))
          .map((reference) => reference.id)
          .filter(Boolean);

        if (locallyExpiredReferenceIds.length > 0) {
          await Promise.all(
            locallyExpiredReferenceIds.map((referenceId) => removeCloudReference({
              db,
              appId,
              uid: user.uid,
              referenceId,
            }))
          );
        }

        if (!isMounted) return;
        setCloudConnections(cloudState.connections);
        setLinkedResources(activeReferences);
        hasLoadedCloudStateRef.current = true;
      } catch (error) {
        console.error('Could not load cloud reference state from Firestore:', error);
      } finally {
        if (isMounted) setIsCloudStateReady(true);
      }
    };

    loadCloudState();

    return () => {
      isMounted = false;
    };
  }, [view, user?.uid]);

  useEffect(() => {
    const expiredReferences = linkedResources.filter((resource) => isReferenceMetadataExpired(resource));
    if (expiredReferences.length === 0) return;

    const expiredReferenceIds = new Set(expiredReferences.map((resource) => resource.id).filter(Boolean));
    setLinkedResources((prev) => prev.filter((resource) => !expiredReferenceIds.has(resource.id)));

    if (user?.uid) {
      Promise.all(
        [...expiredReferenceIds].map((referenceId) => removeCloudReference({
          db,
          appId,
          uid: user.uid,
          referenceId,
        }))
      ).catch((error) => {
        console.error('Could not remove expired cloud references:', error);
      });
    }
  }, [linkedResources, user?.uid]);

  useEffect(() => {
    if (view !== 'setup') return;

    const providers = ['googleDrive', 'oneDrive'];
    const nextConnections = { ...cloudConnections };
    const nextSessions = { ...cloudSessions };
    let hasChanges = false;

    providers.forEach((provider) => {
      if (!cloudConnections[provider]) return;
      if (isCloudSessionValid(cloudSessions[provider])) return;
      nextConnections[provider] = false;
      nextSessions[provider] = null;
      hasChanges = true;
    });

    if (!hasChanges) return;

    setCloudConnections(nextConnections);
    setCloudSessions(nextSessions);

    if (user?.uid) {
      saveCloudConnections({
        db,
        appId,
        uid: user.uid,
        connections: nextConnections,
      }).catch((error) => {
        console.error('Could not sync expired cloud connection state:', error);
      });
    }
  }, [view, cloudConnections, cloudSessions, user?.uid]);

  const referenceFeatureOptions = featureCards.map((feature) => ({
    value: feature.id,
    label: feature.title,
  }));

  const featureCustomizationOptions = featureCards.map((feature) => ({
    value: feature.id,
    label: feature.title,
  }));

  const selectedCustomizationCard = featureCards.find((feature) => feature.id === selectedCustomizeFeature);

  const connectProvider = async (provider) => {
    setCloudActionError('');
    setIsCloudActionBusy(true);

    try {
      if (effectiveCloudConnections[provider]) {
        setCloudConnections((prev) => ({ ...prev, [provider]: false }));
        setCloudSessions((prev) => ({ ...prev, [provider]: null }));

        if (user?.uid) {
          const nextConnections = { ...cloudConnections, [provider]: false };
          await saveCloudConnections({
            db,
            appId,
            uid: user.uid,
            connections: nextConnections,
          });
        }
        return;
      }

      const session = provider === 'googleDrive'
        ? await connectGoogleDrive()
        : await connectOneDrive();

      const nextConnections = { ...cloudConnections, [provider]: true };
      setCloudSessions((prev) => ({ ...prev, [provider]: session }));
      setCloudConnections(nextConnections);

      if (user?.uid) {
        await saveCloudConnections({
          db,
          appId,
          uid: user.uid,
          connections: nextConnections,
        });
      }
    } catch (error) {
      setCloudActionError(error.message || 'Could not connect provider.');
    } finally {
      setIsCloudActionBusy(false);
    }
  };

  const loadCloudBrowserItems = async ({ provider, folderId = 'root', resetPath = false, folderName = 'Root' }) => {
    const session = cloudSessions[provider];
    if (!session?.accessToken) {
      throw new Error('Cloud session is not available. Please reconnect.');
    }

    const items = provider === 'googleDrive'
      ? await listGoogleDriveChildren({
          accessToken: session.accessToken,
          parentId: folderId,
        })
      : await listOneDriveChildren({
          accessToken: session.accessToken,
          parentId: folderId,
        });

    setCloudBrowser((prev) => {
      const nextPath = resetPath
        ? [{ id: 'root', name: 'Root' }]
        : prev.path;

      return {
        ...prev,
        provider,
        items,
        path: nextPath,
        error: '',
      };
    });

    if (!resetPath && folderId !== 'root') {
      setCloudBrowser((prev) => {
        const existing = prev.path.find((entry) => entry.id === folderId);
        if (existing) {
          const keepUntil = prev.path.findIndex((entry) => entry.id === folderId);
          return { ...prev, path: prev.path.slice(0, keepUntil + 1) };
        }
        return { ...prev, path: [...prev.path, { id: folderId, name: folderName }] };
      });
    }
  };

  const openCloudBrowser = async () => {
    setCloudActionError('');

    const provider = linkDraft.provider;
    if (!provider) {
      setCloudActionError('Select a provider first.');
      return;
    }

    if (!effectiveCloudConnections[provider] || !cloudSessions[provider]?.accessToken) {
      setCloudActionError('Connect the selected provider before picking resources.');
      return;
    }

    setCloudBrowser({
      open: true,
      provider,
      isLoading: true,
      error: '',
      items: [],
      path: [{ id: 'root', name: 'Root' }],
    });

    try {
      await loadCloudBrowserItems({ provider, folderId: 'root', resetPath: true });
    } catch (error) {
      setCloudBrowser((prev) => ({
        ...prev,
        error: error.message || 'Could not load cloud resources.',
      }));
    } finally {
      setCloudBrowser((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const closeCloudBrowser = () => {
    setCloudBrowser((prev) => ({
      ...prev,
      open: false,
      items: [],
      error: '',
      path: [{ id: 'root', name: 'Root' }],
    }));
  };

  const enterCloudFolder = async (item) => {
    if (!item || item.resourceType !== 'folder') return;

    setCloudBrowser((prev) => ({ ...prev, isLoading: true, error: '' }));
    try {
      await loadCloudBrowserItems({
        provider: cloudBrowser.provider,
        folderId: item.id,
        folderName: item.name,
      });
    } catch (error) {
      setCloudBrowser((prev) => ({ ...prev, error: error.message || 'Could not open this folder.' }));
    } finally {
      setCloudBrowser((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const goToCloudFolderFromPath = async (folderId) => {
    setCloudBrowser((prev) => ({ ...prev, isLoading: true, error: '' }));
    try {
      const selected = cloudBrowser.path.find((entry) => entry.id === folderId);
      await loadCloudBrowserItems({
        provider: cloudBrowser.provider,
        folderId,
        folderName: selected?.name || 'Folder',
      });
    } catch (error) {
      setCloudBrowser((prev) => ({ ...prev, error: error.message || 'Could not open this folder.' }));
    } finally {
      setCloudBrowser((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const selectCloudResource = (item) => {
    if (!item) return;

    const destinationUrl = item.webUrl || '';
    if (!destinationUrl) {
      setCloudActionError('Could not determine a destination URL for this resource.');
      return;
    }

    setLinkDraft((prev) => ({
      ...prev,
      provider: cloudBrowser.provider,
      target: destinationUrl,
      selectedName: item.name || prev.selectedName,
      selectedType: item.resourceType || prev.selectedType,
      sourceId: item.id || prev.sourceId,
      selectedMimeType: item.mimeType || prev.selectedMimeType,
      selectedModifiedTime: item.modifiedTime || prev.selectedModifiedTime,
    }));

    closeCloudBrowser();
  };

  const updateLinkDraft = (field, value) => {
    setLinkDraft((prev) => {
      if (field === 'provider' && prev.provider !== value) {
        return {
          ...prev,
          provider: value,
          target: '',
          selectedName: '',
          selectedType: '',
          sourceId: '',
          selectedMimeType: '',
          selectedModifiedTime: '',
        };
      }

      return { ...prev, [field]: value };
    });
  };

  const addReferenceLink = () => {
    const providerConnected = effectiveCloudConnections[linkDraft.provider];
    if (!providerConnected) return;

    const target = linkDraft.target.trim();
    const normalizedFeature = normalizeFeatureId(linkDraft.feature);
    if (!target || !normalizedFeature) return;

    const duplicateKey = createLinkedResourceDedupKey({
      provider: linkDraft.provider,
      feature: normalizedFeature,
      sourceId: linkDraft.sourceId || '',
      target,
    });
    const duplicateExists = linkedResources.some((resource) => createLinkedResourceDedupKey(resource) === duplicateKey);
    if (duplicateExists) {
      setCloudActionError('This document is already linked for this feature.');
      return;
    }

    const nextResource = {
      id: `resource_${Date.now()}`,
      provider: linkDraft.provider,
      feature: normalizedFeature,
      resourceType: linkDraft.selectedType || 'file',
      label: linkDraft.selectedName || 'Linked reference',
      target,
      sourceId: linkDraft.sourceId || '',
      mimeType: linkDraft.selectedMimeType || '',
      modifiedTime: linkDraft.selectedModifiedTime || '',
      derivedWords: [],
      createdAtIso: new Date().toISOString(),
      metadataExpiresAtIso: new Date(Date.now() + REFERENCE_METADATA_TTL_MS).toISOString(),
    };

    setLinkedResources((prev) => dedupeLinkedResources([nextResource, ...prev]));

    if (user?.uid) {
      saveCloudReference({
        db,
        appId,
        uid: user.uid,
        reference: nextResource,
      }).catch((error) => {
        console.error('Could not save linked cloud reference:', error);
        setLinkedResources((prev) => prev.filter((resource) => resource.id !== nextResource.id));
      });
    }

    setLinkDraft({
      provider: linkDraft.provider,
      feature: '',
      target: '',
      selectedName: '',
      selectedType: '',
      sourceId: '',
      selectedMimeType: '',
      selectedModifiedTime: '',
    });
  };

  const getFeatureReferences = (featureId) => {
    const canonical = normalizeFeatureId(featureId);
    return dedupeLinkedResources(linkedResources).filter((resource) => normalizeFeatureId(resource.feature) === canonical);
  };

  const launchCelebration = async () => {
    try {
      const { Fireworks } = await import('fireworks-js');
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.inset = '0';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '9999';
      document.body.appendChild(container);

      const fireworks = new Fireworks(container, {
        opacity: 0.6,
        acceleration: 1.04,
        friction: 0.95,
        gravity: 1.4,
        particles: 70,
        explosion: 6,
      });

      fireworks.start();
      fireworksStopRef.current = () => {
        fireworks.stop();
        try {
          container.remove();
        } catch {
          // no-op
        }
      };

      window.setTimeout(() => {
        fireworksStopRef.current?.();
        fireworksStopRef.current = null;
      }, 3200);
    } catch (error) {
      console.error('Fireworks launch failed:', error);
    }
  };

  const updateFeatureWordBankState = (featureId, patch) => {
    setFeatureWordBanks((prev) => ({
      ...prev,
      [featureId]: {
        ...(prev[featureId] || { words: [], isLoading: false, error: '', loadedAtIso: '' }),
        ...patch,
      },
    }));
  };

  const loadFeatureWordBankState = async (featureId) => {
    if (!user?.uid) {
      updateFeatureWordBankState(featureId, {
        words: [],
        isLoading: false,
        error: 'Sign-in is required before loading saved words.',
      });
      return [];
    }

    updateFeatureWordBankState(featureId, { isLoading: true, error: '' });

    try {
      const words = await loadFeatureWordBank({
        db,
        appId,
        uid: user.uid,
        featureId,
      });

      updateFeatureWordBankState(featureId, {
        words,
        isLoading: false,
        error: '',
        loadedAtIso: new Date().toISOString(),
      });
      return words;
    } catch (error) {
      updateFeatureWordBankState(featureId, {
        words: [],
        isLoading: false,
        error: error.message || 'Could not load saved words.',
      });
      return [];
    }
  };

  const upsertFeatureWordBankEntry = async ({ featureId, word, reviewFrequency = 1 }) => {
    if (!user?.uid) return;

    try {
      await upsertFeatureWord({
        db,
        appId,
        uid: user.uid,
        featureId,
        word,
        reviewFrequency: Math.min(5, Math.max(1, Number(reviewFrequency || 1))),
      });

      await loadFeatureWordBankState(featureId);
    } catch (error) {
      const message = error?.message || '';
      if (message.includes('Missing or insufficient permissions')) {
        updateFeatureWordBankState(featureId, { error: 'Could not save to Firebase word bank due to permissions. Words are kept locally for this session.' });
        return;
      }
      throw error;
    }
  };

  const removeFeatureWordBankEntry = async ({ featureId, word }) => {
    if (!user?.uid) return;

    try {
      await removeFeatureWord({
        db,
        appId,
        uid: user.uid,
        featureId,
        word,
      });

      await loadFeatureWordBankState(featureId);
    } catch (error) {
      const message = error?.message || '';
      if (message.includes('Missing or insufficient permissions')) {
        updateFeatureWordBankState(featureId, { error: 'Could not update Firebase word bank due to permissions.' });
        return;
      }
      throw error;
    }
  };

  const loadCloudWordsToFeatureBank = async (featureId) => {
    const references = getFeatureReferences(featureId);
    let extractedWords = [];
    if (references.length === 0) {
      updateFeatureWordBankState(featureId, {
        error: 'No linked cloud references yet. Add one in Settings first.',
      });
      return;
    }

    updateFeatureWordBankState(featureId, { isLoading: true, error: '' });

    try {
      const { words, warnings } = await loadWordsFromLinkedReferences({
        references,
        cloudSessions,
        maxWords: 500,
      });
      extractedWords = words;

      if (!words.length) {
        updateFeatureWordBankState(featureId, {
          isLoading: false,
          error: warnings?.[0] || 'No words found from linked references.',
        });
        return;
      }

      if (!user?.uid) {
        throw new Error('Sign-in is required before uploading words to Firebase.');
      }

      await upsertFeatureWords({
        db,
        appId,
        uid: user.uid,
        featureId,
        words,
      });

      // For upload-driven features, drop temporary extraction cache once words are persisted.
      clearWordsCacheForReferences(references);

      await loadFeatureWordBankState(featureId);
      setFeatureActionMessage('Words uploaded successfully. Great job!');
    } catch (error) {
      const message = error?.message || '';
      if (message.includes('Missing or insufficient permissions')) {
        updateFeatureWordBankState(featureId, {
          words: extractedWords.map((word) => ({ word, reviewFrequency: 1 })),
          isLoading: false,
          error: '',
          loadedAtIso: new Date().toISOString(),
        });
        setFeatureActionMessage('Words loaded, but Firebase permissions blocked saving. You can still practice in this session.');
        return;
      }

      updateFeatureWordBankState(featureId, {
        isLoading: false,
        error: error.message || 'Could not upload words from linked references.',
      });
    }
  };

  const startFeaturePracticeSession = async (featureId) => {
    const loaded = await loadFeatureWordBankState(featureId);
    const allWords = loaded
      .map((item) => ({ word: item.word, reviewFrequency: Math.min(5, Math.max(1, Number(item.reviewFrequency || 1))) }))
      .filter((item) => item.word);

    const mockToday = isLocal ? localStorage.getItem('journal_buddy_mock_today') || '' : '';
    const practiceDate = resolvePracticeDate(mockToday);
    const words = pickLeitnerWordsForToday(allWords, practiceDate);

    if (!words.length) {
      setFeatureActionMessage('No words are scheduled for today based on Leitner boxes. Try again on the next review day.');
      return;
    }

    setFeaturePracticeSession({
      active: true,
      featureId,
      index: 0,
      words,
      feedback: '',
      finished: false,
    });

    setFeatureActionMessage('Say the shown word. You can also say "i do not know" or "skip" to move on.');
    stopListening();
    window.setTimeout(() => startListening(), 250);
  };

  const stopFeaturePracticeSession = () => {
    setFeaturePracticeSession({
      active: false,
      featureId: '',
      index: 0,
      words: [],
      feedback: '',
      finished: false,
    });
    stopSpeaking();
    stopListening();
  };

  const loadSpellingWordsToCache = async () => {
    const featureId = 'spelling-champion';
    const references = getFeatureReferences(featureId);

    if (references.length === 0) {
      setFeatureActionMessage('No linked references yet. Go to Settings and link one first.');
      return { ok: false };
    }

    updateCloudWordBank(featureId, { isLoading: true, error: '' });

    try {
      const { words, warnings } = await loadWordsFromLinkedReferences({
        references,
        cloudSessions,
        maxWords: 500,
      });

      const cleanWords = [...new Set(words.map((word) => normalizeWordToken(word)).filter((word) => /^[a-z][a-z'\-]{1,}$/.test(word)))];
      if (!cleanWords.length) {
        updateCloudWordBank(featureId, {
          words: [],
          isLoading: false,
          error: 'No usable spelling words found in linked references.',
          loadedAtIso: '',
        });
        return { ok: false };
      }

      const nextCache = {
        words: cleanWords,
        expiresAt: Date.now() + SPELLING_CACHE_TTL_MS,
      };
      setSpellingCache(nextCache);

      updateCloudWordBank(featureId, {
        words: cleanWords,
        isLoading: false,
        error: warnings.length ? `Loaded with warnings: ${warnings[0]}` : '',
        loadedAtIso: new Date().toISOString(),
      });

      setFeatureActionMessage('Spelling words loaded and cached for 7 days.');
      return { ok: true };
    } catch (error) {
      updateCloudWordBank(featureId, {
        words: [],
        isLoading: false,
        error: error.message || 'Could not load spelling words.',
      });
      return { ok: false };
    }
  };

  const startSpellingPracticeLoop = () => {
    if (!spellingCache.words.length) return;
    setSpellingPracticeState({ open: true, index: 0 });
  };

  const stopSpellingPracticeLoop = () => {
    if (spellingPracticeTimerRef.current) {
      window.clearInterval(spellingPracticeTimerRef.current);
      spellingPracticeTimerRef.current = null;
    }
    stopSpeaking();
    setSpellingPracticeState({ open: false, index: 0 });
  };

  const startSpellingQuiz = () => {
    if (!spellingCache.words.length) return;

    const questionWords = shuffled(spellingCache.words).slice(0, 10);
    setSpellingQuizState({
      open: true,
      index: 0,
      words: questionWords,
      answer: '',
      score: 0,
      feedback: '',
      awaitingVoiceAnswer: false,
    });

    const firstWord = questionWords[0] || '';
    if (firstWord) {
      void speakText(`Spell this word: ${firstWord}`).finally(() => {
        setSpellingQuizInputFocusNonce((prev) => prev + 1);
      });
    }
    setSpellingQuizInputFocusNonce((prev) => prev + 1);
  };

  const closeSpellingQuiz = () => {
    setSpellingQuizState({
      open: false,
      index: 0,
      words: [],
      answer: '',
      score: 0,
      feedback: '',
      awaitingVoiceAnswer: false,
    });
  };

  const submitSpellingQuizAnswer = async () => {
    if (!spellingQuizState.open) return;
    const currentWord = spellingQuizState.words[spellingQuizState.index] || '';
    if (!currentWord) return;

    const answer = normalizeWordToken(spellingQuizState.answer);
    const correctWord = normalizeWordToken(currentWord);
    const isCorrect = answer === correctWord;
    const nextScore = spellingQuizState.score + (isCorrect ? 1 : 0);
    const feedbackMessage = isCorrect ? 'Correct!' : `Not quite. Correct answer: ${currentWord}`;

    setSpellingQuizState((prev) => ({
      ...prev,
      feedback: feedbackMessage,
    }));

    if (!isCorrect) {
      const aiHint = await getSpellingCoachHint({
        word: currentWord,
        attemptedAnswer: spellingQuizState.answer,
      });
      await speakText(`${aiHint} The correct spelling is ${spellOutWordNaturally(currentWord)}.`);
    }

    const nextIndex = spellingQuizState.index + 1;
    if (nextIndex >= spellingQuizState.words.length) {
      setSpellingHistory((prev) => {
        const recent = [...prev, {
          dateIso: new Date().toISOString(),
          score: nextScore,
          total: spellingQuizState.words.length,
        }].filter((item) => Date.now() - new Date(item.dateIso).getTime() <= 30 * 24 * 60 * 60 * 1000);
        return recent;
      });

      closeSpellingQuiz();
      await launchCelebration();
      await speakText('Awesome effort! You did a great job today!');
      return;
    }

    const nextWord = spellingQuizState.words[nextIndex];
    setSpellingQuizState((prev) => ({
      ...prev,
      index: nextIndex,
      score: nextScore,
      feedback: feedbackMessage,
      answer: '',
      awaitingVoiceAnswer: false,
    }));

    if (nextWord) {
      await speakText(`Next word: ${nextWord}`);
    }
    setSpellingQuizInputFocusNonce((prev) => prev + 1);
  };

  const repeatCurrentSpellingQuestion = async () => {
    const currentWord = spellingQuizState.words[spellingQuizState.index] || '';
    if (!currentWord) return;
    await speakText(`Please spell: ${currentWord}`);
  };

  const updateCloudWordBank = (featureId, patch) => {
    setCloudWordBanks((prev) => ({
      ...prev,
      [featureId]: {
        ...(prev[featureId] || { words: [], isLoading: false, error: '', loadedAtIso: '' }),
        ...patch,
      },
    }));
  };

  const parseDataUrlInlineData = (dataUrl = '') => {
    const matched = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
    if (!matched) return null;
    return {
      mimeType: matched[1],
      data: matched[2],
    };
  };

  const arrayBufferToBase64 = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const generateReadingTutorIllustration = async ({ storyText, title, worksheetImageDataUrl = '' }) => {
    const worksheetInlineImage = parseDataUrlInlineData(worksheetImageDataUrl);
    if (!storyText.trim() && !worksheetInlineImage) {
      setReadingTutorIllustrationUrl('');
      setReadingTutorImageStatus('idle');
      return;
    }

    if (!googleAIKey) {
      if (worksheetImageDataUrl) {
        setReadingTutorIllustrationUrl(worksheetImageDataUrl);
        setReadingTutorImageStatus('ready');
      } else {
        setReadingTutorImageStatus('idle');
      }
      return;
    }

    setReadingTutorImageStatus('loading');

    const stylePrompt = `You are creating a bright and friendly 3D Disney-style image for a child's reading app.
Title: ${title || 'Reading Story'}
Story context: ${storyText || 'N/A'}
If an input worksheet image is provided, preserve the core scene objects and composition while polishing into colorful kid-friendly art.
Output: one final image only.`;

    const modelCandidates = [
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.5-flash-image-preview',
    ];

    for (const modelName of modelCandidates) {
      try {
        const parts = worksheetInlineImage
          ? [{ text: stylePrompt }, { inlineData: worksheetInlineImage }]
          : [{ text: stylePrompt }];

        const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleAIKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        });

        const result = await response.json();
        const imagePart = result?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data);
        if (!imagePart?.inlineData?.data) continue;

        setReadingTutorIllustrationUrl(`data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`);
        setReadingTutorImageStatus('ready');
        return;
      } catch (error) {
        console.warn(`[ReadingTutor] illustration generation failed with ${modelName}:`, error?.message || error);
      }
    }

    if (worksheetImageDataUrl) {
      setReadingTutorIllustrationUrl(worksheetImageDataUrl);
      setReadingTutorImageStatus('ready');
      return;
    }

    console.error('Reading tutor illustration generation failed: no supported image model returned output.');
    setReadingTutorIllustrationUrl('');
    setReadingTutorImageStatus('error');
  };

  const speakReadingTutorHint = async (hint, keyword = '') => {
    const fallback = hint || `Let's go on a word hunt. Can you find ${keyword}?`;
    if (!googleAIKey) {
      await speakText(fallback);
      return;
    }

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fallback }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        }),
      });

      const result = await response.json();
      const audioPart = result?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data);
      if (!audioPart?.inlineData?.data) {
        await speakText(fallback);
        return;
      }

      const ttsAudio = new Audio(`data:${audioPart.inlineData.mimeType || 'audio/wav'};base64,${audioPart.inlineData.data}`);
      await ttsAudio.play();
    } catch {
      await speakText(fallback);
    }
  };

  const parseWorksheetWithGemini = async ({ rawText, sourceFile, mode = 'week-day', targetWeek, targetDay, targetStoryNumber }) => {
    if (!googleAIKey) return null;

    const safeWeek = Math.max(1, Number(targetWeek || 1));
    const safeDay = Math.max(1, Number(targetDay || 1));
    const safeStoryNumber = Math.max(1, Number(targetStoryNumber || 1));
    const isStoryMode = mode === 'story-number';
    const weekDayPattern = /week\s*(\d{1,2})[^\d]{0,20}day\s*(\d)/i;
    const questionLabels = ['A', 'B', 'C', 'D'];

    const systemPrompt = isStoryMode
      ? `You are an expert reading teacher for Daily Reading Comprehension Grade 1.
Find ONLY the lesson for TARGET Story ${safeStoryNumber} (mapped from today's date).

Hard constraints:
- Prioritize explicit story numbering and student worksheet content.
- Ignore index, cover, teacher-guide, and "What's in This Book" pages.
- Do not return another story number.
- If target is not found, return an empty story and empty questions.
- Return JSON only.`
      : `You are an expert reading teacher for Daily Reading Comprehension Grade 1.
Find ONLY the lesson for TARGET Week ${safeWeek}, Day ${safeDay}.

Hard constraints:
- Prioritize page header markers (Week/Day on worksheet page) over index, cover, teacher-guide, or "What's in This Book" pages.
- Do not return a different week/day.
- If target is not found, return an empty story and empty questions.
- Return JSON only.`;

    const userQuery = isStoryMode
      ? `Provide lesson for Story ${safeStoryNumber} from the uploaded worksheet document.`
      : `Provide lesson for Week ${safeWeek}, Day ${safeDay} from the uploaded worksheet document.`;

    const promptParts = [{ text: userQuery }];
    if (sourceFile?.arrayBuffer && sourceFile?.mimeType) {
      promptParts.unshift({
        inlineData: {
          mimeType: sourceFile.mimeType,
          data: arrayBufferToBase64(sourceFile.arrayBuffer),
        },
      });
    }

    if (String(rawText || '').trim()) {
      promptParts.push({
        text: `Optional extracted text context:\n${String(rawText || '').slice(0, 50000)}`,
      });
    }

    const requestBody = {
      contents: [{ parts: promptParts }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: isStoryMode
          ? {
              type: 'object',
              properties: {
                story_number: { type: 'number' },
                skill: { type: 'string' },
                title: { type: 'string' },
                story: { type: 'string' },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      q: { type: 'string' },
                      a: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['q', 'a'],
                  },
                },
                sightWords: { type: 'array', items: { type: 'string' } },
              },
              required: ['story_number', 'skill', 'title', 'story', 'questions', 'sightWords'],
            }
          : {
              type: 'object',
              properties: {
                week_day: { type: 'string' },
                skill: { type: 'string' },
                title: { type: 'string' },
                story: { type: 'string' },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      q: { type: 'string' },
                      a: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['q', 'a'],
                  },
                },
                sightWords: { type: 'array', items: { type: 'string' } },
              },
              required: ['week_day', 'skill', 'title', 'story', 'questions', 'sightWords'],
            },
      },
    };

    const modelCandidates = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ];
    const maxRetries = 3;

    for (const modelName of modelCandidates) {
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
          const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleAIKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          const result = await response.json();
          const raw = (result?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
          if (!raw) throw new Error('Empty response from AI');

          const parsed = JSON.parse(raw);
          if (isStoryMode) {
            const matchedStory = Math.max(1, Number(parsed?.story_number || 0));
            if (matchedStory !== safeStoryNumber) {
              throw new Error(`Mismatched target story number: got Story ${matchedStory}`);
            }
          } else {
            const weekDayValue = String(parsed?.week_day || '').trim();
            const weekDayMatch = weekDayPattern.exec(weekDayValue);
            if (!weekDayMatch) throw new Error('Missing week/day in response');

            const matchedWeek = Number(weekDayMatch[1] || 0);
            const matchedDay = Number(weekDayMatch[2] || 0);
            if (matchedWeek !== safeWeek || matchedDay !== safeDay) {
              throw new Error(`Mismatched target week/day: got Week ${matchedWeek} Day ${matchedDay}`);
            }
          }

          const story = String(parsed?.story || '').trim();
          const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
          const questions = rawQuestions.slice(0, 3).map((item, idx) => {
            const choices = (Array.isArray(item?.a) ? item.a : [])
              .slice(0, 4)
              .map((choice, choiceIdx) => ({
                label: questionLabels[choiceIdx],
                text: String(choice || '').trim(),
              }))
              .filter((choice) => choice.text);

            return {
              id: `q-${idx + 1}`,
              questionNumber: idx + 1,
              stem: String(item?.q || '').trim(),
              options: choices,
              correctOptionLabel: null,
            };
          }).filter((q) => q.stem && q.options.length > 0);

          if (!story || questions.length === 0) {
            throw new Error('Target lesson incomplete');
          }

          const title = isStoryMode
            ? (String(parsed?.title || parsed?.skill || `Story ${safeStoryNumber}`).trim() || `Story ${safeStoryNumber}`)
            : (String(parsed?.title || parsed?.skill || `Week ${safeWeek} Day ${safeDay}`).trim() || `Week ${safeWeek} Day ${safeDay}`);
          const unit = {
            key: `week-${isStoryMode ? safeStoryNumber : safeWeek}-day-${isStoryMode ? 1 : safeDay}`,
            weekNumber: isStoryMode ? safeStoryNumber : safeWeek,
            dayNumber: isStoryMode ? 1 : safeDay,
            title,
            story,
            questions,
          };

          return {
            units: [unit],
            byWeekDay: { [unit.key]: unit },
            warnings: [],
          };
        } catch (error) {
          const message = String(error?.message || '').toLowerCase();
          const isModelNotFound = message.includes('404') || message.includes('not found for api version');
          if (isModelNotFound) {
            break;
          }
          if (attempt < maxRetries - 1) {
            await delay(Math.pow(2, attempt + 1) * 1000);
          }
        }
      }
    }

    return null;
  };

  const evaluateReadingTutorChoice = async ({ story, questionStem, options, selectedLabel }) => {
    const fallback = selectedLabel === 'A';
    if (!googleAIKey) return fallback;

    const optionsText = (options || []).map((option) => `${option.label}. ${option.text}`).join('\n');
    const prompt = `Read this story and question, then determine whether the selected option is correct.
Return JSON only: {"isCorrect": boolean}

Story:
${story}

Question:
${questionStem}

Options:
${optionsText}

Selected option: ${selectedLabel}`;

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      });

      const result = await response.json();
      const raw = (result?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.isCorrect);
    } catch {
      return fallback;
    }
  };

  const resetReadingTutorRun = () => {
    setReadingTutorQuestionIndex(0);
    setReadingTutorScore(0);
    setReadingTutorAnswers({});
    setReadingTutorHighlightTerms([]);
    setReadingTutorCelebrating(false);
    setReadingTutorFeedback('');
    setReadingTutorUnfamiliarWords([]);
    setReadingTutorWordReviewInProgress(false);
    setReadingTutorWordReviewCompleted(false);
    setReadingTutorReviewWordIndex(0);
    setReadingTutorReadingDoneSignal(0);
    setReadingTutorDiscussionQuestion('');
    setReadingTutorDiscussionTurns(0);
    setReadingTutorDiscussionDone(false);
  };

  const normalizeUnfamiliarWord = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .trim();

  const handleReadingTutorStoryWordTap = async (word) => {
    const normalized = normalizeUnfamiliarWord(word);
    if (!normalized) return;

    setReadingTutorUnfamiliarWords((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    await speakText(normalized, { rate: 0.78 });
  };

  const getStoryDiscussionFollowup = async ({ story, childAnswer, turns }) => {
    const fallback = {
      nextQuestion: turns >= 1 ? '' : 'Can you tell me one important thing that happened in the story?',
      confidence: turns >= 1 ? 0.9 : 0.55,
      encourageReadingLog: turns >= 1,
    };
    if (!googleAIKey) return fallback;

    const prompt = `You are a gentle Grade 1 reading coach.
Story:\n${story}
Child response:\n${childAnswer}
Current turn: ${turns}

Return JSON only:
{
  "nextQuestion": string,
  "confidence": number,
  "encourageReadingLog": boolean
}

Rules:
- confidence range 0..1
- if confidence >= 0.75, nextQuestion should be empty
- ask only one short follow-up question when needed`;

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      const result = await response.json();
      const raw = (result?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        nextQuestion: String(parsed?.nextQuestion || '').trim(),
        confidence: Math.max(0, Math.min(1, Number(parsed?.confidence || 0))),
        encourageReadingLog: Boolean(parsed?.encourageReadingLog),
      };
    } catch {
      return fallback;
    }
  };

  const shouldAutoFinalizeReading = async ({ transcriptBuffer, latestText }) => {
    const latest = String(latestText || '').trim();
    const combined = String(transcriptBuffer || '').trim();
    if (!latest || !combined) return false;

    const explicitEnding = /\b(the end|finally|in the end|that was|all done|done reading)\b/i.test(latest);
    if (explicitEnding) return true;

    const words = combined.split(/\s+/).filter(Boolean);
    if (words.length < 35) return false;
    if (!googleAIKey) return words.length >= 70;

    const prompt = `You are detecting if a child has likely finished reading a passage aloud.
Return JSON only: {"isDone": boolean}

Transcript so far:\n${combined.slice(-2400)}
Latest utterance:\n${latest}`;

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      const result = await response.json();
      const raw = (result?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.isDone);
    } catch {
      return words.length >= 70;
    }
  };

  const startReadingTutorWordReview = async () => {
    if (readingTutorWordReviewInProgress) return;

    const words = [...new Set(readingTutorUnfamiliarWords.map(normalizeUnfamiliarWord).filter(Boolean))];
    if (words.length === 0) {
      setReadingTutorWordReviewCompleted(true);
      setReadingTutorWordReviewInProgress(false);
      setReadingTutorFeedback('Great reading. No unfamiliar words were selected today.');
      if (readingPracticeFeatureId === 'story-a-day') {
        const firstQuestion = 'Nice work. What is this story mostly about?';
        setReadingTutorDiscussionQuestion(firstQuestion);
        setReadingTutorDiscussionTurns(0);
        setReadingTutorDiscussionDone(false);
        await speakText(firstQuestion);
      }
      return;
    }

    setReadingTutorReviewWordIndex(0);
    setReadingTutorWordReviewInProgress(true);
    setReadingTutorWordReviewCompleted(false);
    setReadingTutorFeedback('Let us practice together. Listen and then say the word clearly.');
    await speakText(`Great. First word: ${words[0]}. Please say ${words[0]}.`, { rate: 0.92 });
  };

  const completeReadingTutorWordReview = async () => {
    const words = [...new Set(readingTutorUnfamiliarWords.map(normalizeUnfamiliarWord).filter(Boolean))];
    if (user?.uid && words.length) {
      try {
        await upsertFeatureWords({
          db,
          appId,
          uid: user.uid,
          featureId: 'sightwords-master',
          words,
        });
        await loadFeatureWordBankState('sightwords-master');
      } catch (error) {
        console.error('Could not sync unfamiliar words to sight words bank:', error);
      }
    }

    setReadingTutorWordReviewCompleted(true);
    setReadingTutorWordReviewInProgress(false);

    if (readingPracticeFeatureId === 'story-a-day') {
      const firstQuestion = 'Great word practice. What is this story mostly about?';
      setReadingTutorDiscussionQuestion(firstQuestion);
      setReadingTutorDiscussionTurns(0);
      setReadingTutorDiscussionDone(false);
      setReadingTutorFeedback('Now let us discuss the story.');
      await speakText(firstQuestion);
      return;
    }

    setReadingTutorFeedback('Word review complete. Nice job! You can move to the questions now.');
    await speakText('Word review complete. Nice job!');
  };

  const applyReadingTutorWeekDay = (weekNumber, dayNumber, worksheetData = readingTutorWorksheetData) => {
    const safeWeek = Math.max(1, Math.min(52, Number(weekNumber || 1)));
    const safeDay = Math.max(1, Math.min(5, Number(dayNumber || 1)));
    const nextUnit = getWorksheetUnitForDate({
      worksheetData,
      weekNumber: safeWeek,
      dayNumber: safeDay,
    });

    setReadingTutorWeekNumber(safeWeek);
    setReadingTutorDayNumber(safeDay);
    setReadingTutorActiveUnit(nextUnit);
    resetReadingTutorRun();

    setReadingTutorIllustrationUrl('');
    setReadingTutorImageStatus('idle');
  };

  const loadReadingTutorWorksheet = async () => {
    const featureId = readingPracticeFeatureId || 'reading-tutor';
    const references = getFeatureReferences(featureId);
    if (references.length === 0) {
      setReadingTutorFeedback('Add a worksheet file in Settings before starting Reading Tutor.');
      setReadingTutorWorksheetData({ units: [], byWeekDay: {}, warnings: ['No linked worksheet references found.'] });
      setReadingTutorActiveUnit(null);
      return;
    }

    updateCloudWordBank(featureId, {
      isLoading: true,
      error: '',
    });

    try {
      const currentDate = new Date();
      const isStoryMode = featureId === 'story-a-day';
      const weekNumber = featureId === 'story-a-day'
        ? Math.max(1, Math.min(31, currentDate.getDate()))
        : getSchoolWeekNumber(currentDate);
      const dayNumber = featureId === 'story-a-day'
        ? 1
        : getSchoolDayNumber(currentDate);

      const targeted = isStoryMode
        ? { text: '', warnings: [] }
        : await loadWorksheetTargetTextFromLinkedReferences({
            references,
            cloudSessions,
            weekNumber,
            dayNumber,
          });

      const extracted = await loadWorksheetTextFromLinkedReferences({
        references,
        cloudSessions,
      });
      const worksheetSourceFile = await loadWorksheetSourceFileFromLinkedReferences({
        references,
        cloudSessions,
      });
      const focusedWorksheetText = isStoryMode
        ? (extracted.text || targeted.text)
        : (extractWorksheetSectionForWeekDay({
            text: targeted.text || extracted.text,
            weekNumber,
            dayNumber,
          }) || targeted.text || extracted.text);

      const geminiWorksheet = await parseWorksheetWithGemini({
        rawText: focusedWorksheetText,
        sourceFile: worksheetSourceFile,
        mode: isStoryMode ? 'story-number' : 'week-day',
        targetWeek: weekNumber,
        targetDay: dayNumber,
        targetStoryNumber: isStoryMode ? weekNumber : undefined,
      });
      const worksheetData = geminiWorksheet || parseWorksheetDocument(focusedWorksheetText, {
        targetWeek: weekNumber,
        targetDay: dayNumber,
      });

      setReadingTutorWorksheetData({
        units: worksheetData.units,
        byWeekDay: worksheetData.byWeekDay,
        warnings: [...(worksheetData.warnings || []), ...(targeted.warnings || []), ...extracted.warnings],
      });

      const firstUnit = getWorksheetUnitForDate({ worksheetData, weekNumber, dayNumber });
      const normalizedUnit = firstUnit
        ? {
            ...firstUnit,
            title: String(firstUnit.title || `Week ${weekNumber} Day ${dayNumber}`).trim() || `Week ${weekNumber} Day ${dayNumber}`,
          }
        : null;
      setReadingTutorActiveUnit(normalizedUnit);
      setReadingTutorWeekNumber(weekNumber);
      setReadingTutorDayNumber(dayNumber);
      resetReadingTutorRun();

      setReadingTutorIllustrationUrl('');
      setReadingTutorImageStatus('idle');

      updateCloudWordBank(featureId, {
        words: [],
        isLoading: false,
        error: '',
        loadedAtIso: new Date().toISOString(),
      });

      console.info('[ReadingTutor] Worksheet unit selected', {
        featureId,
        weekNumber,
        dayNumber,
        title: normalizedUnit?.title || '',
      });
    } catch (error) {
      updateCloudWordBank(featureId, {
        words: [],
        isLoading: false,
        error: error.message || 'Could not load reading worksheet.',
      });
      setReadingTutorFeedback(error.message || 'Could not load worksheet.');
    }
  };

  const handleReadingTutorAnswer = async (optionLabel) => {
    const questions = Array.isArray(readingTutorActiveUnit?.questions) ? readingTutorActiveUnit.questions : [];
    const currentQuestion = questions[readingTutorQuestionIndex];
    if (!currentQuestion) return;

    const normalizedLabel = String(optionLabel || '').toUpperCase();
    const expectedLabel = String(currentQuestion.correctOptionLabel || '').toUpperCase();
    const isCorrect = expectedLabel
      ? normalizedLabel === expectedLabel
      : await evaluateReadingTutorChoice({
          story: readingTutorActiveUnit?.story || '',
          questionStem: currentQuestion.stem,
          options: currentQuestion.options || [],
          selectedLabel: normalizedLabel,
        });

    setReadingTutorAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        selectedLabel: normalizedLabel,
        isCorrect,
        attempts: Number(prev?.[currentQuestion.id]?.attempts || 0) + 1,
      },
    }));

    if (!isCorrect) {
      const keywords = extractQuestionKeywords(currentQuestion.stem, 3);
      const strategyPrompt = keywords.length
        ? `Word hunt strategy: find ${keywords.join(', ')} in the story first.`
        : 'Word hunt strategy: find key clue words in the story first.';
      setReadingTutorHighlightTerms(keywords);

      setReadingTutorFeedback(strategyPrompt);
      await speakReadingTutorHint(strategyPrompt, keywords[0] || 'the clue');
      return;
    }

    setReadingTutorHighlightTerms([]);
    setReadingTutorScore((prev) => prev + 1);
    setReadingTutorFeedback('Excellent! You found the correct answer.');

    window.setTimeout(async () => {
      const nextIndex = readingTutorQuestionIndex + 1;
      if (nextIndex < questions.length) {
        setReadingTutorQuestionIndex(nextIndex);
        return;
      }

      setReadingTutorCelebrating(true);
      await launchCelebration();
      await speakText('Amazing reading! You finished all three questions!');
    }, 900);
  };

  const removeReferenceLink = (id) => {
    let removedResource = null;

    setLinkedResources((prev) => {
      removedResource = prev.find((resource) => resource.id === id) || null;
      return prev.filter((resource) => resource.id !== id);
    });

    if (!user?.uid) return;

    removeCloudReference({
      db,
      appId,
      uid: user.uid,
      referenceId: id,
    }).catch((error) => {
      console.error('Could not remove linked cloud reference:', error);
      if (removedResource) {
        setLinkedResources((prev) => [removedResource, ...prev]);
      }
    });
  };

  const handleSpellAssistPress = () => {
    if (isMockMode && view === 'journaling') {
      setIsListening(true);
      mockActionTimerRef.current = setTimeout(() => {
        void handleVoiceInput('how to spell elephant');
        stopListening();
      }, 500);
      return;
    }

    startListening();
  };

  const { startListening, stopListening } = useSpeechRecognitionLifecycle({
    isSpeaking,
    isMockMode,
    view,
    step,
    isConfirming,
    answers,
    setIsListening,
    setLastTranscript,
    setLastRecognitionState,
    onTranscript: (transcript) => {
      void handleVoiceInput(transcript);
    },
  });

  // ---  handle voice input logic ---
  const isWritingIntent = (text) => {
    const normalized = text.toLowerCase().trim();
    const triggerPhrases = [
      'i want to start writing',
      'start writing',
      'start journal',
      'start journaling',
      'start my writing',
      "let's start writing",
      'lets start writing',
      'i want to write my journal',
      'write my journal',
      'start my journal',
      'i want to write',
      'help me write',
      'let me write',
      'i am ready to write',
      "i'm ready to write",
      'writing time',
      'start my story',
      'tell my story'
    ];

    if (triggerPhrases.some((phrase) => normalized.includes(phrase))) {
      return true;
    }

    const hasWritingVerb = /(start|write|begin|make|create|tell)/.test(normalized);
    const hasWritingTarget = /(journal|story|writing)/.test(normalized);
    return hasWritingVerb && hasWritingTarget;
  };

  const openFeature = (featureId) => {
    const match = featureCards.find((card) => card.id === featureId);
    if (!match) return;

    stopListening();
    setSpellResult('');
    setUserInput('');

    if (match.id === 'writing-journal') {
      setView('home');
      setStep('idle');
      return;
    }

    if (match.id === 'reading-tutor' || match.id === 'story-a-day') {
      setReadingPracticeFeatureId(match.id);
      setReadingTutorWorksheetData({ units: [], byWeekDay: {}, warnings: [] });
      setReadingTutorActiveUnit(null);
      setReadingTutorFeedback('');
      setReadingTutorTranscriptBuffer('');
      const now = new Date();
      setReadingTutorWeekNumber(match.id === 'story-a-day' ? now.getDate() : getSchoolWeekNumber(now));
      setReadingTutorDayNumber(match.id === 'story-a-day' ? 1 : getSchoolDayNumber(now));
      setReadingTutorQuestionIndex(0);
      setReadingTutorScore(0);
      setReadingTutorAnswers({});
      setReadingTutorHighlightTerms([]);
      setReadingTutorCelebrating(false);
      setReadingTutorIllustrationUrl('');
      setReadingTutorImageStatus('idle');
      setReadingTutorUnfamiliarWords([]);
      setReadingTutorWordReviewInProgress(false);
      setReadingTutorWordReviewCompleted(false);
      setReadingTutorReviewWordIndex(0);
      setReadingTutorReadingDoneSignal(0);
      setReadingTutorDiscussionQuestion('');
      setReadingTutorDiscussionTurns(0);
      setReadingTutorDiscussionDone(false);
    }

    setStep('idle');
    setView(match.view);
  };

  const getSpellRequestWord = (text = '') => {
    const normalized = text.toLowerCase().trim();
    const spellMatch = normalized.match(/how (?:do i )?spell(?: the word)?\s+(.+)/i);
    return spellMatch?.[1]?.trim() || '';
  };

  const isSpellRequest = (text = '') => Boolean(getSpellRequestWord(text));

  const normalizeCapturedAnswer = (text = '') => text.trim().replace(/\s+/g, ' ');

  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const getNextFlowStep = (currentStep) => {
    const flow = [...guidedFlow, 'generating'];
    const currentIndex = flow.indexOf(currentStep);
    return flow[currentIndex + 1] || 'generating';
  };

  const sanitizeGuidance = (guidance, fallback) => {
    if (!guidance || typeof guidance !== 'object') return fallback;

    return {
      requestId: guidance.requestId || fallback.requestId,
      nextStep: [...guidedFlow, 'generating'].includes(guidance.nextStep) ? guidance.nextStep : fallback.nextStep,
      question: typeof guidance.question === 'string' && guidance.question.trim() ? guidance.question.trim() : fallback.question,
      shouldConfirm: typeof guidance.shouldConfirm === 'boolean' ? guidance.shouldConfirm : fallback.shouldConfirm,
      capturedAnswer: typeof guidance.capturedAnswer === 'string'
        ? normalizeCapturedAnswer(guidance.capturedAnswer)
        : fallback.capturedAnswer,
    };
  };

  const buildFallbackGuidance = ({ mode, currentStep, transcript = '', currentAnswers = {}, requestId }) => {
    const cleanedTranscript = normalizeCapturedAnswer(transcript);

    if (mode === 'story_capture') {
      return {
        requestId,
        nextStep: 'who',
        question: `Thanks for sharing. ${getStepQuestion('who', { ...currentAnswers, story: cleanedTranscript })}`,
        shouldConfirm: false,
        capturedAnswer: cleanedTranscript,
      };
    }

    if (mode === 'answer_capture') {
      return {
        requestId,
        nextStep: currentStep,
        question: `${getConfirmationQuestion(currentStep, cleanedTranscript)} Is this correct?`,
        shouldConfirm: true,
        capturedAnswer: cleanedTranscript,
      };
    }

    const nextStep = getNextFlowStep(currentStep);
    return {
      requestId,
      nextStep,
      question: nextStep === 'generating' ? '' : `Great! Next, ${getStepQuestion(nextStep, currentAnswers)}`,
      shouldConfirm: false,
      capturedAnswer: '',
    };
  };

  const buildLiveGuidancePrompt = ({ requestId, mode, currentStep, transcript = '', currentAnswers = {} }) => `
Plan the next app action for a child voice journaling session.

Return the result only through the ${geminiLiveFunctionName} function.

Session input:
${JSON.stringify({
  requestId,
  mode,
  currentStep,
  grade,
  transcript,
  answers: currentAnswers,
}, null, 2)}

Instructions:
- If mode is "story_capture", store the story in capturedAnswer, move to nextStep "who", and ask a specific who-question based on the story.
- If mode is "answer_capture", keep nextStep as the current step, set shouldConfirm to true, capture a lightly cleaned answer, and ask a short confirmation question.
- If mode is "advance", move to the next step in the flow story -> who -> what -> when -> where -> why -> how -> generating.
- For advance mode, ask one context-aware question for the next step using previous answers.
- If nextStep is "generating", set question to an empty string.
- Keep the tone encouraging and concise.
- Do not add facts that the child did not say.
`;

  const closeGeminiLiveSession = (reason = 'Closing Gemini Live session') => {
    if (livePendingGuidanceRef.current) {
      window.clearTimeout(livePendingGuidanceRef.current.timeoutId);
      livePendingGuidanceRef.current.reject(new Error(reason));
      livePendingGuidanceRef.current = null;
    }

    if (liveSocketRef.current) {
      try {
        liveSocketRef.current.close(1000, reason);
      } catch (error) {
        console.error('Gemini Live close error:', error);
      }
    }

    liveSocketRef.current = null;
    liveSetupPromiseRef.current = null;
    if (isLocal && !isMockMode) {
      setLiveErrorDetail(reason);
      setLiveLastEvent(reason);
      setLiveStatus(googleAIKey ? 'fallback' : 'fallback');
    }
  };

  const ensureGeminiLiveSession = async () => {
    if (liveSocketRef.current?.readyState === WebSocket.OPEN) {
      if (isLocal && !isMockMode) setLiveStatus('connected');
      return liveSocketRef.current;
    }

    if (liveSetupPromiseRef.current) {
      return liveSetupPromiseRef.current;
    }

    liveSetupPromiseRef.current = new Promise((resolve, reject) => {
      let setupResolved = false;
      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${googleAIKey}`
      );
      socket.binaryType = 'arraybuffer';

      liveSocketRef.current = socket;
      if (isLocal && !isMockMode) {
        setLiveStatus('connecting');
        setLiveLastEvent('Opening Gemini Live WebSocket.');
      }

      socket.onopen = () => {
        if (isLocal && !isMockMode) setLiveLastEvent('WebSocket opened. Sending setup.');
        socket.send(JSON.stringify({
          setup: {
            model: `models/${geminiLiveModel}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Puck',
                  },
                },
              },
            },
            systemInstruction: { parts: [{ text: geminiLiveSystemInstruction }] },
            tools: [{ functionDeclarations: [geminiLiveFunctionDeclaration] }],
          },
        }));
      };

      socket.onmessage = async (event) => {
        try {
          let rawMessage = '';

          if (typeof event.data === 'string') {
            rawMessage = event.data;
          } else if (event.data instanceof ArrayBuffer) {
            rawMessage = new TextDecoder().decode(event.data);
          } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
            rawMessage = await event.data.text();
          } else {
            rawMessage = String(event.data ?? '');
          }

          if (isLocal && !isMockMode) {
            setLiveRawPreview(rawMessage.slice(0, 400) || 'Empty message');
          }

          const message = JSON.parse(rawMessage);

          if (isLocal && !isMockMode) {
            if (message.setupComplete) {
              setLiveLastEvent('Received setupComplete.');
            } else if (message.toolCall?.functionCalls?.length) {
              setLiveLastEvent(`Received tool call: ${message.toolCall.functionCalls[0].name}.`);
            } else if (message.usageMetadata) {
              setLiveLastEvent('Received usage metadata.');
            } else if (message.serverContent) {
              setLiveLastEvent('Received server content.');
            } else if (message.error) {
              setLiveLastEvent(`Server error: ${message.error.message || 'Unknown error'}`);
            }
          }

          if (message.usageMetadata) {
            setLiveUsage(message.usageMetadata);
          }

          if (message.error) {
            const errorMessage = message.error.message || 'Gemini Live returned an error.';
            if (isLocal && !isMockMode) {
              setLiveErrorDetail(errorMessage);
            }
            reject(new Error(errorMessage));
            return;
          }

          if (message.setupComplete && !setupResolved) {
            setupResolved = true;
            liveSetupPromiseRef.current = null;
            if (isLocal && !isMockMode) {
              setLiveErrorDetail('');
              setLiveStatus('connected');
            }
            resolve(socket);
            return;
          }

          const functionCalls = message.toolCall?.functionCalls || [];

          functionCalls.forEach((functionCall) => {
            if (functionCall.name !== geminiLiveFunctionName) return;

            const args = typeof functionCall.args === 'string'
              ? JSON.parse(functionCall.args)
              : functionCall.args || {};

            if (isLocal && !isMockMode) {
              setLiveLastEvent(`Sending tool response for ${functionCall.name}.`);
            }

            socket.send(JSON.stringify({
              toolResponse: {
                functionResponses: [{
                  id: functionCall.id,
                  name: functionCall.name,
                  response: {
                    status: 'ok',
                    requestId: args.requestId || '',
                  },
                }],
              },
            }));

            if (!livePendingGuidanceRef.current) return;
            if (args.requestId !== livePendingGuidanceRef.current.requestId) return;

            window.clearTimeout(livePendingGuidanceRef.current.timeoutId);
            livePendingGuidanceRef.current.resolve(args);
            livePendingGuidanceRef.current = null;
          });
        } catch (error) {
          console.error('Gemini Live message parse error:', error);
          if (isLocal && !isMockMode) {
            setLiveErrorDetail(`Could not parse a Gemini Live message.${liveRawPreview ? ' See raw preview.' : ''}`);
            setLiveLastEvent('Failed to parse Gemini Live message.');
          }
        }
      };

      socket.onerror = () => {
        liveSetupPromiseRef.current = null;
        if (isLocal && !isMockMode) {
          setLiveErrorDetail('WebSocket error while talking to Gemini Live.');
          setLiveLastEvent('WebSocket onerror fired.');
          setLiveStatus('fallback');
        }
        reject(new Error('Gemini Live connection failed'));
      };

      socket.onclose = (event) => {
        liveSocketRef.current = null;
        liveSetupPromiseRef.current = null;
        if (isLocal && !isMockMode) {
          const detail = event.code === 1000
            ? 'Gemini Live session closed.'
            : `Gemini Live closed (${event.code}${event.reason ? `: ${event.reason}` : ''}).`;
          setLiveErrorDetail(detail);
          setLiveLastEvent(detail);
          setLiveStatus('fallback');
        }

        if (livePendingGuidanceRef.current) {
          window.clearTimeout(livePendingGuidanceRef.current.timeoutId);
          livePendingGuidanceRef.current.reject(new Error('Gemini Live session closed'));
          livePendingGuidanceRef.current = null;
        }
      };
    });

    return liveSetupPromiseRef.current;
  };

  const requestGuidedStep = async ({ mode, currentStep, transcript = '', currentAnswers = {} }) => {
    const requestId = `guidance_${Date.now()}_${liveRequestCounterRef.current += 1}`;
    const fallback = buildFallbackGuidance({
      mode,
      currentStep,
      transcript,
      currentAnswers,
      requestId,
    });

    if (isMockMode || !googleAIKey || typeof window === 'undefined' || typeof window.WebSocket === 'undefined') {
      if (isLocal) setLiveStatus(isMockMode ? 'mock' : 'fallback');
      return fallback;
    }

    try {
      const socket = await ensureGeminiLiveSession();

      if (livePendingGuidanceRef.current) {
        window.clearTimeout(livePendingGuidanceRef.current.timeoutId);
        livePendingGuidanceRef.current.reject(new Error('Superseded by a newer guidance request'));
        livePendingGuidanceRef.current = null;
      }

      const guidance = await new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          if (livePendingGuidanceRef.current?.requestId === requestId) {
            livePendingGuidanceRef.current = null;
          }
          reject(new Error('Gemini Live guidance timed out'));
        }, 9000);

        livePendingGuidanceRef.current = { requestId, resolve, reject, timeoutId };

        if (isLocal && !isMockMode) {
          setLiveLastEvent(`Sending ${mode} request for ${currentStep}.`);
        }

        socket.send(JSON.stringify({
          realtimeInput: {
            text: buildLiveGuidancePrompt({
              requestId,
              mode,
              currentStep,
              transcript,
              currentAnswers,
            }),
          },
        }));
      });

      return sanitizeGuidance(guidance, fallback);
    } catch (error) {
      console.error('Gemini Live guidance failed:', error);
      if (isLocal && !isMockMode) {
        setLiveErrorDetail(error.message || 'Gemini Live guidance failed.');
      }
      closeGeminiLiveSession('Reset after Gemini Live guidance failure');
      return fallback;
    }
  };

  useEffect(() => () => {
    if (livePendingGuidanceRef.current) {
      window.clearTimeout(livePendingGuidanceRef.current.timeoutId);
      livePendingGuidanceRef.current = null;
    }

    if (mockResumeTimerRef.current) {
      window.clearTimeout(mockResumeTimerRef.current);
      mockResumeTimerRef.current = null;
    }

    if (liveSocketRef.current) {
      try {
        liveSocketRef.current.close(1000, 'Component unmounted');
      } catch (error) {
        console.error('Gemini Live cleanup error:', error);
      }
    }

    closeReadingTutorLiveSession('Component unmounted');

    if (spellingPracticeTimerRef.current) {
      window.clearInterval(spellingPracticeTimerRef.current);
      spellingPracticeTimerRef.current = null;
    }

    if (fireworksStopRef.current) {
      fireworksStopRef.current();
      fireworksStopRef.current = null;
    }
  }, []);

  async function handleVoiceInput(text) {
    if (view === 'landing') {
      const landingIntent = getLandingIntent(text);
      if (!landingIntent) {
        speakText('Please say Reading Tutor, A Story a Day, Writing Journal, Spelling Champion, Sightwords Master, or 識字高手.');
        return;
      }

      if (landingIntent === 'setup') {
        setView('setup');
        return;
      }

      if (landingIntent === 'writing-journal') {
        setView('home');
        setStep('idle');
        startGuidedProcess();
        return;
      }

      openFeature(landingIntent);
      return;
    }

    if (featurePracticeSession.active && (view === 'sightwordsMaster' || view === 'chineseLiteracy')) {
      const expectedFeature = view === 'sightwordsMaster' ? 'sightwords-master' : 'chinese-literacy';
      if (featurePracticeSession.featureId !== expectedFeature) return;

      const current = featurePracticeSession.words[featurePracticeSession.index];
      if (!current?.word) return;

      const normalizedTranscript = normalizeSpokenPhrase(text);
      const skipRequested = /\b(i\s*(do\s*not|don'?t)\s*know|next|skip)\b/.test(normalizedTranscript);
      const deterministicCorrect = matchesSpokenWord(current.word, text) || likelySpokenTokenMatch(current.word, text);
      const aiEvaluation = (skipRequested || deterministicCorrect)
        ? { isCorrect: deterministicCorrect, feedback: deterministicCorrect ? 'Great job! Correct!' : '', exampleSentence: '' }
        : await evaluateFeaturePracticeAnswer({
            featureId: featurePracticeSession.featureId,
            expectedWord: current.word,
            transcript: text,
          });
      const isCorrect = !skipRequested && (deterministicCorrect || Boolean(aiEvaluation.isCorrect));

      const currentBox = Math.min(5, Math.max(1, Number(current.reviewFrequency || 1)));
      const nextFrequency = isCorrect ? Math.min(5, currentBox + 1) : 1;

      await upsertFeatureWordBankEntry({
        featureId: featurePracticeSession.featureId,
        word: current.word,
        reviewFrequency: nextFrequency,
      });

      if (!isCorrect) {
        const correction = featurePracticeSession.featureId === 'chinese-literacy'
          ? `正確答案是 ${current.word}。`
          : `The correct word is ${current.word}.`;
        setFeaturePracticeSession((prev) => ({
          ...prev,
          feedback: featurePracticeSession.featureId === 'chinese-literacy'
            ? `再試一次。正確是：${current.word}`
            : `Try again. Correct word: ${current.word}`,
        }));
        await speakText(correction);
      } else {
        setFeaturePracticeSession((prev) => ({ ...prev, feedback: aiEvaluation.feedback?.trim() || 'Great job! Correct!' }));
      }

      const nextIndex = featurePracticeSession.index + 1;
      if (nextIndex >= featurePracticeSession.words.length) {
        stopFeaturePracticeSession();
        await launchCelebration();
        await speakText('Amazing effort! You did a very good job!');
        return;
      }

      setFeaturePracticeSession((prev) => ({
        ...prev,
        index: nextIndex,
      }));
      return;
    }

    if (view === 'spellingChampion' && spellingQuizState.open && spellingQuizState.awaitingVoiceAnswer) {
      setSpellingQuizState((prev) => ({
        ...prev,
        answer: normalizeWordToken(text),
        awaitingVoiceAnswer: false,
      }));
      stopListening();
      return;
    }

    if (view === 'readingTutor' || view === 'storyADay') {
      if (view === 'storyADay' && readingTutorWordReviewCompleted && !readingTutorDiscussionDone) {
        const followup = await getStoryDiscussionFollowup({
          story: readingTutorActiveUnit?.story || '',
          childAnswer: text,
          turns: readingTutorDiscussionTurns,
        });

        const nextTurns = readingTutorDiscussionTurns + 1;
        if (followup.confidence >= 0.75 || nextTurns >= 3 || !followup.nextQuestion) {
          setReadingTutorDiscussionDone(true);
          setReadingTutorDiscussionQuestion('');
          setReadingTutorDiscussionTurns(nextTurns);
          setReadingTutorFeedback('Awesome thinking. If you want, you can now write a reading log in Writing Journal.');
          await speakText('Awesome thinking. If you want, you can now write a reading log in Writing Journal.');
          return;
        }

        setReadingTutorDiscussionTurns(nextTurns);
        setReadingTutorDiscussionQuestion(followup.nextQuestion);
        setReadingTutorFeedback(`Great answer. ${followup.nextQuestion}`);
        await speakText(followup.nextQuestion);
        return;
      }

      if (readingTutorWordReviewInProgress) {
        const words = [...new Set(readingTutorUnfamiliarWords.map(normalizeUnfamiliarWord).filter(Boolean))];
        const target = words[readingTutorReviewWordIndex] || '';
        if (!target) {
          await completeReadingTutorWordReview();
          return;
        }

        const spoken = normalizeSpokenPhrase(text);
        const isCorrect = matchesSpokenWord(target, spoken) || likelySpokenTokenMatch(target, spoken);
        if (!isCorrect) {
          setReadingTutorFeedback(`Good try. Listen again: ${target}. Then say ${target}.`);
          await speakText(`Nice try. The word is ${target}. Please repeat: ${target}.`, { rate: 0.9 });
          return;
        }

        const nextIndex = readingTutorReviewWordIndex + 1;
        if (nextIndex >= words.length) {
          await speakText('Excellent! You said all unfamiliar words correctly.');
          setReadingTutorReviewWordIndex(nextIndex);
          await completeReadingTutorWordReview();
          return;
        }

        setReadingTutorReviewWordIndex(nextIndex);
        const nextWord = words[nextIndex];
        setReadingTutorFeedback(`Great! Next word: ${nextWord}`);
        await speakText(`Great. Next word: ${nextWord}. Please say ${nextWord}.`, { rate: 0.92 });
        return;
      }

      const normalized = normalizeSpokenPhrase(text);
      const helpIntent = /\b(help|guidance|guide|stuck|need help|dont understand|don't understand)\b/.test(normalized);

      if (readingTutorSession.awaitingQuestionRead) {
        const guidance = await getReadingTutorQuestionGuidance({
          worksheetTopic: readingTutorSession.worksheetTopic,
          questionLabel: readingTutorSession.currentQuestionLabel,
          questionText: text,
        });

        setReadingTutorSession((prev) => ({
          ...prev,
          awaitingQuestionRead: false,
          awaitingQuestionLabel: false,
        }));
        setReadingTutorFeedback(guidance);
        await speakText(guidance);
        return;
      }

      if (readingTutorSession.awaitingQuestionLabel) {
        const numberMatch = normalized.match(/\b(\d{1,2})\b/);
        const label = numberMatch ? `Question ${numberMatch[1]}` : text.trim();
        setReadingTutorSession((prev) => ({
          ...prev,
          awaitingQuestionLabel: false,
          awaitingQuestionRead: true,
          currentQuestionLabel: label,
        }));
        const askRead = `Great. Please read ${label} out loud, and I will guide you step by step.`;
        setReadingTutorFeedback(askRead);
        await speakText(askRead);
        return;
      }

      if (helpIntent) {
        setReadingTutorSession((prev) => ({
          ...prev,
          awaitingQuestionLabel: true,
          awaitingQuestionRead: false,
        }));
        const askQuestion = 'Sure. Which question do you need help with? Tell me the question number.';
        setReadingTutorFeedback(askQuestion);
        await speakText(askQuestion);
        return;
      }

      const nextTranscript = [readingTutorTranscriptBuffer, text.trim()].filter(Boolean).join(' ').trim();
      const isDone = await shouldAutoFinalizeReading({
        transcriptBuffer: nextTranscript,
        latestText: text,
      });

      if (!isDone) {
        setReadingTutorTranscriptBuffer(nextTranscript);
        return;
      }

      const worksheetStory = [nextTranscript]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (worksheetStory) {
        console.info('[ReadingTutor] Worksheet identified from student story', {
          worksheetStory,
          grade,
          capturedAtIso: new Date().toISOString(),
        });
      }

      const worksheetFeedback = await getReadingTutorWorksheetFeedback({ transcript: worksheetStory || text });
      setReadingTutorSession((prev) => ({
        ...prev,
        worksheetTopic: worksheetStory || text.trim() || prev.worksheetTopic,
      }));
      setReadingTutorTranscriptBuffer('');
      setReadingTutorReadingDoneSignal((prev) => prev + 1);
      setReadingTutorFeedback(worksheetFeedback);
      await speakText(worksheetFeedback);
      return;
    }

    if (view === 'journaling' && isSpellRequest(text)) {
      const word = getSpellRequestWord(text);
      if (word) {
        handleSpellCheck(word);
      }
      return;
    }

    if (view === 'home' && step === 'idle' && isWritingIntent(text)) {
      startGuidedProcess();
      return;
    }

    if (text.includes('go back') || text.includes('previous step')) {
      moveToPrevStep();
      return;
    }

    if (step === 'story') {
      await processStoryIntro(text);
      return;
    }

    // 5W1H 核心引導流程
    if (fiveWSteps.includes(step)) {
      if (isConfirming) {
        await handleConfirmation(text);
      } else {
        await processInitialAnswer(text);
      }
    }
  }

  // --- 5W1H logic ---
  const startGuidedProcess = () => {
    setAnswers({});
    setUserInput(''); 
    setLastTranscript('');
    setLastRecognitionState('Starting guided session.');
    setStep('story');
    setIsConfirming(false);
    hasPausedAtStoryMockRef.current = false;
    speakAndListen("Awesome! Tell me about your story.");
  };

  const processStoryIntro = async (text) => {
    const storyText = normalizeCapturedAnswer(text);
    if (!storyText) return;

    const guidance = await requestGuidedStep({
      mode: 'story_capture',
      currentStep: 'story',
      transcript: storyText,
      currentAnswers: answers,
    });

    const capturedStory = storyText;
    const nextStep = guidance.nextStep || 'who';
    const nextAnswers = { ...answers, story: capturedStory };

    setAnswers(nextAnswers);
    setUserInput(capturedStory);
    setStep(nextStep);
    setIsConfirming(Boolean(guidance.shouldConfirm));
    speakAndListen(guidance.question || `Thanks for sharing. ${getStepQuestion(nextStep, nextAnswers)}`);
  };

  // step 1: handle initial answer and ask for confirmation
  const processInitialAnswer = async (text) => {
    const currentStep = step;
    const cleanedText = normalizeCapturedAnswer(text);
    if (!cleanedText) return;

    const guidance = await requestGuidedStep({
      mode: 'answer_capture',
      currentStep,
      transcript: cleanedText,
      currentAnswers: answers,
    });

    const capturedAnswer = cleanedText;
    setAnswers(prev => ({ ...prev, [currentStep]: capturedAnswer }));
    setUserInput(capturedAnswer);
    setIsConfirming(guidance.shouldConfirm ?? true);

    const confirmationQuestion = `${getConfirmationQuestion(currentStep, capturedAnswer)} Is this correct?`;
    speakAndListen(confirmationQuestion);
  };

  // Step 2：comfirm with user if the answer is correct, if not, let them answer again
  const handleConfirmation = async (text) => {
    const positiveWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'it is', 'sure'];
    const negativeWords = ['no', 'nope', 'not', 'wrong', 'change', 'incorrect', 'wait'];

    const isYes = positiveWords.some(word => text.includes(word));
    const isNo = negativeWords.some(word => text.includes(word));

    if (isYes) {
      // move to next question
      await moveToNextStep();
    } else if (isNo) {
      // back to current question and let user answer again
      setIsConfirming(false);
      setUserInput('');
      const question = getStepQuestion(step, answers);
      speakAndListen(`No problem! Let's try again. ${question}`);
    } else {
       if (text.length > 3 && !isYes && !isNo) { 
        await processInitialAnswer(text);
        return;
      }
      speakAndListen(`I didn't quite catch that. Is "${answers[step]}" correct? Please say Yes or No.`);
    }
  };

  const getStepQuestion = (s, context = {}) => {
    const whoLabel = context.who ? `${context.who}` : 'them';
    const whatLabel = context.what ? `${context.what}` : 'that';
    const questions = {
      story: "Tell me about your story.",
      who: "Who were you with today?",
      what: context.who ? `What did you do with ${whoLabel}?` : "What did you do?",
      when: context.what ? `When did ${whatLabel} happen?` : "When did this happen?",
      where: context.what ? `Where did ${whatLabel} happen?` : "Where were you?",
      why: context.what ? `Why was ${whatLabel} special?` : "Why was it special?",
      how: context.what ? `How did you feel when ${whatLabel} happened?` : "How did you feel about it?"
    };
    return questions[s] || "";
  };

  const getConfirmationQuestion = (s, answer) => {
    const questions = {
      who: `You said you were with ${answer}.`,
      what: `You said you did ${answer}.`,
      when: `You said it happened ${answer}.`,
      where: `You mentioned you were at ${answer}.`,
      why: answer.toLowerCase().startsWith('because ')
        ? `You said ${answer}.`
        : `You said it was special because ${answer}.`,
      how: `You said you felt ${answer}.`
    };
    return `${questions[s] || `You said: ${answer}.`}`;
  };

  const triggerMockInput = () => {
    if (step === 'idle') {
      void handleVoiceInput("i want to start writing");
    } else if (step === 'story') {
      if (!hasPausedAtStoryMockRef.current) {
        hasPausedAtStoryMockRef.current = true;
        stopListening();
        mockResumeTimerRef.current = setTimeout(() => {
          startListening();
          mockResumeTimerRef.current = null;
        }, 1200);
        return;
      }

      void handleVoiceInput("I went to the zoo with my brother and saw a huge elephant");
    } else if (isConfirming) {
      void handleVoiceInput("yes");
    } else {
      const mocks = {
        who: "my big brother",
        what: "went to the zoo",
        when: "on Saturday morning",
        where: "at the city zoo",
        why: "we saw a huge elephant",
        how: "so excited"
      };
      void handleVoiceInput(mocks[step] || "it was fun");
    }
    stopListening();
  };

  const moveToNextStep = async () => {
    const guidance = await requestGuidedStep({
      mode: 'advance',
      currentStep: step,
      currentAnswers: answers,
    });

    const nextStep = guidance.nextStep || getNextFlowStep(step);
    
    setStep(nextStep);
    setIsConfirming(false);
    setUserInput('');

    if (nextStep === 'generating') {
      generateJournalContent(answers);
    } else {
      speakAndListen(guidance.question || `Great! Next, ${getStepQuestion(nextStep, answers)}`);
    }
  };

  const moveToPrevStep = () => {
    const flow = guidedFlow;
    const currentIndex = flow.indexOf(step);
    if (currentIndex > 0) {
      const prevStep = flow[currentIndex - 1];
      const previousAnswer = answers[prevStep] || '';
      setStep(prevStep);
      setIsConfirming(false);
      setUserInput(previousAnswer);
      const confirmationText = prevStep !== 'story' && previousAnswer ? ` ${getConfirmationQuestion(prevStep, previousAnswer)}` : '';
      speakAndListen(`Let's go back. ${getStepQuestion(prevStep, answers)}${confirmationText}`);
    } else if (step === 'story') {
      setStep('idle');
      setAnswers({});
      speakText("Going back to home.");
    }
  };

  // --- Speak and Listen ---
   const speakAndListen = async (text) => {

    stopListening();
    setLastRecognitionState('Speaking prompt.');
    await speakText(text);
    setTimeout(() => startListening(), 300);

    // const isFlowActive = ['who', 'what', 'when', 'where', 'why', 'how'].includes(step) || step === 'idle';
    
    // if (isMockMode && isFlowActive) {
    //   setTimeout(() => startListening(), 800); 
    //   return
    // }
    // await speakText(text);
    // setTimeout(() => {
    //   startListening();
    // }, 500); 

  };

  const saveJournalToCloud = async (content, photoUrl) => {
    if (!user) return;
    try {
      // 依照規則路徑: /artifacts/{appId}/users/{userId}/journals
      const colRef = collection(db, 'artifacts', appId, 'users', user.uid, 'journals');
      await addDoc(colRef, {
        content,
        imageUrl: photoUrl,
        grade,
        answers,
        createdAt: serverTimestamp()
      });
      console.log("已同步至雲端");
    } catch (err) {
      console.error("雲端儲存失敗:", err);
    }
  };

  const buildFallbackJournal = (data = {}) => {
    const who = data.who || 'someone special';
    const what = data.what || 'did something fun';
    const when = data.when || 'today';
    const where = data.where || 'somewhere nice';
    const why = data.why || 'it felt special';
    const how = data.how || 'happy';

    return `Today I was with ${who}. We ${what} ${where} ${when}. It was special because ${why}. I felt ${how}.`;
  };

  const fetchGeminiWithRetry = async (url, options) => {
    const retryDelays = [2000, 4000, 8000];

    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const response = await fetch(url, options);

        if (response.ok) {
          return response;
        }

        const errorText = await response.text();
        const isRetryable = response.status === 503;

        if (!isRetryable || attempt === retryDelays.length) {
          const finalError = new Error(`Gemini request failed with ${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ''}`);
          finalError.retryable = false;
          throw finalError;
        }

        console.warn(`Gemini request failed with ${response.status}. Retrying in ${retryDelays[attempt] / 1000}s.`);
        await delay(retryDelays[attempt]);
      } catch (error) {
        const isLastAttempt = attempt === retryDelays.length;

        if (error?.retryable === false) {
          throw error;
        }

        if (isLastAttempt) {
          throw error;
        }

        console.warn(`Gemini request error. Retrying in ${retryDelays[attempt] / 1000}s.`, error);
        await delay(retryDelays[attempt]);
      }
    }

    throw new Error('Gemini request failed after retries.');
  };

  async function getSpellingCoachHint({ word, attemptedAnswer }) {
    const fallbackHint = `Let us try this together. Listen for sounds in ${word}.`;
    if (!googleAIKey) return fallbackHint;
    const customPrompt = (featureCustomMessages['spelling-champion'] || '').trim();

    const prompt = `${SPELLING_TEACHER_SYSTEM_PROMPT}
You are coaching a child in a spelling game.
Target word: ${word}
Student attempt: ${attemptedAnswer || '(no answer)'}
${customPrompt ? `Feature custom requirement:\n${customPrompt}` : ''}

Return one short, encouraging coaching sentence focused on phonetic awareness. Keep it under 18 words.`;

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      const result = await response.json();
      const text = (result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      return text || fallbackHint;
    } catch {
      return fallbackHint;
    }
  }

  async function getReadingTutorWorksheetFeedback({ transcript }) {
    const fallback = 'I am listening. If you need help, say: I need help on a question.';
    if (!googleAIKey) return fallback;

    const customPrompt = (featureCustomMessages['reading-tutor'] || '').trim();

    const prompt = `You are a supportive reading tutor for elementary students.
Student transcript about worksheet context: ${transcript}
Student grade: ${grade}
${customPrompt ? `Feature custom requirement:\n${customPrompt}` : ''}

Return one short response (max 18 words):
- confirm you understood the worksheet/topic
- invite student to ask for question guidance.`;

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      const result = await response.json();
      const text = (result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      return text || fallback;
    } catch {
      return fallback;
    }
  }

  const buildReadingTutorGuidancePrompt = ({ worksheetTopic, questionLabel, questionText }) => {
    const strategyByGrade = {
      Kindergarten: 'Use picture clues, repeat key words, and ask simple who/what questions.',
      'Grade 1': 'Use decoding + sight words, chunk short phrases, and identify what the question asks.',
      'Grade 2': 'Find key words, reread nearby sentences, and choose evidence from the text.',
      'Grade 3': 'Restate the question, scan for evidence, and explain why the evidence matches.',
      'Grade 4': 'Identify question type, locate evidence, and justify answer with text details.',
      'Grade 5': 'Summarize the question, compare evidence options, and justify with precise text evidence.',
    };

    const customPrompt = (featureCustomMessages['reading-tutor'] || '').trim();
    return `Student grade: ${grade}
Worksheet topic/context: ${worksheetTopic || 'not specified'}
Question label: ${questionLabel || 'not specified'}
Question text read by student: ${questionText}
Grade strategy: ${strategyByGrade[grade] || strategyByGrade['Grade 1']}
${customPrompt ? `Feature custom requirement:\n${customPrompt}` : ''}

Task:
- Guide the student to discover the answer using reading strategies suitable for the grade.
- Do not give the final answer directly unless the student explicitly asks for direct answer.
- Use scaffolded support: identify key words, restate the question, hint where to look, ask one guiding question.

Output:
- One concise coaching response, maximum 60 words.
- Include 2-3 concrete steps and exactly one guiding question at the end.
- Friendly, encouraging, and actionable.`;
  };

  const extractReadingTutorLiveText = (message = {}) => {
    const candidateParts = [
      ...(message.serverContent?.modelTurn?.parts || []),
      ...(message.candidates?.[0]?.content?.parts || []),
    ];

    for (const part of candidateParts) {
      const text = String(part?.text || '').trim();
      if (text) return text;
    }

    return '';
  };

  const closeReadingTutorLiveSession = (reason = 'Closing Reading Tutor Gemini Live session') => {
    if (readingTutorLivePendingRef.current) {
      window.clearTimeout(readingTutorLivePendingRef.current.timeoutId);
      readingTutorLivePendingRef.current.reject(new Error(reason));
      readingTutorLivePendingRef.current = null;
    }

    if (readingTutorLiveSocketRef.current) {
      try {
        readingTutorLiveSocketRef.current.close(1000, reason);
      } catch {
        // no-op
      }
    }

    readingTutorLiveSocketRef.current = null;
    readingTutorLiveSetupPromiseRef.current = null;
  };

  const setupReadingTutorLiveSocket = (modelName) => new Promise((resolve, reject) => {
    let setupResolved = false;

    const socket = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${googleAIKey}`
    );
    socket.binaryType = 'arraybuffer';
    readingTutorLiveSocketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({
        setup: {
          model: `models/${modelName}`,
          generationConfig: {
            responseModalities: ['TEXT'],
          },
          systemInstruction: { parts: [{ text: readingTutorLiveSystemInstruction }] },
        },
      }));
    };

    socket.onmessage = async (event) => {
      try {
        let rawMessage = '';

        if (typeof event.data === 'string') {
          rawMessage = event.data;
        } else if (event.data instanceof ArrayBuffer) {
          rawMessage = new TextDecoder().decode(event.data);
        } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
          rawMessage = await event.data.text();
        } else {
          rawMessage = String(event.data ?? '');
        }

        const message = JSON.parse(rawMessage);

        if (message.error) {
          const errorMessage = message.error.message || 'Reading Tutor Gemini Live returned an error.';
          reject(new Error(errorMessage));
          return;
        }

        if (message.setupComplete && !setupResolved) {
          setupResolved = true;
          resolve(socket);
          return;
        }

        const liveText = extractReadingTutorLiveText(message);
        if (!liveText || !readingTutorLivePendingRef.current) return;

        window.clearTimeout(readingTutorLivePendingRef.current.timeoutId);
        readingTutorLivePendingRef.current.resolve(liveText);
        readingTutorLivePendingRef.current = null;
      } catch (error) {
        reject(error);
      }
    };

    socket.onerror = () => {
      reject(new Error('Reading Tutor Gemini Live connection failed'));
    };

    socket.onclose = () => {
      readingTutorLiveSocketRef.current = null;
      if (readingTutorLivePendingRef.current) {
        window.clearTimeout(readingTutorLivePendingRef.current.timeoutId);
        readingTutorLivePendingRef.current.reject(new Error('Reading Tutor Gemini Live session closed'));
        readingTutorLivePendingRef.current = null;
      }
    };
  });

  const ensureReadingTutorLiveSession = async () => {
    if (readingTutorLiveSocketRef.current?.readyState === WebSocket.OPEN) {
      return readingTutorLiveSocketRef.current;
    }

    if (readingTutorLiveSetupPromiseRef.current) {
      return readingTutorLiveSetupPromiseRef.current;
    }

    readingTutorLiveSetupPromiseRef.current = (async () => {
      try {
        return await setupReadingTutorLiveSocket(readingTutorLiveModel);
      } catch (primaryError) {
        closeReadingTutorLiveSession('Primary Reading Tutor model setup failed');
        if (readingTutorLiveFallbackModel === readingTutorLiveModel) {
          throw primaryError;
        }
        return setupReadingTutorLiveSocket(readingTutorLiveFallbackModel);
      } finally {
        readingTutorLiveSetupPromiseRef.current = null;
      }
    })();

    return readingTutorLiveSetupPromiseRef.current;
  };

  const requestReadingTutorLiveGuidance = async ({ worksheetTopic, questionLabel, questionText }) => {
    if (!googleAIKey || typeof window === 'undefined' || typeof window.WebSocket === 'undefined') return '';

    try {
      const socket = await ensureReadingTutorLiveSession();
      const requestId = `reading_tutor_guidance_${Date.now()}_${readingTutorLiveRequestCounterRef.current += 1}`;

      if (readingTutorLivePendingRef.current) {
        window.clearTimeout(readingTutorLivePendingRef.current.timeoutId);
        readingTutorLivePendingRef.current.reject(new Error('Superseded by a newer reading tutor guidance request'));
        readingTutorLivePendingRef.current = null;
      }

      const liveText = await new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          if (readingTutorLivePendingRef.current?.requestId === requestId) {
            readingTutorLivePendingRef.current = null;
          }
          reject(new Error('Reading Tutor Gemini Live guidance timed out'));
        }, 9000);

        readingTutorLivePendingRef.current = {
          requestId,
          resolve,
          reject,
          timeoutId,
        };

        socket.send(JSON.stringify({
          realtimeInput: {
            text: buildReadingTutorGuidancePrompt({ worksheetTopic, questionLabel, questionText }),
          },
        }));
      });

      return String(liveText || '').trim();
    } catch {
      closeReadingTutorLiveSession('Reset after Reading Tutor Gemini Live guidance failure');
      return '';
    }
  };

  async function getReadingTutorQuestionGuidance({ worksheetTopic, questionLabel, questionText }) {
    const fallback = 'Let us find key words first. Read the question slowly and underline what it asks.';
    if (!googleAIKey) return fallback;

    const liveText = await requestReadingTutorLiveGuidance({ worksheetTopic, questionLabel, questionText });
    if (liveText) return liveText;

    const prompt = buildReadingTutorGuidancePrompt({ worksheetTopic, questionLabel, questionText });

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      const result = await response.json();
      const text = (result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      return text || fallback;
    } catch {
      return fallback;
    }
  }

  async function evaluateFeaturePracticeAnswer({ featureId, expectedWord, transcript }) {
    const normalizedTranscript = normalizeSpokenPhrase(transcript);
    const fallbackCorrect = matchesSpokenWord(expectedWord, transcript);
    const fallback = {
      isCorrect: fallbackCorrect,
      feedback: fallbackCorrect ? 'Great job! Correct!' : `Not quite. The correct word is ${expectedWord}.`,
      exampleSentence: '',
    };

    if (!googleAIKey || !expectedWord.trim() || !normalizedTranscript) return fallback;

    const isChineseFeature = featureId === 'chinese-literacy';
    const systemPrompt = isChineseFeature
      ? CHINESE_LITERACY_TEACHER_SYSTEM_PROMPT
      : SIGHTWORD_TEACHER_SYSTEM_PROMPT;
    const customPrompt = (featureCustomMessages[featureId] || '').trim();
    const prompt = `${systemPrompt}

Task:
- Evaluate whether the child correctly read the target word.
- Be tolerant of messy speech, but do NOT mark correct if the target appears only incidentally in a longer unrelated phrase.
- Reduce false positives: if uncertain, return isCorrect=false.
- Improve true-positive recall for children: if transcript appears to be an ASR misspelling or close phonetic attempt of the target, prefer isCorrect=true.

Feature: ${featureId}
Target word: ${expectedWord}
Child transcript: ${transcript}
${customPrompt ? `Feature custom requirement:\n${customPrompt}` : ''}

Return JSON only with this shape:
{
  "isCorrect": boolean,
  "feedback": "short encouraging sentence",
  "exampleSentence": "one natural child-friendly sentence using target word; empty string if not needed"
}

Rules:
- feedback max 20 words.
- If isCorrect=true, exampleSentence can be empty.
- If isCorrect=false, exampleSentence should be natural and age-appropriate.`;

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      });

      const result = await response.json();
      const raw = (result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!raw) return fallback;

      const parsed = JSON.parse(raw);
      const isCorrect = Boolean(parsed?.isCorrect);
      const feedback = String(parsed?.feedback || '').trim();
      const exampleSentence = String(parsed?.exampleSentence || '').trim();

      return {
        isCorrect,
        feedback: feedback || (isCorrect ? 'Great job! Correct!' : `Not quite. The correct word is ${expectedWord}.`),
        exampleSentence: isCorrect ? '' : exampleSentence,
      };
    } catch {
      return fallback;
    }
  }

  const getGradePromptGuidance = (selectedGrade) => {
    const gradeGuidance = {
      Kindergarten: `Kindergarten writing goals:
- Write 1-2 very simple sentences.
- Use simple ideas the child could dictate or copy, like "I like my dog."
- Model a capital letter at the beginning and a period at the end.
- Use very simple, phonetic-friendly vocabulary.`,
      'Grade 1': `1st grade writing goals:
- Write 3-4 connected complete sentences.
- Use capitalization and ending punctuation consistently.
- Stay on one clear topic with gentle adult-supported structure.
- Prefer common sight words and decodable words.`,
      'Grade 2': `2nd grade writing goals:
- Write several sentences about one topic.
- Use clear basic sentence structure.
- Include simple temporal words such as "First," "Then," or "Next" when they fit.
- Keep the writing easy to revise for clarity with guidance.`,
      'Grade 3': `3rd grade writing goals:
- Write one organized paragraph with a topic sentence and relevant details.
- Use linking words, capitalization, and punctuation consistently.
- Add light description and natural story detail.
- Keep the structure appropriate for a short narrative paragraph.`,
      'Grade 4': `4th grade writing goals:
- Write a more structured multi-paragraph response.
- Give a gentle introduction, supporting middle, and short conclusion.
- Use transitions to guide the reader.
- Keep the writing clear and age-appropriate, not overly formal.`,
      'Grade 5': `5th grade writing goals:
- Write a structured 5-paragraph-style journal response when appropriate: introduction, 3 supporting body paragraphs, and conclusion.
- Strengthen paragraph structure, transitions, and voice.
- Keep the tone personal and narrative rather than academic research writing.
- Revise for clarity, flow, and independence.`,
    };

    return gradeGuidance[selectedGrade] || gradeGuidance['Grade 1'];
  };

  const getGradeExpectationSummary = (selectedGrade) => {
    const summaries = {
      Kindergarten: 'Expect very short, simple sentences with modeled capitals and periods, plus easy sound-it-out vocabulary that a child can dictate or copy.',
      'Grade 1': 'Expect complete sentences, early narrative flow across 3 to 4 connected ideas, and simple on-topic writing with basic capitalization and punctuation.',
      'Grade 2': 'Expect multiple sentences on one topic, clear sentence structure, and simple sequencing words like first, then, and next.',
      'Grade 3': 'Expect a more organized paragraph with a topic sentence, supporting details, linking words, and stronger descriptive storytelling.',
      'Grade 4': 'Expect more structured multi-paragraph writing with an introduction, supporting details, transitions, and gentle revision support.',
      'Grade 5': 'Expect a more developed response with stronger paragraph structure, clearer transitions, more voice, and increasing independence in revising and editing.',
    };

    return summaries[selectedGrade] || summaries['Grade 1'];
  };

  const getCombinedExpectationSummary = (selectedGrade, parentExpectation) => {
    const baseSummary = getGradeExpectationSummary(selectedGrade);
    if (!parentExpectation.trim()) return baseSummary;

    return `${baseSummary} Parent custom focus: ${parentExpectation.trim()}`;
  };

  // --- AI 服務整合 ---
  const generateJournalContent = async (data) => {
    const fallbackJournal = buildFallbackJournal(data);
    const gradePromptGuidance = getGradePromptGuidance(grade);
    const customPromptGuidance = customExpectation.trim()
      ? `Parent custom expectation:
- ${customExpectation.trim()}
- Follow this custom expectation in addition to the grade-level goals.
- Keep the journal natural and child-appropriate even when applying the custom expectation.`
      : '';

    setIsSpeaking(true);
    // if (isMockMode) {
    //   await new Promise(r => setTimeout(r, 1500)); // 模擬延遲
    //   const mockText = "Today was a wonderful day! I spent time with my family at the park. We played games and ate yummy sandwiches. I felt super happy and excited. I can't wait to go back again!";
    //   setGeneratedJournal(mockText);
    //   setStep('result');
    //   await speakText(mockText);
    //   setImageUrl("https://placehold.co/600x400/orange/white?text=Your+Story+Illustration");
    //   setIsSpeaking(false);
    //   return;
    // }

    if (!googleAIKey) {
      setGeneratedJournal(fallbackJournal);
      setStep('result');
      setIsSpeaking(false);
      return;
    }

    const prompt = `You are helping a child turn spoken answers into a journal entry.

Student grade level: ${grade}

Use all of these 5W1H details in the journal:
- Who: ${data.who}
- What: ${data.what}
- When: ${data.when}
- Where: ${data.where}
- Why: ${data.why}
- How they felt: ${data.how}

Grade-specific writing requirements:
${gradePromptGuidance}

${customPromptGuidance}

General rules:
- Keep all 5W1H details included, even if some need simple rewording.
- Write in age-appropriate English for ${grade}.
- Make it sound natural, warm, and child-centered.
- Do not add facts that were not given.
- Ensure writing flow is better, make sure to delete redundant words, for example, "because because".
- Output only the journal text, with no title, bullets, labels, or explanation.`;

    console.log("Sending prompt to Google AI:", prompt);

    try {
      const response = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Today was a fun day!";
      setGeneratedJournal(text);
      setStep('result');
      speakText(text);
      // await generateIllustration(text);
    } catch (error) {
      console.error("Journal generation failed:", error);
      setGeneratedJournal(fallbackJournal);
      setStep('result');
      speakText(fallbackJournal);
    } finally {
      setIsSpeaking(false);
    }
  };

  // Illustration generation is intentionally disabled for now.
  // const generateImageWithGemini = async (journalText) => {
  //     setIsGeneratingImage(true);
  //     const promptText = `A cute, colorful children's book illustration for a kid's journal entry: ${journalText}. Bright colors, simple cartoon style, happy mood.`;
  //     try {
  //       const payload = {
  //         contents: [{
  //           parts: [{ text: `Generate a cute, colorful children's book illustration style image of: ${promptText} Draw like a kid's drawing.` }]
  //         }],
  //         generationConfig: {
  //           responseModalities: ['TEXT', 'IMAGE']
  //         }
  //       };

  //       const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify(payload)
  //       });

  //       if (!response.ok) throw new Error("Gemini image request failed");

  //       const result = await response.json();
  //       const base64Data = result.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  //       if (base64Data) {
  //         setJournalImage(`data:image/png;base64,${base64Data}`);
  //         setImageUrl(`data:image/png;base64,${base64Data}`);
  //       } else {
  //         setJournalImage(null);
  //         setImageUrl("https://placehold.co/600x400/orange/white?text=Your+Story+Illustration");
  //       }

  //     } catch (error) {
  //       console.error("Banana Image Error:", error);

  //     } finally {
  //       setIsGeneratingImage(false);
  //     }
  // };


  // const generateInstructionWithGemini = async (journalText) => {
  //   setIsGeneratingImage(true);

  //   try {
  //     const systemPrompt = `You are a kid. Analyze the provided JOURNAL TEXT and design a visual card that matches its theme.
  //     Output ONLY a JSON object with:
  //     - characters: a light pastel hex code.
  //     - mainEmojis: 3 relevant emojis.
  //     - title: today's date.`;

  //     const payload = {
  //         contents: [{
  //           parts: [{ text: `HERE IS THE JOURNAL TEXT TO ANALYZE: "${journalText}"` }]
  //         }],
  //         systemInstruction: { parts: [{ text: systemPrompt }] },
  //         generationConfig: { responseMimeType: "application/json" }
  //       };


  //     const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(payload)
  //     });

  //     const design = JSON.parse(result.candidates[0].content.parts[0].text);
  //     renderToCanvas(design);
  //   } catch (err) {
  //     console.error("Art generation failed", err);
  //     setArtDataUrl("https://placehold.co/800x600/FFEDD5/D97706?text=My+Happy+Day");
  //   } finally {
  //     setIsGeneratingImage(false);
  //   }
  // };

  // Illustration generation is intentionally disabled for now.
  // const generateImageWithImagen = async (journalText) => {
  //   
  //    setIsGeneratingImage(true);

  //   const promptText = `Cute colorful cartoon illustration for a kid: ${journalText}. Bright and happy colors.`;
  //   try {
  //     
  //     const payload = {
  //       instances: [
  //         { 
  //           prompt: `A cute, colorful children's book illustration for a kid's journal entry: ${promptText}. Bright colors, simple cartoon style, happy mood.` 
  //         }
  //       ],
  //       parameters: { 
  //         sampleCount: 1 
  //       }
  //     };
  //     
  //     const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${googleAIKey}`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(payload)
  //     });

  //     const result = await response.json();
  //     if (result.predictions?.[0]?.bytesBase64Encoded) {
  //       setJournalImage(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
  //       setImageUrl(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
  //     } else {
  //       setJournalImage(null);
  //       setImageUrl("https://placehold.co/600x400/orange/white?text=Your+Story+Illustration");
  //     }
  //   } catch (error) {
  //     console.error("Banana Image Error:", error);
  //   } finally {
  //     setIsGeneratingImage(false);
  //   }
  // };

  function stopSpeaking() {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // no-op
    }
    setIsSpeaking(false);
  }

  const speakText = async (text, options = {}) => {
    const { rate = 0.9 } = options;
    // if (isMockMode) {
      console.log("[Mock TTS]:", text);
      return new Promise((resolve) => {
        stopSpeaking();
        setIsSpeaking(true);
        const ut = new SpeechSynthesisUtterance(text);
        ut.lang = 'en-US';
        ut.rate = rate;
        ut.onerror = () => {
          setIsSpeaking(false);
          resolve();
        };
        ut.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
        window.speechSynthesis.speak(ut);
      });
    // }

    // if (!googleAIKey) return;

    // setIsSpeaking(true);
    // try {
    //   const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${googleAIKey}`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       // model: "gemini-2.5-flash-preview-tts",
    //       contents: [{ parts: [{ text }] }],
    //       generationConfig: {
    //         responseModalities: ["AUDIO"],
    //         speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
    //       }
    //     })
    //   });
    //   const result = await response.json();
    //   const pcmData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    //   if (pcmData) await playAudioFromBase64(pcmData);
    // } catch (error) {} finally { setIsSpeaking(false); }
  };

  const playAudioFromBase64 = (base64) => {
    return new Promise((resolve, reject) => {
      try {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        const header = createWavHeader(array.length, 24000);
        const blob = new Blob([header, array], { type: 'audio/wav' });
        const audio = new Audio(URL.createObjectURL(blob));
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play();
      } catch (e) { reject(e); }
    });

  };

  const createWavHeader = (dataLength, sampleRate) => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const writeString = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeString(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeString(8, 'WAVE');
    writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); writeString(36, 'data'); view.setUint32(40, dataLength, true);
    return buffer;
  };

  const handleSpellCheck = (word) => {
    const letters = word.toUpperCase().split('');
    const spelled = letters.join('-');
    const spokenSpelling = letters.join(' ... ');
    setSpellResult(`${word.toUpperCase()}: ${spelled}`);
    speakText(`${word} is spelled ${spokenSpelling}`, { rate: 0.5 });
    setTimeout(() => setSpellResult(''), 8000);
  };

  const goToWritingPage = () => {
    setView('journaling');
    setSpellResult('');
    setTimeout(() => startListening(), 300);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      return;
    }

    startListening();
  };

  const toggleReadingTutorListening = () => {
    if (isListening || readingTutorContinuousListening) {
      setReadingTutorContinuousListening(false);
      stopListening();
      return;
    }

    setReadingTutorContinuousListening(true);
    startListening();
  };


  const startCamera = async () => {
    setCameraMode(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { setCameraMode(false); }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      setCapturedImage(canvas.toDataURL('image/jpeg'));
      video.srcObject.getTracks().forEach(track => track.stop());
      setCameraMode(false);
    }
  };

  const saveSettings = () => {
    const writingCustom = (featureCustomMessages['writing-journal'] || customExpectation || '').trim();
    localStorage.setItem('journal_buddy_name', studentName);
    localStorage.setItem('journal_buddy_grade', grade);
    localStorage.setItem('journal_buddy_custom_expectation', writingCustom);
    setCustomExpectation(writingCustom);
    setView('landing');
  };

  const saveFeatureCustomizationDraft = () => {
    const message = draftFeatureCustomMessage.trim();
    const featureId = normalizeFeatureId(selectedCustomizeFeature);

    setFeatureCustomMessages((prev) => ({
      ...prev,
      [featureId]: message,
    }));

    if (featureId === 'writing-journal') {
      setCustomExpectation(message);
      localStorage.setItem('journal_buddy_custom_expectation', message);
    }
  };

  const openCustomExpectationModal = () => {
    const writingMessage = featureCustomMessages['writing-journal'] || customExpectation;
    setDraftCustomExpectation(writingMessage);
    setShowCustomExpectationModal(true);
  };

  const saveCustomExpectation = () => {
    const message = draftCustomExpectation.trim();
    setCustomExpectation(message);
    setFeatureCustomMessages((prev) => ({
      ...prev,
      'writing-journal': message,
    }));
    setShowCustomExpectationModal(false);
    setIsCustomListening(false);
  };

  const clearCustomExpectation = () => {
    setDraftCustomExpectation('');
    setCustomExpectation('');
    setFeatureCustomMessages((prev) => ({
      ...prev,
      'writing-journal': '',
    }));
    localStorage.removeItem('journal_buddy_custom_expectation');
  };

  const toggleCustomExpectationListening = () => {
    if (!customRecognitionRef.current) return;

    if (isCustomListening) {
      try {
        customRecognitionRef.current.stop();
      } catch (e) {
        setIsCustomListening(false);
      }
      return;
    }

    try {
      customRecognitionRef.current.start();
      setIsCustomListening(true);
    } catch (e) {
      setIsCustomListening(false);
    }
  };

  const isGuidedStep = guidedFlow.includes(step);
  const canGoToPreviousQuestion = isGuidedStep && step !== 'story';
  const gradeLevels = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
  const gradeValue = Math.max(0, gradeLevels.indexOf(grade));
  const gradeSliderLabel = gradeValue === 0 ? 'K' : `${gradeValue}`;
  const ageRanges = ['5-6', '6-7', '7-8', '8-9', '9-10', '10-11'];

  const getLiveStatusMeta = () => {
    if (isMockMode) {
      return {
        label: 'Mock fallback',
        className: 'bg-purple-600 text-white',
        detail: 'Using local structured mock responses.',
      };
    }

    if (!googleAIKey) {
      return {
        label: 'Fallback mode',
        className: 'bg-stone-300 text-stone-700',
        detail: 'No Gemini key detected.',
      };
    }

    if (liveStatus === 'connected') {
      return {
        label: 'Live connected',
        className: 'bg-emerald-500 text-white',
        detail: liveUsage?.totalTokenCount
          ? `${liveUsage.totalTokenCount} total tokens used in the latest Live turn.`
          : 'Gemini Live is connected.',
      };
    }

    if (liveStatus === 'connecting') {
      return {
        label: 'Live connecting',
        className: 'bg-amber-500 text-white',
        detail: 'Opening Gemini Live session.',
      };
    }

    if (liveStatus === 'fallback') {
      return {
        label: 'Fallback mode',
        className: 'bg-stone-300 text-stone-700',
        detail: liveErrorDetail || 'Live setup failed, so local prompts are in use.',
      };
    }

    return {
      label: 'Live ready',
      className: 'bg-sky-500 text-white',
      detail: 'Gemini Live will connect on the next guided turn.',
    };
  };

  const getFlowSummaryCards = () => {
    const nextStep = getNextFlowStep(step);
    return [
      {
        label: 'Story',
        value: answers.story ? 'Captured' : 'Waiting',
        active: step === 'story',
      },
      {
        label: 'This step',
        value: isConfirming ? 'Needs yes / no' : 'Listening',
        active: !isConfirming,
      },
      {
        label: 'Next up',
        value: nextStep === 'generating' ? 'Write journal' : nextStep,
        active: isConfirming,
      },
    ];
  };

  const getLocalDebugRows = () => [
    { label: 'Step', value: step },
    { label: 'Listening', value: isListening ? 'Yes' : 'No' },
    { label: 'Mode', value: isMockMode ? 'Mock' : 'Live / fallback' },
    { label: 'Speech', value: lastRecognitionState },
    { label: 'Transcript', value: lastTranscript || 'None' },
    { label: 'Last event', value: liveLastEvent },
    { label: 'Last error', value: liveErrorDetail || 'None' },
    { label: 'Raw preview', value: liveRawPreview || 'None' },
  ];

  const goToHomePage = () => {
    setView('landing');
    setStep('idle');
    setSpellResult('');
    stopListening();
  };

  const goToStoryPreview = () => {
    setView('home');
    setSpellResult('');
    stopListening();
  };

  useEffect(() => {
    if (view !== 'journaling' || isMockMode || isListening || isSpeaking) return;

    const timer = setTimeout(() => {
      startListening();
    }, 1200);

    return () => clearTimeout(timer);
  }, [view, isMockMode, isListening, isSpeaking]);

  useEffect(() => {
    if (!user?.uid) return;
    if (view === 'sightwordsMaster') {
      void loadFeatureWordBankState('sightwords-master');
    }
    if (view === 'chineseLiteracy') {
      void loadFeatureWordBankState('chinese-literacy');
    }
    if (view === 'spellingChampion') {
      loadSpellingCacheState({
        db,
        appId,
        uid: user.uid,
      }).then((remoteCache) => {
        const remoteExpiresAt = Number(remoteCache?.expiresAt || 0);
        const remoteWords = Array.isArray(remoteCache?.words) ? remoteCache.words : [];
        if (!remoteExpiresAt || Date.now() > remoteExpiresAt || remoteWords.length === 0) return;

        const localExpiresAt = Number(spellingCache?.expiresAt || 0);
        if (remoteExpiresAt >= localExpiresAt) {
          setSpellingCache({ words: remoteWords, expiresAt: remoteExpiresAt });
          setFeatureActionMessage('Loaded your 7-day spelling cache from cloud sync.');
        }
      }).catch((error) => {
        console.error('Could not load spelling cache from Firestore:', error);
      });
    }
  }, [view, user?.uid]);

  useEffect(() => {
    if (featurePracticeSession.active && !['sightwordsMaster', 'chineseLiteracy'].includes(view)) {
      stopFeaturePracticeSession();
    }

    if (view !== 'spellingChampion') {
      if (spellingPracticeState.open) stopSpellingPracticeLoop();
      if (spellingQuizState.open) closeSpellingQuiz();
    }
  }, [view]);

  useEffect(() => {
    if (!spellingPracticeState.open || spellingCache.words.length === 0) return;

    if (spellingPracticeTimerRef.current) {
      window.clearInterval(spellingPracticeTimerRef.current);
      spellingPracticeTimerRef.current = null;
    }

    const speakPracticeWord = (index) => {
      const word = spellingCache.words[index % spellingCache.words.length] || '';
      if (!word) return;
      void speakText(`${word}. Let's spell it together. ${spellOutWordNaturally(word)}.`, { rate: 0.72 });
    };

    speakPracticeWord(spellingPracticeState.index);

    spellingPracticeTimerRef.current = window.setInterval(() => {
      setSpellingPracticeState((prev) => {
        if (!prev.open || spellingCache.words.length === 0) return prev;
        const nextIndex = (prev.index + 1) % spellingCache.words.length;
        speakPracticeWord(nextIndex);
        return { ...prev, index: nextIndex };
      });
    }, 8000);

    return () => {
      if (spellingPracticeTimerRef.current) {
        window.clearInterval(spellingPracticeTimerRef.current);
        spellingPracticeTimerRef.current = null;
      }
    };
  }, [spellingPracticeState.open, spellingCache.words]);

  useEffect(() => {
    const isFeaturePracticeView = featurePracticeSession.active
      && ['sightwordsMaster', 'chineseLiteracy'].includes(view);
    if (!isFeaturePracticeView || isListening || isSpeaking) return;

    const timer = window.setTimeout(() => {
      startListening();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [featurePracticeSession.active, view, isListening, isSpeaking, startListening]);

  useEffect(() => {
    if (view === 'readingTutor' || view === 'storyADay') return;
    if (!readingTutorContinuousListening) return;
    setReadingTutorContinuousListening(false);
  }, [view, readingTutorContinuousListening]);

  const uploadPhoto = async (withUpload) => {
    if (!user) return;
    setIsSaving(true);
    try {
      // 依照要求的 Data Model 儲存到 Firestore
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'journals'), {
        name: studentName.trim() || "Anonymously", 
        id: user.uid,                            
        timestamp: serverTimestamp(),              
        journal: withUpload ? capturedImage : null, 
        // keyIdea: journalImage,
        keyIdeaText: generatedJournal,
        // illustration: imageUrl,
        rawAnswers: answers,
        grade: grade
      });
      setShowUploadModal(false); setCapturedImage(null); setView('landing'); setStep('idle');
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const goToLandingPage = () => {
    setView('landing');
    setStep('idle');
    setReadingTutorFeedback('');
    setReadingTutorTranscriptBuffer('');
    setReadingPracticeFeatureId('reading-tutor');
    setReadingTutorContinuousListening(false);
    setReadingTutorSession({
      worksheetTopic: '',
      awaitingQuestionLabel: false,
      awaitingQuestionRead: false,
      currentQuestionLabel: '',
    });
    setReadingTutorWorksheetData({ units: [], byWeekDay: {}, warnings: [] });
    setReadingTutorActiveUnit(null);
    setReadingTutorQuestionIndex(0);
    setReadingTutorScore(0);
    setReadingTutorAnswers({});
    setReadingTutorHighlightTerms([]);
    setReadingTutorCelebrating(false);
    setReadingTutorIllustrationUrl('');
    setReadingTutorImageStatus('idle');
    setReadingTutorUnfamiliarWords([]);
    setReadingTutorWordReviewInProgress(false);
    setReadingTutorWordReviewCompleted(false);
    setReadingTutorDiscussionQuestion('');
    setReadingTutorDiscussionTurns(0);
    setReadingTutorDiscussionDone(false);
    stopListening();
  };


  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8e7_0%,_#f5ebd7_42%,_#eadbc2_100%)] font-sans text-gray-800 p-4 md:p-6 flex flex-col items-center">
      <header className="w-full max-w-5xl flex justify-between items-center py-4 mb-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('landing'); setStep('idle'); stopListening(); }}>
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 p-2.5 rounded-2xl shadow-lg shadow-orange-200">
            <BookOpen className="text-white" />
          </div>
          <div>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.35em] text-orange-700/70 font-bold">Voice Learning Studio</p>
            <h1 className="text-2xl font-black text-orange-950 tracking-tight">Learning Buddy</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isLocal && (
            <div className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] shadow-sm ${getLiveStatusMeta().className}`} title={getLiveStatusMeta().detail}>
              {getLiveStatusMeta().label}
            </div>
          )}
          {isLocal && (
            <button 
              onClick={() => setIsMockMode(!isMockMode)}
              data-testid="mock-toggle"
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${isMockMode ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}
            >
              <FlaskConical size={14} /> {isMockMode ? "Mock ON" : "Mock OFF"}
            </button>
          )}
          <button onClick={() => setView('setup')} className="p-2.5 bg-white/70 rounded-full shadow-sm ring-1 ring-orange-100"><Settings /></button>
        </div>
      </header>

      <main className="w-full max-w-5xl bg-[linear-gradient(180deg,_rgba(255,253,247,0.96),_rgba(255,247,235,0.94))] rounded-[2.25rem] shadow-[0_30px_80px_rgba(120,74,24,0.14)] ring-1 ring-white/80 p-6 md:p-10 relative overflow-hidden min-h-[620px] flex flex-col">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-12 right-8 h-40 w-40 rounded-full bg-orange-200/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-sky-200/25 blur-3xl" />
          <div className="absolute inset-x-8 top-6 h-px bg-gradient-to-r from-transparent via-orange-200/70 to-transparent" />
        </div>
        
        {view === 'setup' && (
          <div className="relative z-10 flex-1 animate-in fade-in zoom-in duration-300">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] h-full">
              <div className="rounded-[2.5rem] bg-stone-950 text-white p-8 md:p-10 shadow-[0_30px_60px_rgba(25,25,25,0.18)] flex flex-col justify-between">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-amber-100/80">
                    <Settings size={14} />
                    Parent settings
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-4xl md:text-5xl font-black tracking-[-0.05em] leading-[0.95]">Tune the app for your child.</h2>
                    <p className="text-base md:text-lg leading-relaxed text-stone-300">
                      {getCombinedExpectationSummary(grade, customExpectation)}
                    </p>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 mt-8">
                  <p className="text-xs uppercase tracking-[0.28em] text-amber-100/70 font-bold">Current setting</p>
                  <p className="mt-3 text-3xl font-black">{grade}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-300">You can adjust this anytime if reading or writing support should feel easier or more advanced.</p>
                </div>
              </div>

              <div className="rounded-[2.5rem] border border-white/80 bg-white/75 p-8 md:p-10 shadow-[0_18px_40px_rgba(148,101,47,0.08)] backdrop-blur-sm flex flex-col justify-between">
                <div className="space-y-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-stone-500 font-bold">Student grade</p>
                      <h3 className="mt-3 text-4xl font-black tracking-[-0.04em] text-stone-900">{grade}</h3>
                    </div>
                    <div className="rounded-[1.5rem] bg-orange-50 px-4 py-3 text-right shadow-sm ring-1 ring-orange-100">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-orange-500 font-black">Recommended</p>
                      <p className="mt-1 text-lg font-black text-orange-900">Ages {ageRanges[gradeValue] || '5-6'}</p>
                    </div>
                  </div>

                  <div className="rounded-[2rem] bg-[linear-gradient(180deg,_#fff9f2,_#fffefb)] border border-orange-100 p-6">
                    <div className="flex justify-between text-xs font-black uppercase tracking-[0.2em] text-stone-400">
                      <span>K</span>
                      <span>5</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={gradeValue}
                      onChange={(e) => setGrade(gradeLevels[Number(e.target.value)] || 'Kindergarten')}
                      className="mt-6 w-full accent-orange-500"
                    />
                    <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {gradeLevels.map((label, index) => (
                        <button
                          key={label}
                          onClick={() => setGrade(label)}
                          className={`rounded-[1.25rem] px-3 py-4 text-center text-sm font-black uppercase tracking-[0.14em] transition-all ${
                            gradeValue === index
                              ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                              : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          {index === 0 ? 'K' : index}
                        </button>
                      ))}
                    </div>
                  </div>

                  <CloudReferenceSettings
                    cloudConnections={effectiveCloudConnections}
                    cloudConnectProvider={cloudConnectProvider}
                    onCloudConnectProviderChange={setCloudConnectProvider}
                    linkDraft={linkDraft}
                    onLinkDraftChange={updateLinkDraft}
                    onConnectProvider={connectProvider}
                    onAddReference={addReferenceLink}
                    linkedResources={linkedResources}
                    onRemoveReference={removeReferenceLink}
                    featureOptions={referenceFeatureOptions}
                    isCloudStateReady={isCloudStateReady}
                    onOpenCloudBrowser={openCloudBrowser}
                    onCloseCloudBrowser={closeCloudBrowser}
                    onEnterCloudFolder={enterCloudFolder}
                    onGoToCloudFolderFromPath={goToCloudFolderFromPath}
                    onSelectCloudResource={selectCloudResource}
                    cloudBrowser={cloudBrowser}
                    isBusy={isCloudActionBusy}
                    actionError={cloudActionError}
                  />

                  <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white px-5 py-5 space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.28em] text-stone-500 font-black">Feature customization</p>
                      <p className="text-sm leading-6 text-stone-600">
                        Pick a feature and add a custom requirement. Journal Buddy custom message is injected into AI journal generation.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {featureCustomizationOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setSelectedCustomizeFeature(option.value)}
                          className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors ${
                            selectedCustomizeFeature === option.value
                              ? 'bg-stone-900 text-white'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {selectedCustomizeFeature === 'writing-journal' ? (
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <p className="text-xs uppercase tracking-[0.22em] text-stone-500 font-black">Journal Buddy custom</p>
                          <p className="text-sm leading-6 text-stone-600">
                            This message is added to Journal Buddy AI prompt so generated writing follows your requirement.
                          </p>
                          {(featureCustomMessages['writing-journal'] || customExpectation).trim() && (
                            <p className="text-sm leading-6 text-stone-900 font-semibold">
                              "{(featureCustomMessages['writing-journal'] || customExpectation).trim()}"
                            </p>
                          )}
                        </div>
                        <button
                          onClick={openCustomExpectationModal}
                          className="rounded-[1.25rem] bg-stone-900 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-sm hover:bg-stone-800"
                        >
                          {(featureCustomMessages['writing-journal'] || customExpectation).trim() ? 'Edit Custom' : 'Custom'}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 space-y-3">
                        <p className="text-sm text-stone-600">
                          Requirement for <span className="font-black text-stone-800">{selectedCustomizationCard?.title || 'this feature'}</span>. It will be used as feature behavior guidance.
                        </p>
                        <textarea
                          value={draftFeatureCustomMessage}
                          onChange={(e) => setDraftFeatureCustomMessage(e.target.value)}
                          rows={3}
                          maxLength={300}
                          placeholder="Add requirement for this feature..."
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="flex items-center justify-between text-xs text-stone-500">
                          <span>{draftFeatureCustomMessage.length}/300</span>
                          <button
                            onClick={saveFeatureCustomizationDraft}
                            className="rounded-lg bg-stone-900 px-3 py-1.5 font-black uppercase tracking-[0.12em] text-white hover:bg-stone-800"
                          >
                            Save Feature Custom
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 space-y-3">
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-500 font-black">Linked references for selected feature</p>
                      {getFeatureReferences(selectedCustomizeFeature).length === 0 && (
                        <p className="text-sm text-stone-600">
                          No references linked to {selectedCustomizationCard?.title || 'this feature'} yet.
                        </p>
                      )}

                      {getFeatureReferences(selectedCustomizeFeature).length > 0 && (
                        <div className="space-y-2 max-h-44 overflow-auto pr-1">
                          {getFeatureReferences(selectedCustomizeFeature).map((resource) => (
                            <div key={resource.id} className="rounded-lg border border-stone-200 bg-white px-3 py-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-black text-stone-800 truncate">{resource.label || 'Linked reference'}</p>
                                <p className="mt-1 text-xs text-stone-500 uppercase tracking-[0.12em]">
                                  {resource.provider} • {resource.resourceType}
                                </p>
                                <p className="mt-1 text-xs text-stone-500 break-all">{resource.target}</p>
                              </div>
                              <button
                                onClick={() => removeReferenceLink(resource.id)}
                                className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-rose-700 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => setView('landing')} className="flex-1 rounded-[1.75rem] bg-stone-100 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-stone-600 hover:bg-stone-200 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveSettings} className="flex-1 rounded-[1.75rem] bg-[linear-gradient(135deg,_#f97316,_#f59e0b)] px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-orange-200 transition-transform active:scale-[0.99]">
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'landing' && (
          <LandingView
            grade={grade}
            isListening={isListening}
            onToggleListening={toggleListening}
            featureCards={landingFeatureCards}
            onOpenFeature={openFeature}
          />
        )}

        {view === 'home' && (
          <WritingHomeView
            step={step}
            isGuidedStep={isGuidedStep}
            answers={answers}
            grade={grade}
            isLocal={isLocal}
            isListening={isListening}
            isMockMode={isMockMode}
            userInput={userInput}
            isConfirming={isConfirming}
            fiveWSteps={fiveWSteps}
            canGoToPreviousQuestion={canGoToPreviousQuestion}
            generatedJournal={generatedJournal}
            getStepQuestion={getStepQuestion}
            getLiveStatusMeta={getLiveStatusMeta}
            getLocalDebugRows={getLocalDebugRows}
            getFlowSummaryCards={getFlowSummaryCards}
            onToggleListening={toggleListening}
            onMoveToPrevStep={moveToPrevStep}
            onGuidedMicClick={() => {
              stopListening();
              startListening();
            }}
            onSpeakText={speakText}
            onGoToWritingPage={goToWritingPage}
            onRestart={() => setStep('idle')}
            onBackToMenu={goToLandingPage}
          />
        )}

        {view === 'readingTutor' && (
          <ReadingTutorView
            isListening={isListening}
            onBackToMenu={goToLandingPage}
            mode="reading-tutor"
            linkedResources={getFeatureReferences('reading-tutor')}
            cloudWordsLoadedAtIso={cloudWordBanks['reading-tutor']?.loadedAtIso || ''}
            cloudWordsError={cloudWordBanks['reading-tutor']?.error || ''}
            isCloudWordsLoading={Boolean(cloudWordBanks['reading-tutor']?.isLoading)}
            onLoadCloudWords={loadReadingTutorWorksheet}
            tutorFeedback={readingTutorFeedback}
            isContinuousListening={readingTutorContinuousListening}
            worksheetWarnings={readingTutorWorksheetData.warnings || []}
            activeWorksheet={readingTutorActiveUnit}
            questionIndex={readingTutorQuestionIndex}
            score={readingTutorScore}
            answers={readingTutorAnswers}
            highlightTerms={readingTutorHighlightTerms}
            onAnswer={handleReadingTutorAnswer}
            isCelebrating={readingTutorCelebrating}
            unfamiliarWords={readingTutorUnfamiliarWords}
            onStoryWordTap={handleReadingTutorStoryWordTap}
            onPlayWord={handleReadingTutorStoryWordTap}
            onStartWordReview={startReadingTutorWordReview}
            isWordReviewing={readingTutorWordReviewInProgress}
            isWordReviewCompleted={readingTutorWordReviewCompleted}
            showQuestions={readingTutorWordReviewCompleted}
            readingDoneSignal={readingTutorReadingDoneSignal}
            discussionQuestion={''}
            discussionDone={true}
            onOpenWritingJournal={goToStoryPreview}
          />
        )}

        {view === 'storyADay' && (
          <StoryADayView
            isListening={isListening}
            onBackToMenu={goToLandingPage}
            linkedResources={getFeatureReferences('story-a-day')}
            cloudWordsLoadedAtIso={cloudWordBanks['story-a-day']?.loadedAtIso || ''}
            cloudWordsError={cloudWordBanks['story-a-day']?.error || ''}
            isCloudWordsLoading={Boolean(cloudWordBanks['story-a-day']?.isLoading)}
            onLoadCloudWords={loadReadingTutorWorksheet}
            tutorFeedback={readingTutorFeedback}
            isContinuousListening={readingTutorContinuousListening}
            worksheetWarnings={readingTutorWorksheetData.warnings || []}
            activeWorksheet={readingTutorActiveUnit}
            questionIndex={readingTutorQuestionIndex}
            score={readingTutorScore}
            answers={readingTutorAnswers}
            highlightTerms={readingTutorHighlightTerms}
            onAnswer={handleReadingTutorAnswer}
            isCelebrating={readingTutorCelebrating}
            unfamiliarWords={readingTutorUnfamiliarWords}
            onStoryWordTap={handleReadingTutorStoryWordTap}
            onPlayWord={handleReadingTutorStoryWordTap}
            onStartWordReview={startReadingTutorWordReview}
            isWordReviewing={readingTutorWordReviewInProgress}
            isWordReviewCompleted={readingTutorWordReviewCompleted}
            showQuestions={false}
            readingDoneSignal={readingTutorReadingDoneSignal}
            discussionQuestion={readingTutorDiscussionQuestion}
            discussionDone={readingTutorDiscussionDone}
            onOpenWritingJournal={goToStoryPreview}
          />
        )}

        {view === 'spellingChampion' && (
          <SpellingChampionView
            onBackToMenu={goToLandingPage}
            customMessage={featureCustomMessages['spelling-champion'] || ''}
            linkedResources={getFeatureReferences('spelling-champion')}
            cacheWords={spellingCache.words || []}
            cacheExpiresAt={spellingCache.expiresAt || 0}
            cloudWordsError={cloudWordBanks['spelling-champion']?.error || ''}
            isCloudWordsLoading={Boolean(cloudWordBanks['spelling-champion']?.isLoading)}
            spellingActionMessage={featureActionMessage}
            spellingPracticeOpen={spellingPracticeState.open}
            practiceWord={spellingCache.words[spellingPracticeState.index] || ''}
            spellingQuizOpen={spellingQuizState.open}
            quizQuestionIndex={spellingQuizState.index}
            quizTotal={spellingQuizState.words.length || 10}
            quizPromptWord={spellingQuizState.words[spellingQuizState.index] || ''}
            quizAnswer={spellingQuizState.answer}
            quizFeedback={spellingQuizState.feedback}
            quizAwaitingVoice={spellingQuizState.awaitingVoiceAnswer}
            quizFocusNonce={spellingQuizInputFocusNonce}
            historyRows={spellingHistory}
            onLoadCloudWords={loadSpellingWordsToCache}
            onStartPractice={startSpellingPracticeLoop}
            onStopPractice={stopSpellingPracticeLoop}
            onStartQuiz={startSpellingQuiz}
            onCloseQuiz={closeSpellingQuiz}
            onQuizAnswerChange={(value) => setSpellingQuizState((prev) => ({ ...prev, answer: value }))}
            onQuizSubmit={submitSpellingQuizAnswer}
            onQuizRepeat={repeatCurrentSpellingQuestion}
            onQuizSpeakAnswer={() => {
              setSpellingQuizState((prev) => ({ ...prev, awaitingVoiceAnswer: true }));
              startListening();
            }}
          />
        )}

        {view === 'sightwordsMaster' && (
          <SightwordsMasterView
            onBackToMenu={goToLandingPage}
            customMessage={featureCustomMessages['sightwords-master'] || ''}
            linkedResources={getFeatureReferences('sightwords-master')}
            bankWords={featureWordBanks['sightwords-master']?.words || []}
            bankError={featureWordBanks['sightwords-master']?.error || ''}
            isBankLoading={Boolean(featureWordBanks['sightwords-master']?.isLoading)}
            onLoadCloudWords={() => loadCloudWordsToFeatureBank('sightwords-master')}
            onRefreshWordBank={() => loadFeatureWordBankState('sightwords-master')}
            onUpsertWord={(word, reviewFrequency) => upsertFeatureWordBankEntry({ featureId: 'sightwords-master', word, reviewFrequency })}
            onRemoveWord={(word) => removeFeatureWordBankEntry({ featureId: 'sightwords-master', word })}
            onStart={() => startFeaturePracticeSession('sightwords-master')}
            isSessionActive={featurePracticeSession.active && featurePracticeSession.featureId === 'sightwords-master'}
            currentWord={(featurePracticeSession.active && featurePracticeSession.featureId === 'sightwords-master') ? (featurePracticeSession.words[featurePracticeSession.index]?.word || '') : ''}
            sessionHint={featurePracticeSession.feedback || 'You can say "i do not know" or "next" to skip this word.'}
            featureActionMessage={featureActionMessage}
          />
        )}

        {view === 'chineseLiteracy' && (
          <ChineseLiteracyView
            onBackToMenu={goToLandingPage}
            customMessage={featureCustomMessages['chinese-literacy'] || ''}
            linkedResources={getFeatureReferences('chinese-literacy')}
            bankWords={featureWordBanks['chinese-literacy']?.words || []}
            bankError={featureWordBanks['chinese-literacy']?.error || ''}
            isBankLoading={Boolean(featureWordBanks['chinese-literacy']?.isLoading)}
            onLoadCloudWords={() => loadCloudWordsToFeatureBank('chinese-literacy')}
            onRefreshWordBank={() => loadFeatureWordBankState('chinese-literacy')}
            onUpsertWord={(word, reviewFrequency) => upsertFeatureWordBankEntry({ featureId: 'chinese-literacy', word, reviewFrequency })}
            onRemoveWord={(word) => removeFeatureWordBankEntry({ featureId: 'chinese-literacy', word })}
            onStart={() => startFeaturePracticeSession('chinese-literacy')}
            isSessionActive={featurePracticeSession.active && featurePracticeSession.featureId === 'chinese-literacy'}
            currentWord={(featurePracticeSession.active && featurePracticeSession.featureId === 'chinese-literacy') ? (featurePracticeSession.words[featurePracticeSession.index]?.word || '') : ''}
            sessionHint={featurePracticeSession.feedback || '你可以說 i do not know 或 next 來跳過。'}
            featureActionMessage={featureActionMessage}
          />
        )}

        {view === 'journaling' && (
          <WritingJournalView
            generatedJournal={generatedJournal}
            spellResult={spellResult}
            isListening={isListening}
            onSpeakText={speakText}
            onBack={goToStoryPreview}
            onSpellAssist={handleSpellAssistPress}
            onHome={goToHomePage}
            onBackToMenu={goToLandingPage}
          />
        )}

        {showUploadModal && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl z-50 flex items-center justify-center p-8 text-center">
            <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 shadow-2xl animate-in zoom-in duration-300">
              {!cameraMode ? (
                <div className="space-y-10">
                  <div className="w-28 h-28 bg-blue-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Camera className="text-blue-600 w-14 h-14" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-4xl font-black text-gray-800 tracking-tighter">Save your paper?</h3>
                    <p className="text-2xl text-gray-400 font-bold leading-tight">Take a photo of your paper journal!</p>
                  </div>
                  <div className="flex flex-col gap-4">
                    <button onClick={startCamera} className="py-7 bg-blue-500 text-white rounded-[2.5rem] font-black text-2xl flex items-center justify-center gap-4 shadow-xl hover:bg-blue-600">
                      <Camera size={32} /> Take a Photo
                    </button>
                    <button onClick={() => uploadPhoto(false)} className="py-7 bg-gray-100 text-gray-500 rounded-[2.5rem] font-black text-2xl">
                      No, just save digital
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="rounded-[3rem] overflow-hidden bg-black aspect-[3/4] relative border-8 border-gray-100 shadow-inner">
                    {!capturedImage ? (
                      <>
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <button onClick={capturePhoto} className="absolute bottom-10 left-1/2 -translate-x-1/2 w-24 h-24 bg-white border-[12px] border-blue-500 rounded-full shadow-2xl active:scale-90 transition-all" />
                      </>
                    ) : (
                      <img src={capturedImage} className="w-full h-full object-cover" />
                    )}
                  </div>
                  {capturedImage ? (
                    <div className="flex gap-4">
                      <button onClick={() => {setCapturedImage(null); startCamera();}} className="flex-1 py-6 bg-gray-100 rounded-[2rem] font-black text-xl">Retake</button>
                      <button onClick={() => uploadPhoto(true)} className="flex-1 py-6 bg-green-500 text-white rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 shadow-lg">
                        {isSaving ? <RefreshCw className="animate-spin" /> : <><Check size={28} /> Looks Great!</>}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => {setCameraMode(false); setCapturedImage(null);}} className="text-gray-400 text-xl font-bold hover:text-gray-600 transition-colors">Cancel</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showCustomExpectationModal && (
          <div className="absolute inset-0 bg-black/45 backdrop-blur-xl z-50 flex items-center justify-center p-6 md:p-8 text-left">
            <div className="w-full max-w-2xl rounded-[2.5rem] bg-white p-8 md:p-10 shadow-2xl animate-in zoom-in duration-300">
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-stone-500 font-black">Custom expectation</p>
                  <h3 className="text-3xl md:text-4xl font-black tracking-[-0.04em] text-stone-900">Tell Writing Buddy what to prioritize.</h3>
                  <p className="text-base leading-7 text-stone-600">
                    Example: use shorter sentences, encourage more descriptive words, keep the tone gentle, or focus on confidence with punctuation.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm leading-6 text-stone-500">
                      Type a note or tap the microphone to dictate it.
                    </p>
                    <button
                      onClick={toggleCustomExpectationListening}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                        isCustomListening
                          ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                          : 'bg-stone-900 text-white hover:bg-stone-800'
                      }`}
                      aria-label={isCustomListening ? 'Stop dictation' : 'Start dictation'}
                    >
                      <Mic size={18} />
                    </button>
                  </div>

                  <textarea
                    value={draftCustomExpectation}
                    onChange={(e) => setDraftCustomExpectation(e.target.value)}
                    rows={6}
                    maxLength={400}
                    placeholder="Add a custom expectation for this child..."
                    className="w-full rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-4 text-base leading-7 text-stone-900 shadow-inner outline-none transition focus:border-orange-300 focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-between text-sm text-stone-400">
                  <span>{draftCustomExpectation.length}/400</span>
                  {customExpectation.trim() && (
                    <button onClick={clearCustomExpectation} className="font-black uppercase tracking-[0.14em] text-stone-500 hover:text-stone-700">
                      Clear custom
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => {
                      try {
                        customRecognitionRef.current?.stop();
                      } catch (e) {
                        setIsCustomListening(false);
                      }
                      setDraftCustomExpectation(customExpectation);
                      setShowCustomExpectationModal(false);
                    }}
                    className="flex-1 rounded-[1.75rem] bg-stone-100 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-stone-600 hover:bg-stone-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCustomExpectation}
                    className="flex-1 rounded-[1.75rem] bg-[linear-gradient(135deg,_#f97316,_#f59e0b)] px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-orange-200 transition-transform active:scale-[0.99]"
                  >
                    Save Custom
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

         <canvas ref={canvasRef} className="hidden" />

      </main>

      <footer className="mt-10 text-center text-orange-300 font-bold">Built for {grade} Students • Step by Step Writing</footer>
    </div>
  );
};

export default App;
