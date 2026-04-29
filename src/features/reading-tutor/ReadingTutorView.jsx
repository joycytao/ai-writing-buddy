import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FolderOpen, Loader2, Sparkles } from 'lucide-react';

const ReadingTutorView = ({
  isListening,
  onBackToMenu,
  onOpenWritingJournal,
  mode = 'reading-tutor',
  linkedResources,
  cloudWordsLoadedAtIso,
  cloudWordsError,
  isCloudWordsLoading,
  onLoadCloudWords,
  tutorFeedback,
  isContinuousListening,
  worksheetWarnings,
  activeWorksheet,
  questionIndex,
  score,
  answers,
  highlightTerms,
  onAnswer,
  onStoryWordTap,
  onPlayWord,
  unfamiliarWords,
  onStartWordReview,
  isWordReviewing,
  isWordReviewCompleted,
  showQuestions,
  readingDoneSignal,
  discussionQuestion,
  discussionDone,
  isCelebrating,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const storyScrollRef = useRef(null);
  const unfamiliarSectionRef = useRef(null);
  const hasWorksheet = Boolean(activeWorksheet);
  const questions = Array.isArray(activeWorksheet?.questions) ? activeWorksheet.questions.slice(0, 3) : [];
  const currentQuestion = questions[questionIndex] || null;
  const isStoryADay = mode === 'story-a-day';

  const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const isWordToken = (value = '') => /^[A-Za-z][A-Za-z'-]*$/.test(String(value || '').trim());

  const renderStoryWithHighlights = (storyText = '', terms = []) => {
    const story = String(storyText || '');
    if (!story) return <p className="text-stone-500">Load a worksheet to begin.</p>;
    const renderInteractiveText = (text, isHit = false, keyPrefix = 'chunk') => {
      const pieces = String(text || '').split(/(\b[A-Za-z][A-Za-z'-]*\b)/g);
      return pieces.map((piece, idx) => {
        if (!isWordToken(piece)) return <span key={`${keyPrefix}-${idx}`}>{piece}</span>;
        return (
          <button
            key={`${keyPrefix}-${idx}`}
            type="button"
            onClick={() => onStoryWordTap?.(piece)}
            className={`rounded px-1 py-0.5 transition ${isHit ? 'text-stone-900 underline decoration-amber-500 decoration-2' : 'hover:bg-amber-100 hover:text-stone-900'}`}
            title="Tap to hear and add to unfamiliar words"
          >
            {piece}
          </button>
        );
      });
    };

    if (!Array.isArray(terms) || terms.length === 0) {
      return <p className="whitespace-pre-wrap text-lg leading-9">{renderInteractiveText(story, false, 'plain')}</p>;
    }

    const prepared = Array.from(new Set(terms.map((term) => String(term || '').trim()).filter(Boolean)));
    if (prepared.length === 0) return <p className="whitespace-pre-wrap text-lg leading-9">{renderInteractiveText(story, false, 'plain')}</p>;

    const regex = new RegExp(`(${prepared
      .sort((a, b) => b.length - a.length)
      .map((term) => escapeRegex(term).replace(/\\\s+/g, '\\\\s+'))
      .join('|')})`, 'gi');

    const parts = story.split(regex);
    return (
      <p className="whitespace-pre-wrap text-lg leading-9">
        {parts.map((part, idx) => {
          const isHit = prepared.some((term) => new RegExp(`^${escapeRegex(term).replace(/\\\s+/g, '\\\\s+')}$`, 'i').test(part));
          if (!isHit) return <span key={`${part}-${idx}`}>{renderInteractiveText(part, false, `p-${idx}`)}</span>;
          return (
            <mark
              key={`${part}-${idx}`}
              data-story-highlight="true"
              className="rounded-md border-2 border-dashed border-amber-500 bg-[#fef08a] px-1 py-0.5 animate-pulse"
            >
              {renderInteractiveText(part, true, `h-${idx}`)}
            </mark>
          );
        })}
      </p>
    );
  };

  const getOptionClassName = (questionId, optionLabel) => {
    const record = answers?.[questionId];
    if (!record || record.selectedLabel !== optionLabel) {
      return 'border-stone-200 bg-white hover:bg-stone-50 text-stone-800';
    }

    return record.isCorrect
      ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
      : 'border-rose-300 bg-rose-100 text-rose-900';
  };

  useEffect(() => {
    if (!storyScrollRef.current || !Array.isArray(highlightTerms) || highlightTerms.length === 0) return;
    const firstHighlight = storyScrollRef.current.querySelector('[data-story-highlight="true"]');
    firstHighlight?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightTerms, activeWorksheet?.story]);

  useEffect(() => {
    if (!readingDoneSignal || !unfamiliarSectionRef.current) return;
    unfamiliarSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [readingDoneSignal]);

  return (
    <div className="flex-1 flex flex-col justify-center relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <style>{`
        @keyframes reading-scan {
          0% { transform: translateY(-140%); }
          100% { transform: translateY(230%); }
        }
      `}</style>

      <div className="mx-auto w-full max-w-5xl rounded-[2.5rem] border border-white/80 bg-white/85 p-6 md:p-8 shadow-[0_24px_60px_rgba(120,74,24,0.12)] backdrop-blur-sm text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-600">Voice mode</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-black tracking-[-0.04em] text-stone-900">{isStoryADay ? 'A Story a Day' : 'Reading Tutor'}</h2>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-stone-500">Cloud-powered reading coach</p>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-full border border-stone-200 bg-white p-3 text-stone-700 hover:bg-stone-50"
            aria-label="Open reading tutor menu"
          >
            <FolderOpen size={18} />
          </button>
        </div>

        <p className="mt-5 text-lg leading-relaxed text-stone-600">
          {isStoryADay
            ? 'Load today\'s story, tap unfamiliar words, review them together, then discuss the story.'
            : 'Load a worksheet, tap unfamiliar words, review them, then continue with questions.'}
        </p>

        <p className="mt-2 text-lg leading-relaxed text-stone-600">
          Read the story. Ask yourself, "What is make-believe and what can happen?"
        </p>

        {cloudWordsError && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{cloudWordsError}</p>
        )}

        {!cloudWordsError && cloudWordsLoadedAtIso && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            Worksheet loaded at {new Date(cloudWordsLoadedAtIso).toLocaleTimeString()}.
          </p>
        )}

        {Array.isArray(worksheetWarnings) && worksheetWarnings.length > 0 && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            {worksheetWarnings[0]}
          </p>
        )}

        {hasWorksheet && !isCelebrating && (
          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                {isStoryADay
                  ? `Story ${activeWorksheet.weekNumber || ''}`
                  : `Week ${activeWorksheet.weekNumber} • Day ${activeWorksheet.dayNumber}`}
              </p>
              {activeWorksheet?.title ? (
                <h3 className="mt-2 text-2xl font-black text-stone-900">{activeWorksheet.title}</h3>
              ) : null}
              <div ref={storyScrollRef} className="mt-4 max-h-[320px] overflow-y-auto rounded-xl bg-stone-50 p-4 text-lg font-semibold text-stone-900 scroll-smooth">
                {renderStoryWithHighlights(activeWorksheet?.story || '', highlightTerms || [])}
              </div>
            </div>
          </div>
        )}

        {hasWorksheet && !isCelebrating && (
          <div className={`mt-6 rounded-2xl border p-5 ${isWordReviewCompleted ? 'border-emerald-300 bg-emerald-50/60' : 'border-stone-200 bg-white'}`}>
            <div ref={unfamiliarSectionRef} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">Unfamiliar word bank</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onStartWordReview}
                  disabled={isWordReviewing || isWordReviewCompleted}
                  className="rounded-full bg-stone-900 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white disabled:opacity-40"
                >
                  {isWordReviewCompleted ? 'Reviewed' : (isWordReviewing ? 'Reviewing...' : 'Review words')}
                </button>
                {isWordReviewCompleted && <CheckCircle2 size={20} className="text-emerald-600" />}
              </div>
            </div>
            <p className="mt-2 text-sm text-stone-600">Tap any word in the story to hear pronunciation and add it here.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(unfamiliarWords || []).length === 0 && <p className="text-sm text-stone-500">No unfamiliar words yet.</p>}
              {(unfamiliarWords || []).map((word) => (
                <button
                  key={word}
                  onClick={() => onPlayWord?.(word)}
                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900 hover:bg-amber-100"
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasWorksheet && !isCelebrating && showQuestions && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">Step-by-step questions</p>
              <p className="text-sm font-black text-stone-700">Score: {score}/{questions.length || 3}</p>
            </div>

            {!currentQuestion && (
              <p className="mt-4 text-sm text-stone-600">No questions found for this worksheet section. Try another week/day or a different file.</p>
            )}

            {currentQuestion && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">Question {questionIndex + 1}</p>
                  <p className="mt-2 text-base font-semibold leading-7 text-sky-950">{currentQuestion.stem}</p>
                </div>

                <div className="grid gap-2">
                  {(currentQuestion.options || []).map((option) => (
                    <button
                      key={`${currentQuestion.id}-${option.label}`}
                      onClick={() => onAnswer(option.label)}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors ${getOptionClassName(currentQuestion.id, option.label)}`}
                    >
                      <span className="mr-2">{option.label}.</span>
                      {option.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {hasWorksheet && !isCelebrating && isStoryADay && isWordReviewCompleted && (
          <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Story discussion</p>
            <p className="mt-2 text-sm text-sky-900">
              {discussionDone
                ? 'Great understanding today. Writing a reading log is optional, but you can do it now.'
                : (discussionQuestion || 'Answer the voice question to discuss the story.')}
            </p>
            {discussionDone && (
              <button
                onClick={onOpenWritingJournal}
                className="mt-4 rounded-full bg-sky-700 px-5 py-2 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-sky-800"
              >
                Optional: Write Reading Log
              </button>
            )}
          </div>
        )}

        {hasWorksheet && isCelebrating && (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-[linear-gradient(140deg,_#ecfdf5,_#d1fae5)] p-8 text-center animate-in fade-in zoom-in duration-500">
            <Sparkles className="mx-auto text-emerald-600" size={34} />
            <h3 className="mt-4 text-3xl font-black text-emerald-900">Reading Complete</h3>
            <p className="mt-2 text-base font-semibold text-emerald-800">You answered all 3 questions. Fireworks are live in the background!</p>
            <p className="mt-3 text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Final Score: {score}/3</p>
          </div>
        )}

        {tutorFeedback && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">AI reading feedback</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900">{tutorFeedback}</p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-black uppercase tracking-[0.16em] ${isListening || isContinuousListening ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-600'}`}>
            {isListening || isContinuousListening ? 'Voice Listening Active' : 'Voice Listening Idle'}
          </div>
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
                <p className="text-sm font-black uppercase tracking-[0.16em] text-stone-700">Reading tutor menu</p>
                <button onClick={() => setMenuOpen(false)} className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Close</button>
              </div>
              <button
                onClick={async () => {
                  await onLoadCloudWords();
                  setMenuOpen(false);
                }}
                disabled={isCloudWordsLoading}
                className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {isCloudWordsLoading ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading...</span> : (isStoryADay ? 'Load Today\'s Story' : 'Scan Worksheet')}
              </button>
              {linkedResources.length === 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                  No linked reference yet. Go to Settings to link a cloud reference first.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingTutorView;
