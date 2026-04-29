import { useCallback, useEffect, useRef } from 'react';

const useSpeechRecognitionLifecycle = ({
  isSpeaking,
  isMockMode,
  view,
  step,
  isConfirming,
  answers,
  setIsListening,
  setLastTranscript,
  setLastRecognitionState,
  onTranscript,
}) => {
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    setLastRecognitionState('Stopped listening.');
    setIsListening(false);

    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // no-op when recognition is already stopped
    }
  }, [setIsListening, setLastRecognitionState]);

  const startListening = useCallback(() => {
    if (isSpeaking) return;

    if (isMockMode && view !== 'journaling') {
      setLastRecognitionState('Mock listening started.');
      setIsListening(true);
      return;
    }

    try {
      setLastRecognitionState('Starting browser speech recognition.');
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (e) {
      // Avoid redundant errors if start is called multiple times.
      setLastRecognitionState('Could not start browser speech recognition.');
      setIsListening(false);
    }
  }, [isSpeaking, isMockMode, view, setIsListening, setLastRecognitionState]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      setLastTranscript(transcript);
      setLastRecognitionState('Transcript received.');
      onTranscriptRef.current?.(transcript);
      stopListening();
    };

    recognitionRef.current.onerror = (event) => {
      setLastRecognitionState(`Recognition error: ${event.error || 'unknown'}`);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setLastRecognitionState('Recognition ended.');
      setIsListening(false);
    };

    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }
      recognitionRef.current = null;
    };
  }, [setIsListening, setLastTranscript, setLastRecognitionState, stopListening]);

  return {
    startListening,
    stopListening,
  };
};

export default useSpeechRecognitionLifecycle;
