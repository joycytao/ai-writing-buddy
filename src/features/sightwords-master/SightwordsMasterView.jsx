import React, { useMemo, useState } from 'react';
import { ArrowLeft, FolderOpen, Loader2 } from 'lucide-react';

const SightwordsMasterView = ({
  onBackToMenu,
  customMessage,
  linkedResources,
  bankWords,
  bankError,
  isBankLoading,
  onLoadCloudWords,
  onRefreshWordBank,
  onUpsertWord,
  onRemoveWord,
  onStart,
  isSessionActive,
  currentWord,
  sessionHint,
  featureActionMessage,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newFrequency, setNewFrequency] = useState('1');

  const sortedWords = useMemo(() => {
    return [...bankWords].sort((a, b) => {
      const left = Number(a.reviewFrequency || 1);
      const right = Number(b.reviewFrequency || 1);
      if (left !== right) return left - right;
      return String(a.word || '').localeCompare(String(b.word || ''));
    });
  }, [bankWords]);

  const handleAddWord = () => {
    const word = newWord.trim();
    const reviewFrequency = Math.min(5, Math.max(1, Number(newFrequency || 1)));
    if (!word) return;
    onUpsertWord(word, reviewFrequency);
    setNewWord('');
    setNewFrequency('1');
  };

  return (
    <div className="flex-1 flex flex-col justify-center relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mx-auto w-full max-w-4xl rounded-[2.5rem] border border-white/80 bg-white/80 p-8 md:p-10 shadow-[0_24px_60px_rgba(120,74,24,0.12)] backdrop-blur-sm text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-600">Voice mode</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-[-0.04em] text-stone-900">Sightwords Master</h2>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-stone-500">Sightword champion mode</p>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-full border border-stone-200 bg-white p-3 text-stone-700 hover:bg-stone-50"
            aria-label="Open sightwords menu"
          >
            <FolderOpen size={18} />
          </button>
        </div>

        <p className="mt-5 text-lg leading-relaxed text-stone-600">
          {isSessionActive
            ? 'Say the shown sightword. You can also say "i do not know" or "next" to skip.'
            : 'Open the folder menu to load cloud words or check/edit your word list.'}
        </p>

        {customMessage.trim() && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Feature custom requirement</p>
            <p className="mt-1 text-sm leading-6 text-amber-900">{customMessage.trim()}</p>
          </div>
        )}

        <div className="mt-6 rounded-[2rem] border border-stone-200 bg-stone-50 p-6 min-h-52 flex items-center justify-center text-center">
          {isSessionActive ? (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500 font-black">Current sightword</p>
              <p className="mt-3 text-6xl font-black tracking-tight text-stone-900">{currentWord || '--'}</p>
              <p className="mt-4 text-sm text-stone-500">{sessionHint}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500 font-black">Ready to begin</p>
              <p className="mt-3 text-2xl font-black text-stone-800">{bankWords.length} sightwords loaded</p>
              <p className="mt-2 text-sm text-stone-500">Link a folder and load words, then press Start.</p>
            </div>
          )}
        </div>

        {(bankError || featureActionMessage) && (
          <div className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${bankError ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {bankError || featureActionMessage}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={onStart}
            disabled={bankWords.length === 0 || isBankLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-blue-200 shadow-lg hover:scale-[1.01] disabled:opacity-50"
          >
            {isSessionActive ? 'Restart' : 'Start'}
          </button>
          <button
            onClick={onBackToMenu}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-100 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-stone-700 hover:bg-stone-200"
          >
            <ArrowLeft size={16} />
            Back to Menu
          </button>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-stone-700">Sightwords menu</p>
                <button onClick={() => setMenuOpen(false)} className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Close</button>
              </div>
              <button
                onClick={async () => {
                  await onLoadCloudWords();
                  setMenuOpen(false);
                }}
                disabled={isBankLoading}
                className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {isBankLoading ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading...</span> : 'Load Cloud Words'}
              </button>
              <button
                onClick={async () => {
                  await onRefreshWordBank();
                  setMenuOpen(false);
                  setCheckOpen(true);
                }}
                className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-stone-700 hover:bg-stone-50"
              >
                Check Words
              </button>
              {linkedResources.length === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  No linked reference yet. Go to Settings to link a cloud reference first.
                </p>
              )}
            </div>
          </div>
        )}

        {checkOpen && (
          <div className="fixed inset-0 z-[85] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-stone-700">Word list</p>
                <button onClick={() => setCheckOpen(false)} className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Close</button>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                <input
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="Add word"
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value)}
                  placeholder="Box 1-5"
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
                <button onClick={handleAddWord} className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">Add</button>
              </div>
              <p className="text-xs text-stone-500">Leitner box uses values 1-5 only. 1 = daily review, 5 = monthly review.</p>

              <div className="max-h-80 overflow-auto space-y-2 pr-1">
                {sortedWords.map((item) => (
                  <div key={item.word} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-center">
                    <p className="text-sm font-semibold text-stone-800">{item.word}</p>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={item.reviewFrequency}
                      onChange={(e) => onUpsertWord(item.word, Number(e.target.value || 1))}
                      className="rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => onRemoveWord(item.word)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {sortedWords.length === 0 && <p className="text-sm text-stone-500">No words saved yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SightwordsMasterView;
