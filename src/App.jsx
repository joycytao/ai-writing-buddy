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
const googleAIKey = "AIzaSyDL3Fa_sUpxwNPanNldg53Yr3GbGFh_O3Q"; // Paste your Google AI Studio Key here

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';


const App = () => {
  // --- 狀態管理 ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home'); 
  const [studentName, setStudentName] = useState(() => localStorage.getItem('journal_buddy_name') || ''); 
  const [grade, setGrade] = useState('Grade 1'); 
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
  const [cameraMode, setCameraMode] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [journalImage, setJournalImage] = useState(null);

  const recognitionRef = useRef(null);
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

  // --- AI 服務整合 ---
  const generateJournalContent = async (data) => {

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

    if (!googleAIKey) return;

    const prompt = `Write a simple sentences daily journal entry for a ${grade} student. 
    Details: who were/was with me: ${data.who} , What we do: ${data.what}, When: ${data.when}, Where: ${data.where}, Why: ${data.why}, How: ${data.how}.
    Language: Simple English for ${grade}. Keep words simple but evocative. Output only the journal text.`;

    console.log("Sending prompt to Google AI:", prompt);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleAIKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });



      if (!response.ok) throw new Error("API Error or Limit reached");

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Today was a fun day!";
      setGeneratedJournal(text);
      setStep('result');
      speakText(text);
      // await generateIllustration(text);
    } catch (error) {
      // setStep('idle');
      setStep('result');
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

  const speakText = async (text) => {
    // if (isMockMode) {
      console.log("[Mock TTS]:", text);
      return new Promise((resolve) => {
        const ut = new SpeechSynthesisUtterance(text);
        ut.lang = 'en-US';
        ut.rate = 0.9;
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
    const spelled = word.split('').join('-').toUpperCase();
    setSpellResult(`${word.toUpperCase()}: ${spelled}`);
    speakText(`${word} is spelled ${spelled}`);
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
      setView('home');
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
        illustration: imageUrl,                   
        rawAnswers: answers,
        grade: grade
      });
      setShowUploadModal(false); setCapturedImage(null); setView('home'); setStep('idle');
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };


  return (
    <div className="min-h-screen bg-amber-50 font-sans text-gray-800 p-4 flex flex-col items-center">
      <header className="w-full max-w-2xl flex justify-between items-center py-4 mb-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('home'); setStep('idle'); }}>
          <div className="bg-orange-500 p-2 rounded-xl shadow-lg">
            <BookOpen className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-orange-900 tracking-tight">Journal Buddy</h1>
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
          <button onClick={() => setView('setup')} className="p-2 bg-white/50 rounded-full"><Settings /></button>
        </div>
      </header>

      <main className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl p-6 md:p-10 relative overflow-hidden min-h-[550px] flex flex-col">
        
        {view === 'setup' && (
          <div className="space-y-8 animate-in fade-in zoom-in duration-300">
            <h2 className="text-2xl font-bold text-center">Parent Settings</h2>
            <div className="space-y-4">
              <p className="font-semibold text-gray-600">Student Grade:</p>
              <div className="grid grid-cols-2 gap-3">
                {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'].map(g => (
                  <button onClick={saveSettings} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black shadow-lg shadow-orange-100 transition-transform active:scale-95">Save & Back</button>
                ))}
              </div>
            </div>
            <button onClick={() => setView('home')} className="w-full bg-orange-500 text-white py-5 rounded-2xl font-black text-xl shadow-xl">Save Settings</button>
          </div>
        )}

        {view === 'home' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
            {step === 'idle' && (
              <div className="animate-in fade-in slide-in-from-top-4">
                <div className="w-40 h-40 bg-blue-100 rounded-full flex items-center justify-center mb-8 mx-auto animate-bounce text-8xl">🤖</div>
                <h2 className="text-3xl font-black text-gray-800 mb-4">Hey! Want to write?</h2>
                <p className="text-gray-500 text-lg mb-10 italic">Tap and say: "I want to write my journal"</p>
                <div className="flex justify-center">
                  <button onClick={toggleListening} className={`relative flex items-center justify-center w-32 h-32 rounded-full transition-all ${isListening ? 'bg-red-500 scale-110' : 'bg-blue-500 shadow-2xl hover:scale-105'}`}>
                    <Mic className="text-white w-14 h-14" />
                    {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
                  </button>
                </div>
              </div>
            )}

            {['who', 'what', 'when', 'where', 'why', 'how'].includes(step) && (
              <div className="w-full space-y-8 animate-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-4 mb-2">
                   {step !== 'who' ? (
                     <button onClick={moveToPrevStep} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><ArrowLeft size={20}/></button>
                   ) : (
                     <div className="w-9" />
                   )}
                   <div className="flex gap-2 flex-1">
                    {['who', 'what', 'when', 'where', 'why', 'how'].map(s => (
                      <div key={s} className={`h-3 flex-1 rounded-full transition-all duration-500 ${step === s ? 'bg-blue-500 shadow-md' : answers[s] ? 'bg-green-400' : 'bg-gray-100'}`} />
                    ))}
                  </div>
                </div>
                
                <div className="space-y-6 min-h-[250px] flex flex-col justify-center">
                  <div className="space-y-2">
                    {/* 1. Instead of "Confirm??", show the question */}
                    <h2 className="text-3xl font-black text-gray-800 capitalize tracking-tight">{step}?</h2>
                    <p className="text-2xl text-gray-400 font-bold px-4">{getStepQuestion(step)}</p>
                  </div>

                  {/* 2. Input box is blank when no content, styling changes on confirmation */}
                  <div className={`p-10 rounded-[2.5rem] min-h-[160px] flex items-center justify-center text-4xl font-bold italic border-4 transition-all duration-300 mx-4 ${isConfirming ? 'bg-orange-50 text-orange-800 border-orange-100' : 'bg-blue-50 text-blue-800 border-blue-100 shadow-inner'}`}>
                    {userInput || ""}
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
                  <button onClick={() => {stopListening(); startListening();}} className={`w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative ${isListening ? 'bg-red-500 scale-110 shadow-red-200' : 'bg-blue-500 hover:scale-105 active:scale-95 shadow-blue-200'}`}>
                    <Mic className="text-white w-14 h-14" />
                    {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>}
                  </button>
                    {/* <Mic className="text-white w-14 h-14" /> */}
                    {/* {isListening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75"></span>} */}
                  <p className="text-orange-400 font-black text-lg italic tracking-wide animate-pulse h-6 text-center">
                    {isListening ? "I'm listening..." : (userInput ? "" : "Click the microphone to speak")}
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
                  <p className="text-2xl leading-relaxed font-bold text-gray-800 pr-10">{generatedJournal}</p>
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
            <div className="flex justify-between items-center px-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-orange-400" size={24} />
                    <h2 className="text-2xl font-black text-gray-700">Writing Time</h2>
                </div>
                <button onClick={() => setView('home')} className="text-blue-500 font-black hover:underline">Exit</button>
            </div>

            {/* Key Idea Area - Yellow Sticky Note Style */}
            <div className="bg-yellow-50 p-6 rounded-[2rem] border-2 border-yellow-200 shadow-sm relative flex-shrink-0">
                <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-yellow-800 font-black uppercase tracking-widest">💡 Key Idea:</p>
                    <button onClick={() => speakText(generatedJournal)} className="p-2 bg-white rounded-full shadow-sm hover:scale-110 transition-transform">
                        <Volume2 className="text-orange-500 w-5 h-5" />
                    </button>
                </div>
                <p className="text-xl text-yellow-900 font-bold leading-relaxed pr-2">
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

            {/* Bottom Actions - Spell Checker & Finish */}
            <div className="space-y-4 flex-shrink-0">
              {spellResult && (
                <div className="p-4 bg-green-500 text-white rounded-3xl shadow-xl animate-bounce font-black text-2xl text-center w-full">
                    {spellResult}
                </div>
              )}
              
              <div className="flex gap-4 items-stretch">
                <button onClick={handleSpellAssistPress} className={`flex-1 min-w-0 px-4 py-5 rounded-[2rem] shadow-lg flex items-center justify-center gap-4 transition-all ${isListening ? 'bg-red-500 scale-105' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                    <Mic className="w-8 h-8" />
                    <div className="text-left">
                        <p className="font-black text-lg leading-none">Ask: "How to spell..."</p>
                        <p className="text-[10px] opacity-70">I'll spell words for your paper!</p>
                    </div>
                </button>
                
                <button onClick={() => setShowUploadModal(true)} className="flex-1 min-w-0 px-4 py-5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-[2rem] font-black text-xl shadow-xl flex items-center justify-center gap-4">
                    <Award className="w-8 h-8 flex-shrink-0" /> All Finished!
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

         <canvas ref={canvasRef} className="hidden" />

      </main>

      <footer className="mt-10 text-center text-orange-300 font-bold">Built for {grade} Students • Step by Step Learning</footer>
    </div>
  );
};

export default App;
