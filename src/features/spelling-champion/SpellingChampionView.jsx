import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, FolderOpen, Loader2, SendHorizontal, Volume2, X } from 'lucide-react';

const SpellingChampionView = ({
  onBackToMenu,
  customMessage,
  linkedResources,
  cacheWords,
  cacheExpiresAt,
  cloudWordsError,
  isCloudWordsLoading,
  spellingActionMessage,
  spellingPracticeOpen,
  practiceWord,
  spellingQuizOpen,
  quizQuestionIndex,
  quizTotal,
  quizPromptWord,
  quizAnswer,
  quizFeedback,
  quizAwaitingVoice,
  quizFocusNonce,
  historyRows,
  onLoadCloudWords,
  onStartPractice,
  onStopPractice,
  onStartQuiz,
  onCloseQuiz,
  onQuizAnswerChange,
  onQuizSubmit,
  onQuizRepeat,
  onQuizSpeakAnswer,
}) => {
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const quizInputRef = useRef(null);

  useEffect(() => {
    if (!spellingQuizOpen) return;
    window.requestAnimationFrame(() => {
      quizInputRef.current?.focus();
      quizInputRef.current?.select();
    });
  }, [spellingQuizOpen, quizQuestionIndex, quizFocusNonce]);

  const maxScore = Math.max(10, ...historyRows.map((item) => Number(item.score || 0)));

  return (
    <div className="flex-1 flex flex-col justify-center relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mx-auto w-full max-w-4xl rounded-[2.5rem] border border-white/80 bg-white/80 p-8 md:p-10 shadow-[0_24px_60px_rgba(120,74,24,0.12)] backdrop-blur-sm text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-600">Voice mode</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-[-0.04em] text-stone-900">Spelling Champion</h2>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-stone-500">Phonetic awareness coach</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFolderMenuOpen(true)}
              className="rounded-full border border-stone-200 bg-white p-3 text-stone-700 hover:bg-stone-50"
              aria-label="Open spelling menu"
            >
              <FolderOpen size={18} />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="rounded-full border border-stone-200 bg-white p-3 text-stone-700 hover:bg-stone-50"
              aria-label="Open spelling history"
            >
              <BarChart3 size={18} />
            </button>
          </div>
        </div>

        <p className="mt-5 text-lg leading-relaxed text-stone-600">
          Load words from linked cloud references. Then choose Practice Mode or Spelling Mode.
        </p>

        {customMessage.trim() && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Feature custom requirement</p>
            <p className="mt-1 text-sm leading-6 text-amber-900">{customMessage.trim()}</p>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            onClick={onStartPractice}
            disabled={cacheWords.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-blue-200 shadow-lg hover:scale-[1.01] disabled:opacity-50"
          >
            Practice Mode
          </button>
          <button
            onClick={onStartQuiz}
            disabled={cacheWords.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white hover:bg-stone-800 disabled:opacity-50"
          >
            Spelling Mode
          </button>
        </div>

        {(cloudWordsError || spellingActionMessage) && (
          <div className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${cloudWordsError ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {cloudWordsError || spellingActionMessage}
          </div>
        )}

        <div className="mt-3">
          <button
            onClick={onBackToMenu}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-100 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-stone-700 hover:bg-stone-200"
          >
            <ArrowLeft size={16} />
            Back to Menu
          </button>
        </div>

        {folderMenuOpen && (
          <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-stone-700">Spelling menu</p>
                <button onClick={() => setFolderMenuOpen(false)} className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Close</button>
              </div>
              <button
                onClick={async () => {
                  await onLoadCloudWords();
                  setFolderMenuOpen(false);
                }}
                disabled={isCloudWordsLoading}
                className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {isCloudWordsLoading ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading...</span> : 'Load Cloud Words'}
              </button>
              {linkedResources.length === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  No linked reference yet. Go to Settings to link a cloud reference first.
                </p>
              )}
            </div>
          </div>
        )}

        {spellingPracticeOpen && (
          <div className="fixed inset-0 z-[82] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center space-y-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-stone-500">Practice mode</p>
              <p className="text-4xl font-black tracking-tight text-stone-900">{practiceWord || '--'}</p>
              <p className="text-sm text-stone-500">Word cards loop continuously. Listen and repeat.</p>
              <button
                onClick={onStopPractice}
                className="rounded-full bg-stone-900 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white"
              >
                Stop Practice
              </button>
            </div>
          </div>
        )}

        {spellingQuizOpen && (
          <div className="fixed inset-0 z-[84] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-stone-500">Spelling mode</p>
                <button onClick={onCloseQuiz} className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Close</button>
              </div>
              <p className="text-sm font-semibold text-stone-600">Question {quizQuestionIndex + 1} / {quizTotal}</p>
              <p className="text-lg font-black text-stone-900">Spell the word you hear.</p>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  ref={quizInputRef}
                  value={quizAnswer}
                  onChange={(e) => onQuizAnswerChange(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    onQuizSubmit();
                  }}
                  placeholder="Type your answer"
                  className="rounded-xl border border-stone-200 px-4 py-3 text-base"
                />
                <div className="flex flex-col gap-2">
                  <button onClick={onQuizRepeat} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-stone-700">
                    <span className="inline-flex items-center gap-1"><Volume2 size={14} /> Listen</span>
                  </button>
                  <button onClick={onQuizSpeakAnswer} className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${quizAwaitingVoice ? 'bg-red-500 text-white' : 'bg-stone-900 text-white'}`}>
                    Speak
                  </button>
                </div>
              </div>

              <button onClick={onQuizSubmit} className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white">
                <SendHorizontal size={14} /> Submit
              </button>

              {quizFeedback && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{quizFeedback}</p>
              )}

            </div>
          </div>
        )}

        {historyOpen && (
          <div className="fixed inset-0 z-[86] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-stone-700">Last 30 days history</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
                    aria-label="Dismiss history modal"
                  >
                    <X size={14} />
                  </button>
                  <button onClick={() => setHistoryOpen(false)} className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Close</button>
                </div>
              </div>
              <div className="space-y-2">
                {historyRows.map((item, index) => (
                  <div key={`${item.dateIso}-${index}`} className="grid grid-cols-[96px_1fr_60px] items-center gap-2">
                    <p className="text-xs text-stone-500">{new Date(item.dateIso).toLocaleDateString()}</p>
                    <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${Math.round((Number(item.score || 0) / maxScore) * 100)}%` }} />
                    </div>
                    <p className="text-xs font-bold text-stone-700 text-right">{item.score}/{item.total}</p>
                  </div>
                ))}
                {historyRows.length === 0 && <p className="text-sm text-stone-500">No test history yet.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpellingChampionView;
