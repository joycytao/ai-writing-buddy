import React from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Mic, RefreshCw, Sparkles, Volume2 } from 'lucide-react';

const WritingHomeView = ({
  step,
  isGuidedStep,
  answers,
  grade,
  isLocal,
  isListening,
  isMockMode,
  userInput,
  isConfirming,
  fiveWSteps,
  canGoToPreviousQuestion,
  generatedJournal,
  getStepQuestion,
  getLiveStatusMeta,
  getLocalDebugRows,
  getFlowSummaryCards,
  onToggleListening,
  onMoveToPrevStep,
  onGuidedMicClick,
  onSpeakText,
  onGoToWritingPage,
  onRestart,
  onBackToMenu,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-center text-center relative z-10">
      {step === 'idle' && (
        <div className="animate-in fade-in slide-in-from-top-4 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-center text-left">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/75 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-orange-700 shadow-sm">
              <Sparkles size={14} className="text-orange-500" />
              Gentle voice journaling
            </div>

            <div className="space-y-4">
              <h2 className="max-w-2xl text-5xl md:text-6xl font-black text-stone-900 leading-[0.92] tracking-[-0.05em]">
                A softer start for little storytellers.
              </h2>
              <p className="max-w-xl text-lg md:text-xl leading-relaxed text-stone-600 font-medium">
                Writing Buddy listens first, guides one question at a time, and turns everyday moments into a story kids can actually write down.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Listen', 'Voice-first prompts that feel like a patient buddy.'],
                ['Guide', 'Simple 5W1H steps that keep kids moving.'],
                ['Celebrate', 'A finished idea they can read, draw, and save.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-[1.6rem] border border-white/80 bg-white/70 p-4 shadow-[0_12px_30px_rgba(148,101,47,0.08)] backdrop-blur-sm">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-stone-900">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{copy}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
              <button
                onClick={onToggleListening}
                data-testid="home-mic-button"
                className={`relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-white/60 transition-all duration-300 ${isListening ? 'bg-red-500 scale-105 shadow-[0_18px_40px_rgba(239,68,68,0.3)]' : 'bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] shadow-[0_18px_40px_rgba(29,78,216,0.25)] hover:scale-105'} `}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
              >
                <Mic className="text-white w-8 h-8" />
                {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
              </button>
              <div className="space-y-1">
                <p className="text-base font-black uppercase tracking-[0.22em] text-stone-900">Tap to begin</p>
                <p className="text-stone-600 text-base">Then say, "I want to start writing."</p>
              </div>
            </div>

            <button
              onClick={onBackToMenu}
              className="inline-flex items-center justify-center rounded-full bg-stone-900 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white hover:bg-stone-800"
            >
              Back to Menu
            </button>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-3 rounded-[2.5rem] bg-[linear-gradient(145deg,_rgba(255,255,255,0.75),_rgba(255,255,255,0.15))] blur-xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/80 bg-stone-950 p-6 text-white shadow-[0_30px_60px_rgba(25,25,25,0.18)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70 font-bold">Session Flow</p>
                  <p className="mt-2 text-2xl font-black tracking-tight">From speaking to writing</p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-100">
                  {grade}
                </div>
              </div>

              {isLocal && (
                <div className={`mt-4 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getLiveStatusMeta().className}`} title={getLiveStatusMeta().detail}>
                  {getLiveStatusMeta().label}
                </div>
              )}

              {isLocal && (
                <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/10 p-4 text-left backdrop-blur-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/70">Local debug</p>
                  <div className="mt-3 space-y-2 text-xs text-stone-200">
                    {getLocalDebugRows().map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-3">
                        <span className="shrink-0 font-black uppercase tracking-[0.16em] text-amber-100/70">{row.label}</span>
                        <span className="text-right text-stone-100">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-3">
                {[
                  ['01', 'Talk it out', 'Speak naturally and let the app catch the moment.'],
                  ['02', 'Shape the idea', 'Prompt cards guide who, what, when, where, why, and how.'],
                  ['03', 'Write with confidence', 'Use the finished story and spelling help on paper.'],
                ].map(([num, title, copy]) => (
                  <div key={num} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-left">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-300 text-stone-900 font-black">
                        {num}
                      </div>
                      <div>
                        <p className="text-lg font-black">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-stone-300">{copy}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[1.6rem] bg-white/10 p-4 text-left backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.28em] text-amber-100/70 font-bold">Today’s prompt</p>
                <p className="mt-2 text-xl font-black leading-tight">What was the best part of your day, and who shared it with you?</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isGuidedStep && (
        <div className="w-full space-y-8 animate-in slide-in-from-right-4 duration-500 text-left">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-orange-700 shadow-sm">
                <BookOpen size={14} className="text-orange-500" />
                Story builder
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-stone-900 tracking-[-0.04em] capitalize">{step} matters.</h2>
              <p className="text-lg md:text-xl text-stone-600 font-medium leading-relaxed">{getStepQuestion(step, answers)}</p>
            </div>

            <div className="rounded-[2rem] border border-white/80 bg-white/70 px-5 py-4 shadow-[0_18px_40px_rgba(148,101,47,0.08)] backdrop-blur-sm min-w-[220px]">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500 font-bold">Current mode</p>
              <p className="mt-2 text-2xl font-black text-stone-900">{isConfirming ? 'Confirming' : 'Listening for ideas'}</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {isConfirming ? 'Check the answer before we move to the next prompt.' : step === 'story' ? 'Start with a quick retell, then we will break it into simple questions.' : 'Say the answer out loud, then we will help shape it.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-2">
            {canGoToPreviousQuestion ? (
              <button onClick={onMoveToPrevStep} className="p-2.5 bg-white/80 rounded-full hover:bg-white transition-colors shadow-sm ring-1 ring-stone-200"><ArrowLeft size={20} /></button>
            ) : (
              <div className="w-9" />
            )}
            <div className="flex gap-2 flex-1">
              {fiveWSteps.map((s) => (
                <div key={s} className={`h-3 flex-1 rounded-full transition-all duration-500 ${step === s ? 'bg-blue-500 shadow-md' : answers[s] ? 'bg-green-400' : 'bg-gray-100'}`} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={onMoveToPrevStep}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.18em] transition-all ${canGoToPreviousQuestion ? 'bg-white text-stone-800 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
            >
              <ArrowLeft size={16} />
              {canGoToPreviousQuestion ? 'Previous Question' : 'Back Home'}
            </button>
            <p className="text-sm font-semibold text-stone-500">
              {canGoToPreviousQuestion
                ? 'Need to fix something? Go back one question without losing the flow.'
                : 'Start with a quick story idea. Tap to leave this flow and return home.'}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-stretch">
            <div className={`p-8 md:p-10 rounded-[2.5rem] min-h-[220px] flex items-center text-left text-3xl md:text-4xl font-bold italic border transition-all duration-300 shadow-[0_18px_40px_rgba(148,101,47,0.08)] ${isConfirming ? 'bg-[linear-gradient(180deg,_#fff4e8,_#fff8f1)] text-orange-900 border-orange-100' : 'bg-[linear-gradient(180deg,_#eef7ff,_#f5fbff)] text-sky-900 border-sky-100'}`}>
              {userInput || (
                <span className="not-italic text-xl md:text-2xl font-semibold text-stone-400">
                  {isListening ? (isMockMode ? 'Mocking input...' : 'Listening for your answer...') : 'Tap the microphone and answer in your own words.'}
                </span>
              )}
            </div>

            <div className="rounded-[2.5rem] border border-white/80 bg-white/75 p-6 shadow-[0_18px_40px_rgba(148,101,47,0.08)] backdrop-blur-sm flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500 font-bold">Why this helps</p>
                <p className="mt-3 text-2xl font-black text-stone-900">
                  {isConfirming ? 'We pause to make sure the story stays true.' : 'One clear detail makes the final journal easier to write.'}
                </p>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {getFlowSummaryCards().map((card) => (
                  <div key={card.label} className={`rounded-[1.25rem] px-3 py-4 text-center ${card.active ? 'bg-orange-100 text-orange-900' : 'bg-stone-100 text-stone-500'}`}>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em]">{card.label}</p>
                    <p className="mt-2 text-sm font-black capitalize">{card.value}</p>
                  </div>
                ))}
              </div>

              {isLocal && (
                <div className="mt-6 rounded-[1.4rem] border border-stone-200 bg-stone-900 p-4 text-left text-white">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-300">Local debug</p>
                  <div className="mt-3 space-y-2 text-xs text-stone-100">
                    {getLocalDebugRows().map((row) => (
                      <div key={row.label} className="flex items-start justify-between gap-3">
                        <span className="shrink-0 font-black uppercase tracking-[0.16em] text-stone-400">{row.label}</span>
                        <span className="text-right text-stone-100" data-testid={`debug-${row.label.toLowerCase().replace(/\s+/g, '-')}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto pb-4 flex flex-col items-center gap-4">
            <button onClick={onGuidedMicClick} data-testid="guided-mic-button" className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative border border-white/70 ${isListening ? 'bg-red-500 scale-105 shadow-red-200' : 'bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] hover:scale-105 active:scale-95 shadow-blue-200'}`}>
              <Mic className="text-white w-8 h-8 md:w-9 md:h-9" />
              {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
            </button>
            <p className="text-stone-500 font-black text-sm md:text-base uppercase tracking-[0.2em] h-6 text-center">
              {isListening ? "I'm listening..." : (userInput ? 'Tap to record again' : 'Tap to speak')}
            </p>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="py-20 flex flex-col items-center space-y-6">
          <RefreshCw className="w-20 h-20 text-blue-500 animate-spin" />
          <p className="text-2xl font-bold text-gray-600">Polishing your story...</p>
        </div>
      )}

      {step === 'result' && (
        <div className="w-full space-y-8 animate-in fade-in">
          <div className="bg-orange-50 p-8 rounded-[2.5rem] border-4 border-orange-100 text-left relative shadow-inner">
            <button onClick={() => onSpeakText(generatedJournal)} className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-md"><Volume2 className="text-orange-500 w-6 h-6" /></button>
            <p className="text-2xl leading-relaxed font-bold text-gray-800 pr-10 text-left">{generatedJournal}</p>
          </div>
          <div className="flex gap-4">
            <button onClick={onRestart} className="flex-1 py-5 bg-gray-100 rounded-2xl font-black text-gray-500">Restart</button>
            <button onClick={onGoToWritingPage} className="flex-1 py-5 bg-green-500 text-white rounded-2xl font-black text-xl shadow-lg flex items-center justify-center gap-2">Start Writing <ChevronRight /></button>
          </div>
          <button
            onClick={onBackToMenu}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-black uppercase tracking-[0.16em] text-white hover:bg-stone-800"
          >
            Back to Menu
          </button>
        </div>
      )}
    </div>
  );
};

export default WritingHomeView;
