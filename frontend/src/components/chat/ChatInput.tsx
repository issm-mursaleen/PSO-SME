'use client';

// Chat input bar — text + voice (records mic, transcribes via the backend).
// Lifted out of the page so the workspace stays focused on layout + state.

import { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Mic } from 'lucide-react';
import { transcribeAudio } from '@/lib/api';

export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setInput('');
  };

  const toggleVoice = async () => {
    if (listening) {
      recorderRef.current?.stop();
      setVoiceHint('Transcribing...');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceHint('Voice recording is not available in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onerror = () => {
        setListening(false);
        setVoiceHint('Recording failed. Please try again.');
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.onstop = async () => {
        setListening(false);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (blob.size < 500) { setVoiceHint('No audio captured. Tap mic and speak again.'); return; }
        try {
          const transcript = await transcribeAudio(blob);
          if (!transcript) { setVoiceHint('No speech detected. Try again.'); return; }
          setInput((cur) => `${cur.trim() ? cur.trim() + ' ' : ''}${transcript}`);
          setVoiceHint('Voice added to message.');
          window.setTimeout(() => setVoiceHint(''), 1800);
        } catch (error) {
          const m = error instanceof Error ? error.message : '';
          setVoiceHint(m.includes('503') || m.includes('OPENAI_API_KEY')
            ? 'Voice needs the backend API key configured.'
            : 'Could not transcribe audio. Check backend is running.');
        }
      };
      recorder.start();
      setListening(true);
      setVoiceHint('Recording... tap mic again to stop.');
    } catch (error) {
      setListening(false);
      const name = error instanceof DOMException ? error.name : '';
      setVoiceHint(name === 'NotAllowedError'
        ? 'Mic permission is blocked. Allow microphone access and try again.'
        : 'Could not start microphone recording.');
    }
  };

  return (
    <div className="absolute bottom-0 left-0 w-full px-6 pb-6 pt-12 bg-linear-to-t from-background via-background/95 to-transparent">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-center bg-card border border-outline-variant rounded-lg shadow-md overflow-hidden focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-foreground/10 transition-all">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Message Alara…  (e.g. “Riaz ne 2000 de diye”)"
            className="flex-1 bg-transparent px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center gap-1 pr-2">
            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? 'Stop recording' : 'Speak'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                listening ? 'bg-danger/10 text-danger animate-pulse' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Mic className="size-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Paperclip className="size-4" />
            </button>
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 active:scale-95 transition-all disabled:opacity-30"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
        <p className="text-center mt-2.5 text-[11px] text-muted-foreground/70">
          {voiceHint || 'Alara can make mistakes. Financial actions hamesha confirm karein.'}
        </p>
      </div>
    </div>
  );
}
