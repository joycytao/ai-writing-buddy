import React, { useState, useEffect, useRef } from 'react';
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Mic, 
  Settings, 
  BookOpen, 
  Send, 
  Volume2, 
  HelpCircle, 
  RefreshCw, 
  Award, 
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FlaskConical,
  Sparkles,
  ImageIcon,
  Camera
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

const appId = typeof __app_id !== 'undefined' ? __app_id : 'journal-buddy-app';
const googleAIKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';


  const App = () => {
  // --- 狀態管理 ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); 
  const [studentName, setStudentName] = useState(() => localStorage.getItem('journal_buddy_name') || ''); 
  const [grade, setGrade] = useState(() => localStorage.getItem('journal_buddy_grade') || 'Kindergarten'); 
  const [customExpectation, setCustomExpectation] = useState(() => localStorage.getItem('journal_buddy_custom_expectation') || '');
  const [draftCustomExpectation, setDraftCustomExpectation] = useState(() => localStorage.getItem('journal_buddy_custom_expectation') || '');
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

  const recognitionRef = useRef(null);
  const customRecognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const mockActionTimerRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const hasAutoTriggeredSpellMockRef = useRef(false);


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


  // voice recognition setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US'; 

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        handleVoiceInput(transcript);
        stopListening();
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [step, isConfirming, answers, view]);

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
      }, 500);
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

  const startListening = () => {
    if (isSpeaking) return;
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (e) {
      // avoid redundant errors if start is called multiple times
      setIsListening(false);
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      setIsListening(false);
    }
  };

  const handleSpellAssistPress = () => {
    if (isMockMode && view === 'journaling') {
      setIsListening(true);
      mockActionTimerRef.current = setTimeout(() => {
        handleVoiceInput('how to spell elephant');
        stopListening();
      }, 500);
      return;
    }

    startListening();
  };

  // ---  handle voice input logic ---
  const handleVoiceInput = (text) => {

    if (step === 'idle' && (text.includes('journal') || text.includes('write'))) {
      startGuidedProcess();
      return;
    }

    if (text.includes('go back') || text.includes('previous step')) {
      moveToPrevStep();
      return;
    }

    setUserInput(text);

    // 5W1H 核心引導流程
    if (['who', 'what', 'when', 'where', 'why', 'how'].includes(step)) {
      if (isConfirming) {
        handleConfirmation(text);
      } else {
        processInitialAnswer(text);
      }
    }
    // Spell check trigger
    if (view === 'journaling' && text.includes('how to spell')) {
      const word = text.split('how to spell').pop().trim();
      if (word) handleSpellCheck(word);
    }
  };

  // --- 5W1H logic ---
  const startGuidedProcess = () => {
    setAnswers({});
    setUserInput(''); 
    setStep('who');
    setIsConfirming(false);
    setJournalImage(null);
    speakAndListen("Awesome! Let's write. First, Who were you with today?");
  };

  // step 1: handle initial answer and ask for confirmation
  const processInitialAnswer = (text) => {
    setAnswers(prev => ({ ...prev, [step]: text }));
    setIsConfirming(true);
    const question = getConfirmationQuestion(step, text);
    speakAndListen(`${question} Is this correct?`);
  };

  // Step 2：comfirm with user if the answer is correct, if not, let them answer again
  const handleConfirmation = (text) => {
    const positiveWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'it is', 'sure'];
    const negativeWords = ['no', 'nope', 'not', 'wrong', 'change', 'incorrect', 'wait'];

    const isYes = positiveWords.some(word => text.includes(word));
    const isNo = negativeWords.some(word => text.includes(word));

    if (isYes) {
      // move to next question
      moveToNextStep();
    } else if (isNo) {
      // back to current question and let user answer again
      setIsConfirming(false);
      setUserInput('');
      const question = getStepQuestion(step);
      speakAndListen(`No problem! Let's try again. ${question}`);
    } else {
       if (text.length > 3 && !isYes && !isNo) { 
        processInitialAnswer(text);
      }
      speakAndListen(`I didn't quite catch that. Is "${answers[step]}" correct? Please say Yes or No.`);
    }
  };

  const getStepQuestion = (s) => {
    const questions = {
      who: "Who were you with today?",
      what: "What did you do?",
      when: "When did this happen?",
      where: "Where were you?",
      why: "Why was it special?",
      how: "How did you feel about it?"
    };
    return questions[s] || "";
  };

  const getConfirmationQuestion = (s, answer) => {
    const questions = {
      who: `You said you were with ${answer}.`,
      what: `You said you did ${answer}.`,
      when: `You said it happened ${answer}.`,
      where: `You mentioned you were at ${answer}.`,
      why: `You said it was special because ${answer}.`,
      how: `You said you felt ${answer}.`
    };
    return `${questions[s] || `You said: ${answer}.`}`;
  };

  const triggerMockInput = () => {
    if (step === 'idle') {
      handleVoiceInput("i want to write my journal");
    } else if (isConfirming) {
      handleVoiceInput("yes");
    } else {
      const mocks = {
        who: "my big brother",
        what: "went to the zoo",
        when: "on Saturday morning",
        where: "at the city zoo",
        why: "we saw a huge elephant",
        how: "so excited"
      };
      handleVoiceInput(mocks[step] || "it was fun");
    }
    stopListening();
  };

  const moveToNextStep = () => {
    const flow = ['who', 'what', 'when', 'where', 'why', 'how', 'generating'];
    const currentIndex = flow.indexOf(step);
    const nextStep = flow[currentIndex + 1];
    
    setStep(nextStep);
    setIsConfirming(false);
    setUserInput('');

    if (nextStep === 'generating') {
      generateJournalContent(answers);
    } else {
      speakAndListen(`Great! Next, ${getStepQuestion(nextStep)}`);
    }
  };

  const moveToPrevStep = () => {
    const flow = ['who', 'what', 'when', 'where', 'why', 'how'];
    const currentIndex = flow.indexOf(step);
    if (currentIndex > 0) {
      const prevStep = flow[currentIndex - 1];
      const previousAnswer = answers[prevStep] || '';
      setStep(prevStep);
      setIsConfirming(false);
      setUserInput(previousAnswer);
      const confirmationText = previousAnswer ? ` ${getConfirmationQuestion(prevStep, previousAnswer)}` : '';
      speakAndListen(`Let's go back. ${getStepQuestion(prevStep)}${confirmationText}`);
    } else if (step === 'who') {
      // to prevent user from going back before 'who' step by voice command, we can reset the whole flow
      setStep('idle');
      setAnswers({});
      speakText("Going back to home.");
    }
  };

  // --- Speak and Listen ---
   const speakAndListen = async (text) => {

    stopListening();
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
- Output only the journal text, with no title, bullets, labels, or explanation.`;

    console.log("Sending prompt to Google AI:", prompt);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });



      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini journal request failed", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        throw new Error(`Gemini request failed with ${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ''}`);
      }

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

  const generateImageWithGemini = async (journalText) => {
      setIsGeneratingImage(true);
      const promptText = `A cute, colorful children's book illustration for a kid's journal entry: ${journalText}. Bright colors, simple cartoon style, happy mood.`;
      try {
        const payload = {
          contents: [{
            parts: [{ text: `Generate a cute, colorful children's book illustration style image of: ${promptText} Draw like a kid's drawing.` }]
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE']
          }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Gemini image request failed");

        const result = await response.json();
        const base64Data = result.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
        if (base64Data) {
          setJournalImage(`data:image/png;base64,${base64Data}`);
          setImageUrl(`data:image/png;base64,${base64Data}`);
        } else {
          setJournalImage(null);
          setImageUrl("https://placehold.co/600x400/orange/white?text=Your+Story+Illustration");
        }

      } catch (error) {
        console.error("Banana Image Error:", error);

      } finally {
        setIsGeneratingImage(false);
      }
  };


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

  const generateImageWithImagen = async (journalText) => {
    
     setIsGeneratingImage(true);

    const promptText = `Cute colorful cartoon illustration for a kid: ${journalText}. Bright and happy colors.`;
    try {
      
      const payload = {
        instances: [
          { 
            prompt: `A cute, colorful children's book illustration for a kid's journal entry: ${promptText}. Bright colors, simple cartoon style, happy mood.` 
          }
        ],
        parameters: { 
          sampleCount: 1 
        }
      };
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.predictions?.[0]?.bytesBase64Encoded) {
        setJournalImage(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
        setImageUrl(`data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`);
      } else {
        setJournalImage(null);
        setImageUrl("https://placehold.co/600x400/orange/white?text=Your+Story+Illustration");
      }
    } catch (error) {
      console.error("Banana Image Error:", error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const speakText = async (text, options = {}) => {
    const { rate = 0.9 } = options;
    // if (isMockMode) {
      console.log("[Mock TTS]:", text);
      return new Promise((resolve) => {
        const ut = new SpeechSynthesisUtterance(text);
        ut.lang = 'en-US';
        ut.rate = rate;
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
    speakText(`${word} is spelled ${spokenSpelling}`, { rate: 0.6 });
    setTimeout(() => setSpellResult(''), 8000);
  };

  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else { setIsListening(true); recognitionRef.current?.start(); }
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
    localStorage.setItem('journal_buddy_name', studentName);
    localStorage.setItem('journal_buddy_grade', grade);
    localStorage.setItem('journal_buddy_custom_expectation', customExpectation.trim());
    setView('home');
  };

  const openCustomExpectationModal = () => {
    setDraftCustomExpectation(customExpectation);
    setShowCustomExpectationModal(true);
  };

  const saveCustomExpectation = () => {
    setCustomExpectation(draftCustomExpectation.trim());
    setShowCustomExpectationModal(false);
    setIsCustomListening(false);
  };

  const clearCustomExpectation = () => {
    setDraftCustomExpectation('');
    setCustomExpectation('');
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

  const isGuidedStep = ['who', 'what', 'when', 'where', 'why', 'how'].includes(step);
  const canGoToPreviousQuestion = isGuidedStep && step !== 'who';
  const gradeLevels = ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
  const gradeValue = Math.max(0, gradeLevels.indexOf(grade));
  const gradeSliderLabel = gradeValue === 0 ? 'K' : `${gradeValue}`;
  const ageRanges = ['5-6', '6-7', '7-8', '8-9', '9-10', '10-11'];

  const goToHomePage = () => {
    setView('home');
    setStep('idle');
    setSpellResult('');
    stopListening();
  };

  const goToStoryPreview = () => {
    setView('home');
    setSpellResult('');
    stopListening();
  };

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
        keyIdea: journalImage,                 
        keyIdeaText: generatedJournal,
        illustration: imageUrl,                   
        rawAnswers: answers,
        grade: grade
      });
      setShowUploadModal(false); setCapturedImage(null); setView('home'); setStep('idle');
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };


  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8e7_0%,_#f5ebd7_42%,_#eadbc2_100%)] font-sans text-gray-800 p-4 md:p-6 flex flex-col items-center">
      <header className="w-full max-w-5xl flex justify-between items-center py-4 mb-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setStep('idle'); }}>
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 p-2.5 rounded-2xl shadow-lg shadow-orange-200">
            <BookOpen className="text-white" />
          </div>
          <div>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.35em] text-orange-700/70 font-bold">Voice Writing Studio</p>
            <h1 className="text-2xl font-black text-orange-950 tracking-tight">Journal Buddy</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isLocal && (
            <button 
              onClick={() => setIsMockMode(!isMockMode)}
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

                  <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white px-5 py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.28em] text-stone-500 font-black">Custom</p>
                        <p className="text-sm leading-6 text-stone-600">
                          Add a parent note if you want Journal Buddy to emphasize something beyond the grade-level default.
                        </p>
                        {customExpectation.trim() && (
                          <p className="text-sm leading-6 text-stone-900 font-semibold">
                            "{customExpectation.trim()}"
                          </p>
                        )}
                      </div>
                      <button
                        onClick={openCustomExpectationModal}
                        className="rounded-[1.25rem] bg-stone-900 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-sm hover:bg-stone-800"
                      >
                        {customExpectation.trim() ? 'Edit Custom' : 'Custom'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => setView('home')} className="flex-1 rounded-[1.75rem] bg-stone-100 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-stone-600 hover:bg-stone-200 transition-colors">
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

        {view === 'home' && (
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
                      Journal Buddy listens first, guides one question at a time, and turns everyday moments into a story kids can actually write down.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ['Listen', 'Voice-first prompts that feel like a patient buddy.'],
                      ['Guide', 'Simple 5W1H steps that keep kids moving.'],
                      ['Celebrate', 'A finished idea they can read, draw, and save.']
                    ].map(([title, copy]) => (
                      <div key={title} className="rounded-[1.6rem] border border-white/80 bg-white/70 p-4 shadow-[0_12px_30px_rgba(148,101,47,0.08)] backdrop-blur-sm">
                        <p className="text-sm font-black uppercase tracking-[0.18em] text-stone-900">{title}</p>
                        <p className="mt-2 text-sm leading-6 text-stone-600">{copy}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
                    <button
                      onClick={toggleListening}
                      className={`relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-white/60 transition-all duration-300 ${isListening ? 'bg-red-500 scale-105 shadow-[0_18px_40px_rgba(239,68,68,0.3)]' : 'bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] shadow-[0_18px_40px_rgba(29,78,216,0.25)] hover:scale-105'} `}
                      aria-label={isListening ? 'Stop listening' : 'Start listening'}
                    >
                      <Mic className="text-white w-8 h-8" />
                      {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
                    </button>
                    <div className="space-y-1">
                      <p className="text-base font-black uppercase tracking-[0.22em] text-stone-900">Tap to begin</p>
                      <p className="text-stone-600 text-base">Then say, “I want to write my journal.”</p>
                    </div>
                  </div>
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

                    <div className="mt-6 space-y-3">
                      {[
                        ['01', 'Talk it out', 'Speak naturally and let the app catch the moment.'],
                        ['02', 'Shape the idea', 'Prompt cards guide who, what, when, where, why, and how.'],
                        ['03', 'Write with confidence', 'Use the finished story and spelling help on paper.']
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
                    <p className="text-lg md:text-xl text-stone-600 font-medium leading-relaxed">{getStepQuestion(step)}</p>
                  </div>

                  <div className="rounded-[2rem] border border-white/80 bg-white/70 px-5 py-4 shadow-[0_18px_40px_rgba(148,101,47,0.08)] backdrop-blur-sm min-w-[220px]">
                    <p className="text-xs uppercase tracking-[0.3em] text-stone-500 font-bold">Current mode</p>
                    <p className="mt-2 text-2xl font-black text-stone-900">{isConfirming ? 'Confirming' : 'Listening for ideas'}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {isConfirming ? 'Check the answer before we move to the next prompt.' : 'Say the answer out loud, then we’ll help shape it.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-2">
                   {canGoToPreviousQuestion ? (
                     <button onClick={moveToPrevStep} className="p-2.5 bg-white/80 rounded-full hover:bg-white transition-colors shadow-sm ring-1 ring-stone-200"><ArrowLeft size={20}/></button>
                   ) : (
                     <div className="w-9" />
                   )}
                   <div className="flex gap-2 flex-1">
                    {['who', 'what', 'when', 'where', 'why', 'how'].map(s => (
                      <div key={s} className={`h-3 flex-1 rounded-full transition-all duration-500 ${step === s ? 'bg-blue-500 shadow-md' : answers[s] ? 'bg-green-400' : 'bg-gray-100'}`} />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={moveToPrevStep}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.18em] transition-all ${
                      canGoToPreviousQuestion
                        ? 'bg-white text-stone-800 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >
                    <ArrowLeft size={16} />
                    {canGoToPreviousQuestion ? 'Previous Question' : 'Back Home'}
                  </button>
                  <p className="text-sm font-semibold text-stone-500">
                    {canGoToPreviousQuestion
                      ? 'Need to fix something? Go back one question without losing the flow.'
                      : 'You are on the first question. Tap to leave this flow and return home.'}
                  </p>
                </div>
                
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-stretch">
                  <div className={`p-8 md:p-10 rounded-[2.5rem] min-h-[220px] flex items-center text-left text-3xl md:text-4xl font-bold italic border transition-all duration-300 shadow-[0_18px_40px_rgba(148,101,47,0.08)] ${isConfirming ? 'bg-[linear-gradient(180deg,_#fff4e8,_#fff8f1)] text-orange-900 border-orange-100' : 'bg-[linear-gradient(180deg,_#eef7ff,_#f5fbff)] text-sky-900 border-sky-100'}`}>
                    {userInput || (
                      <span className="not-italic text-xl md:text-2xl font-semibold text-stone-400">
                        {isListening ? (isMockMode ? "Mocking input..." : "Listening for your answer...") : 'Tap the microphone and answer in your own words.'}
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
                      {['Speak', 'Check', 'Next'].map((label, index) => (
                        <div key={label} className={`rounded-[1.25rem] px-3 py-4 text-center text-sm font-black uppercase tracking-[0.14em] ${index === 1 && isConfirming ? 'bg-orange-100 text-orange-900' : 'bg-stone-100 text-stone-500'}`}>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* {isConfirming ? (
                  <div className="space-y-6 flex flex-col items-center min-h-[300px] justify-center">
                    <div className="flex items-center gap-2 text-orange-500 font-black text-xl uppercase animate-pulse"><CheckCircle2 /> Confirm??</div>
                    <div className="bg-orange-50 p-8 rounded-[2rem] border-4 border-orange-100 text-3xl font-bold text-orange-800 italic w-full shadow-inner">"{answers[step]}"</div>
                  </div>
                ) : (
                  <div className="space-y-6 min-h-[300px] flex flex-col justify-center">
                    <h2 className="text-6xl font-black text-blue-600 capitalize tracking-tight">{step}?</h2>
                    <p className="text-2xl text-gray-500 font-bold px-4">{getStepQuestion(step)}</p>
                    <div className="bg-blue-50 p-8 rounded-[2rem] min-h-[120px] flex items-center justify-center text-3xl font-bold text-blue-800 italic border-4 border-blue-100 shadow-inner mx-4">
                      {userInput || (isListening ? (isMockMode ? "Mocking input..." : "Listening...") : "Click the microphone to speak")}
                    </div>
                  </div>
                )} */}

                <div className="mt-auto pb-4 flex flex-col items-center gap-4">
                  <button onClick={() => {stopListening(); startListening();}} className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative border border-white/70 ${isListening ? 'bg-red-500 scale-105 shadow-red-200' : 'bg-[linear-gradient(135deg,_#1d4ed8,_#0f766e)] hover:scale-105 active:scale-95 shadow-blue-200'}`}>
                    <Mic className="text-white w-8 h-8 md:w-9 md:h-9" />
                    {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
                  </button>
                  <p className="text-stone-500 font-black text-sm md:text-base uppercase tracking-[0.2em] h-6 text-center">
                    {isListening ? "I'm listening..." : (userInput ? "Tap to record again" : "Tap to speak")}
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
                  <button onClick={() => speakText(generatedJournal)} className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-md"><Volume2 className="text-orange-500 w-6 h-6" /></button>
                  <p className="text-2xl leading-relaxed font-bold text-gray-800 pr-10 text-left">{generatedJournal}</p>
                </div>
                <div className="rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-white bg-gray-50 min-h-[300px] flex items-center justify-center">
                  {isGeneratingImage ? (
                    <div className="flex flex-col items-center gap-4 text-gray-400 font-bold">
                       <RefreshCw className="animate-spin" size={48} />
                       <span>Painting... 🎨</span>
                    </div>
                  ) : imageUrl ? (
                    <img src={imageUrl} alt="Journal Illustration" className="w-full h-auto object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-300">
                      <ImageIcon size={100} strokeWidth={1} />
                      <span className="font-bold">No illustration available</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setStep('idle')} className="flex-1 py-5 bg-gray-100 rounded-2xl font-black text-gray-500">Restart</button>
                  <button onClick={() => setView('journaling')} className="flex-1 py-5 bg-green-500 text-white rounded-2xl font-black text-xl shadow-lg flex items-center justify-center gap-2">Start Writing <ChevronRight /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'journaling' && (
          <div className="flex-1 flex flex-col space-y-6 animate-in slide-in-from-bottom-6 h-full">
            {/* Header for writing view */}
            <div className="flex flex-col gap-4 px-2 flex-shrink-0 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-orange-400" size={24} />
                    <div>
                      <h2 className="text-2xl font-black text-gray-700">Writing Time</h2>
                      <p className="text-sm font-semibold text-gray-400">Keep the story handy while you write on paper.</p>
                    </div>
                </div>
                <button
                  onClick={goToStoryPreview}
                  className="min-w-0 rounded-[1.75rem] bg-white px-4 py-4 text-sm font-black uppercase tracking-[0.14em] text-stone-700 shadow-sm ring-1 ring-stone-200 transition-colors hover:bg-stone-50 flex items-center justify-center gap-2 self-start"
                >
                  <ArrowLeft size={16} />
                  Story Preview
                </button>
            </div>

            {/* Key Idea Area - Yellow Sticky Note Style */}
            <div className="bg-yellow-50 p-6 rounded-[2rem] border-2 border-yellow-200 shadow-sm relative flex-shrink-0">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-yellow-800 font-black uppercase tracking-widest">💡 Key Idea:</p>
                    <button onClick={() => speakText(generatedJournal)} className="p-2 bg-white rounded-full shadow-sm hover:scale-110 transition-transform">
                        <Volume2 className="text-orange-500 w-5 h-5" />
                    </button>
                </div>
                <p className="text-xl text-yellow-900 font-bold leading-relaxed pr-2 text-left">
                    {generatedJournal}
                </p>
            </div>

            {/* Illustration Area - Instead of Type Area */}
            <div className="flex-1 rounded-[2.5rem] overflow-hidden border-8 border-white shadow-lg bg-gray-50 flex items-center justify-center relative min-h-[280px]">
                <img src={imageUrl} alt="Journal Illustration" className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-1 rounded-full text-xs font-bold text-gray-500">
                    Drawing Idea
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="space-y-4 flex-shrink-0">
              {spellResult && (
                <div className="p-4 bg-green-500 text-white rounded-3xl shadow-xl animate-bounce font-black text-2xl text-center w-full">
                    {spellResult}
                </div>
              )}
              
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button onClick={handleSpellAssistPress} className={`min-w-0 px-4 py-4 rounded-[1.75rem] shadow-lg flex items-center justify-center gap-3 transition-all ${isListening ? 'bg-red-500 scale-[1.02]' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                    <Mic className="w-6 h-6 flex-shrink-0" />
                    <div className="text-left min-w-0">
                        <p className="font-black text-sm leading-none uppercase tracking-[0.12em]">How to spell</p>
                        <p className="text-[10px] opacity-70 truncate">Slow letter-by-letter help</p>
                    </div>
                </button>
                
                <button onClick={() => setShowUploadModal(true)} className="min-w-0 px-4 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-[1.75rem] font-black text-sm uppercase tracking-[0.14em] shadow-xl flex items-center justify-center gap-3">
                    <Award className="w-6 h-6 flex-shrink-0" /> All Finished
                </button>

                <button
                  onClick={goToHomePage}
                  className="min-w-0 rounded-[1.75rem] bg-stone-100 px-4 py-4 text-sm font-black uppercase tracking-[0.14em] text-stone-700 transition-colors hover:bg-stone-200 flex items-center justify-center gap-2"
                >
                  <BookOpen size={16} />
                  Home
                </button>
              </div>
            </div>
          </div>
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
                  <h3 className="text-3xl md:text-4xl font-black tracking-[-0.04em] text-stone-900">Tell Journal Buddy what to prioritize.</h3>
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

      <footer className="mt-10 text-center text-orange-300 font-bold">Built for {grade} Students • Step by Step Learning</footer>
    </div>
  );
};

export default App;
