import React from 'react';
import { ArrowLeft, BookOpen, Mic, Sparkles, Volume2 } from 'lucide-react';

const WritingJournalView = ({ generatedJournal, spellResult, isListening, onSpeakText, onBack, onSpellAssist, onHome, onBackToMenu }) => {
  return (
    <div className="flex-1 flex flex-col space-y-6 animate-in slide-in-from-bottom-6 h-full">
      <div className="flex flex-col gap-4 px-2 flex-shrink-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-orange-400" size={24} />
          <div>
            <h2 className="text-2xl font-black text-gray-700">Writing Time</h2>
            <p className="text-sm font-semibold text-gray-400">Keep the story handy while you write on paper.</p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 p-6 rounded-[2rem] border-2 border-yellow-200 shadow-sm relative flex-shrink-0">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-yellow-800 font-black uppercase tracking-widest">💡 Key Idea:</p>
          <button onClick={() => onSpeakText(generatedJournal)} className="p-2 bg-white rounded-full shadow-sm hover:scale-110 transition-transform">
            <Volume2 className="text-orange-500 w-5 h-5" />
          </button>
        </div>
        <p className="text-xl text-yellow-900 font-bold leading-relaxed pr-2 text-left">{generatedJournal}</p>
      </div>

      <div className="space-y-4 flex-shrink-0">
        {spellResult && (
          <div className="p-4 bg-green-500 text-white rounded-3xl shadow-xl animate-bounce font-black text-2xl text-center w-full">
            {spellResult}
          </div>
        )}

        <p className="text-center text-sm font-semibold text-stone-500">
          Say “how do I spell …” any time and Writing Buddy will spell it slowly.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <button
            onClick={onBack}
            className="min-w-0 rounded-[1.75rem] bg-white px-4 py-4 text-sm font-black uppercase tracking-[0.14em] text-stone-700 shadow-sm ring-1 ring-stone-200 transition-colors hover:bg-stone-50 flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <button onClick={onSpellAssist} className={`invisible min-w-0 px-4 py-4 rounded-[1.75rem] shadow-lg flex items-center justify-center gap-3 transition-all ${isListening ? 'bg-red-500 scale-[1.02]' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
            <Mic className="w-6 h-6 flex-shrink-0" />
            <div className="text-left min-w-0">
              <p className="font-black text-sm leading-none uppercase tracking-[0.12em]">Spell</p>
              <p className="text-[10px] opacity-70 truncate">Slow letter-by-letter help</p>
            </div>
          </button>

          <button
            onClick={onBackToMenu}
            className="min-w-0 rounded-[1.75rem] bg-stone-100 px-4 py-4 text-sm font-black uppercase tracking-[0.14em] text-stone-700 transition-colors hover:bg-stone-200 flex items-center justify-center gap-2"
          >
            <BookOpen size={16} />
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
};

export default WritingJournalView;
