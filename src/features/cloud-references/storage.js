import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

const defaultConnections = {
  googleDrive: false,
  oneDrive: false,
};

const SPELLING_CACHE_SETTING_ID = 'spellingChampionCache';

export const loadCloudReferenceState = async ({ db, appId, uid }) => {
  const settingsRef = doc(db, 'artifacts', appId, 'users', uid, 'settings', 'cloudReferences');
  const settingsSnap = await getDoc(settingsRef);

  const connections = settingsSnap.exists()
    ? {
        googleDrive: Boolean(settingsSnap.data()?.connections?.googleDrive),
        oneDrive: Boolean(settingsSnap.data()?.connections?.oneDrive),
      }
    : defaultConnections;

  const referencesRef = collection(db, 'artifacts', appId, 'users', uid, 'cloudReferences');
  const referencesSnap = await getDocs(referencesRef);
  const references = referencesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => {
      const left = typeof a.createdAtIso === 'string' ? a.createdAtIso : '';
      const right = typeof b.createdAtIso === 'string' ? b.createdAtIso : '';
      return right.localeCompare(left);
    });

  return {
    connections,
    references,
  };
};

export const saveCloudConnections = async ({ db, appId, uid, connections }) => {
  const settingsRef = doc(db, 'artifacts', appId, 'users', uid, 'settings', 'cloudReferences');
  await setDoc(
    settingsRef,
    {
      connections,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const saveCloudReference = async ({ db, appId, uid, reference }) => {
  const referenceRef = doc(db, 'artifacts', appId, 'users', uid, 'cloudReferences', reference.id);
  await setDoc(referenceRef, {
    ...reference,
    createdAt: serverTimestamp(),
    createdAtIso: reference.createdAtIso || new Date().toISOString(),
  });
};

export const removeCloudReference = async ({ db, appId, uid, referenceId }) => {
  const referenceRef = doc(db, 'artifacts', appId, 'users', uid, 'cloudReferences', referenceId);
  await deleteDoc(referenceRef);
};

export const cleanupExpiredCloudReferences = async ({ db, appId, uid, nowMs = Date.now() }) => {
  const referencesRef = collection(db, 'artifacts', appId, 'users', uid, 'cloudReferences');
  const referencesSnap = await getDocs(referencesRef);

  const expiredReferenceIds = referencesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((reference) => {
      const expiresAtIso = String(reference.metadataExpiresAtIso || '').trim();
      if (!expiresAtIso) return false;
      const expiresAtMs = Date.parse(expiresAtIso);
      if (!Number.isFinite(expiresAtMs)) return false;
      return expiresAtMs <= nowMs;
    })
    .map((reference) => String(reference.id || '').trim())
    .filter(Boolean);

  if (!expiredReferenceIds.length) {
    return { removedReferenceIds: [] };
  }

  await Promise.all(
    expiredReferenceIds.map((referenceId) => removeCloudReference({ db, appId, uid, referenceId }))
  );

  return {
    removedReferenceIds: expiredReferenceIds,
  };
};

export const loadSpellingCacheState = async ({ db, appId, uid }) => {
  const cacheRef = doc(db, 'artifacts', appId, 'users', uid, 'settings', SPELLING_CACHE_SETTING_ID);
  const cacheSnap = await getDoc(cacheRef);
  if (!cacheSnap.exists()) {
    return {
      words: [],
      expiresAt: 0,
      updatedAtIso: '',
    };
  }

  const data = cacheSnap.data() || {};
  return {
    words: Array.isArray(data.words) ? data.words.map((word) => String(word || '').trim()).filter(Boolean) : [],
    expiresAt: Number(data.expiresAt || 0),
    updatedAtIso: String(data.updatedAtIso || ''),
  };
};

export const saveSpellingCacheState = async ({ db, appId, uid, words = [], expiresAt }) => {
  const cacheRef = doc(db, 'artifacts', appId, 'users', uid, 'settings', SPELLING_CACHE_SETTING_ID);
  const normalizedWords = [...new Set((words || []).map((word) => String(word || '').trim()).filter(Boolean))];

  await setDoc(
    cacheRef,
    {
      words: normalizedWords,
      expiresAt: Number(expiresAt || 0),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    },
    { merge: true }
  );
};

export const removeSpellingCacheState = async ({ db, appId, uid }) => {
  const cacheRef = doc(db, 'artifacts', appId, 'users', uid, 'settings', SPELLING_CACHE_SETTING_ID);
  await deleteDoc(cacheRef);
};

const normalizeWordDocId = (word = '') => encodeURIComponent(String(word || '').trim().toLowerCase());
const clampReviewFrequency = (value = 1) => {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, Math.round(numeric)));
};

export const loadFeatureWordBank = async ({ db, appId, uid, featureId }) => {
  const wordsRef = collection(db, 'artifacts', appId, 'users', uid, 'wordBanks', featureId, 'words');
  const wordsSnap = await getDocs(wordsRef);

  return wordsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .map((item) => ({
      word: String(item.word || '').trim(),
      reviewFrequency: clampReviewFrequency(item.reviewFrequency || item.review_frequency || 1),
      updatedAtIso: item.updatedAtIso || '',
    }))
    .filter((item) => item.word)
    .sort((a, b) => {
      const left = Number(a.reviewFrequency || 1);
      const right = Number(b.reviewFrequency || 1);
      if (left !== right) return left - right;
      return a.word.localeCompare(b.word);
    });
};

export const upsertFeatureWord = async ({ db, appId, uid, featureId, word, reviewFrequency = 1 }) => {
  const cleanWord = String(word || '').trim();
  if (!cleanWord) return;
  const nextFrequency = clampReviewFrequency(reviewFrequency);

  const wordRef = doc(
    db,
    'artifacts',
    appId,
    'users',
    uid,
    'wordBanks',
    featureId,
    'words',
    normalizeWordDocId(cleanWord)
  );

  await setDoc(
    wordRef,
    {
      word: cleanWord,
      reviewFrequency: nextFrequency,
      review_frequency: String(nextFrequency),
      updatedAt: serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    },
    { merge: true }
  );
};

export const upsertFeatureWords = async ({ db, appId, uid, featureId, words = [] }) => {
  const uniqueWords = [...new Set((words || []).map((word) => String(word || '').trim()).filter(Boolean))];
  if (uniqueWords.length === 0) return;

  await Promise.all(
    uniqueWords.map((word) => upsertFeatureWord({
      db,
      appId,
      uid,
      featureId,
      word,
      reviewFrequency: 1,
    }))
  );
};

export const removeFeatureWord = async ({ db, appId, uid, featureId, word }) => {
  const cleanWord = String(word || '').trim();
  if (!cleanWord) return;

  const wordRef = doc(
    db,
    'artifacts',
    appId,
    'users',
    uid,
    'wordBanks',
    featureId,
    'words',
    normalizeWordDocId(cleanWord)
  );
  await deleteDoc(wordRef);
};
