"use client";

/**
 * VoiceInput — Speech-to-text button using Web Speech API.
 * Falls back gracefully if browser doesn't support it.
 */

import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
  }, []);

  const toggle = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onTranscript(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onTranscript]);

  if (!supported) return null;

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      className={`rounded-md p-1.5 transition-colors ${
        listening
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
      } disabled:opacity-30`}
      title={listening ? "Stop recording" : "Voice input"}
    >
      {listening ? (
        // Recording indicator (pulsing)
        <div className="relative">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="2" width="6" height="8" rx="3" fill="currentColor" />
            <path d="M3 8a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <div className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-red-500" />
        </div>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="2" width="6" height="8" rx="3" stroke="currentColor" strokeWidth="1.25" />
          <path d="M3 8a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
