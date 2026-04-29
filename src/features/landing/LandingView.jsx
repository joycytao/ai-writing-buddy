import React from 'react';
import { Mic, Sparkles } from 'lucide-react';

const LandingView = ({ grade, isListening, onToggleListening, featureCards, onOpenFeature }) => {
  return (
    <div className="flex-1 flex flex-col justify-center relative z-10 animate-in fade-in slide-in-from-top-3 duration-300">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-start">
        <div className="space-y-6 text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/75 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-orange-700 shadow-sm">
            <Sparkles size={14} className="text-orange-500" />
            Voice-first learning hub
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl md:text-6xl font-black text-stone-900 leading-[0.92] tracking-[-0.05em]">
              Pick a path, then learn out loud.
            </h2>
            <p className="max-w-xl text-lg md:text-xl leading-relaxed text-stone-600 font-medium">
              Choose a guided voice activity. Writing Journal keeps the exact same flow you already use.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onToggleListening}
              data-testid="home-mic-button"
              className={`relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-white/60 transition-all duration-300 ${isListening ? 'bg-red-500 scale-105 shadow-[0_18px_40px_rgba(239,68,68,0.3)]' : 'bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] shadow-[0_18px_40px_rgba(29,78,216,0.25)] hover:scale-105'}`}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              <Mic className="text-white w-8 h-8" />
              {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
            </button>
            <div>
              <p className="text-base font-black uppercase tracking-[0.22em] text-stone-900">Voice select</p>
              <p className="text-stone-600 text-base">Say the option name, like "Writing Journal" or "Spelling Champion".</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2.5rem] border border-white/80 bg-stone-950 p-6 text-white shadow-[0_30px_60px_rgba(25,25,25,0.18)]">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70 font-bold">Today</p>
          <p className="mt-2 text-3xl font-black tracking-tight">Learning modes</p>
          <p className="mt-3 text-sm leading-6 text-stone-300">All modes are voice input first. You can add cloud learning files next phase without storing files in app storage.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="font-black uppercase tracking-[0.16em] text-amber-100/80">Grade</p>
              <p className="mt-2 text-lg font-black text-white">{grade}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <p className="font-black uppercase tracking-[0.16em] text-amber-100/80">Input mode</p>
              <p className="mt-2 text-lg font-black text-white">Voice</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {featureCards.map((card) => (
          <button
            key={card.id}
            onClick={() => onOpenFeature(card.id)}
            className="rounded-[1.9rem] border border-white/80 bg-white/75 p-5 text-left shadow-[0_12px_30px_rgba(148,101,47,0.08)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white"
          >
            <p className="text-sm font-black uppercase tracking-[0.18em] text-stone-900">{card.title}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">{card.subtitle}</p>
            <p className="mt-3 text-sm leading-6 text-stone-600">{card.detail}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LandingView;
