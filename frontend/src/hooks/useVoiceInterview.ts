"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const INTERVIEW_SECONDS = 30 * 60;

export function useVoiceInterview() {
  const [mediaReady, setMediaReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [timeLeft, setTimeLeft] = useState(INTERVIEW_SECONDS);
  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const answerStartRef = useRef<number>(0);
  const finalTranscriptRef = useRef("");
  const latestTranscriptRef = useRef("");
  const shouldListenRef = useRef(false);

  useEffect(() => {
    const SR = typeof window !== "undefined"
      && ((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
        || (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);
    setSpeechSupported(!!SR);
  }, []);

  const attachPreview = useCallback(async (video?: HTMLVideoElement | null) => {
    const el = video ?? videoRef.current;
    const stream = streamRef.current;
    if (!el || !stream) return false;

    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;

    try {
      await el.play();
      setPreviewReady(stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled));
      setCameraError(null);
      return true;
    } catch {
      setCameraError("Camera preview failed — check browser camera permission");
      setPreviewReady(false);
      return false;
    }
  }, []);

  const bindVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      void attachPreview(el);
    }
  }, [attachPreview]);

  const initMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported in this browser");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error("No camera detected");
    }
    videoTrack.enabled = true;

    streamRef.current = stream;
    await attachPreview();
    setMediaReady(true);
    setCameraError(null);
    return stream;
  }, [attachPreview]);

  const startRecording = useCallback((stream: MediaStream) => {
    chunksRef.current = [];
    const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(3000);
    recorderRef.current = recorder;
    setRecording(true);
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        setRecording(false);
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: "video/webm" }) : null);
        return;
      }
      rec.onstop = () => {
        setRecording(false);
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: "video/webm" }) : null);
      };
      rec.stop();
    });
  }, []);

  const stopMedia = useCallback(() => {
    shouldListenRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try { recognitionRef.current?.stop(); } catch { /* ok */ }
    recognitionRef.current = null;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    setIsSpeaking(false);
    setIsListening(false);
    setRecording(false);
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
      t.enabled = false;
    });
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setMediaReady(false);
    setPreviewReady(false);
    setCameraError(null);
  }, []);

  const pickZaraVoice = useCallback(() => {
    const voices = window.speechSynthesis?.getVoices() || [];
    return voices.find((v) => /Samantha|Karen|Zira|Female|Google UK English Female/i.test(v.name))
      || voices.find((v) => v.lang.startsWith("en") && !v.name.includes("Google"))
      || voices.find((v) => v.lang.startsWith("en"));
  }, []);

  const speakWithCaption = useCallback((
    text: string,
    onCaption: (visible: string) => void,
  ): Promise<void> => {
    return new Promise((resolve) => {
      shouldListenRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* ok */ }
      setIsListening(false);

      if (!window.speechSynthesis) {
        onCaption(text);
        setTimeout(() => { onCaption(""); resolve(); }, 400);
        return;
      }
      window.speechSynthesis.cancel();
      onCaption("");

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      utter.pitch = 1.1;
      const preferred = pickZaraVoice();
      if (preferred) utter.voice = preferred;

      let boundaryFired = false;
      let fallbackTimer: ReturnType<typeof setInterval> | null = null;

      const clearFallback = () => {
        if (fallbackTimer) {
          clearInterval(fallbackTimer);
          fallbackTimer = null;
        }
      };

      utter.onboundary = (e: SpeechSynthesisEvent) => {
        boundaryFired = true;
        clearFallback();
        const end = e.charIndex + (e.charLength || 0);
        onCaption(text.slice(0, end).trim());
      };

      utter.onstart = () => {
        setIsSpeaking(true);
        setTimeout(() => {
          if (boundaryFired || fallbackTimer) return;
          const tokens = text.match(/\S+\s*/g) || [text];
          let built = "";
          let idx = 0;
          fallbackTimer = setInterval(() => {
            if (idx >= tokens.length) {
              clearFallback();
              return;
            }
            built += tokens[idx++];
            onCaption(built.trim());
          }, 70);
        }, 280);
      };

      utter.onend = () => {
        clearFallback();
        setIsSpeaking(false);
        onCaption("");
        setTimeout(resolve, 350);
      };
      utter.onerror = () => {
        clearFallback();
        setIsSpeaking(false);
        onCaption("");
        resolve();
      };
      window.speechSynthesis.speak(utter);
    });
  }, [pickZaraVoice]);

  const speak = useCallback((text: string): Promise<void> => {
    return speakWithCaption(text, () => {});
  }, [speakWithCaption]);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSpeechError("Speech recognition not supported — type your answer below");
      return;
    }

    try { recognitionRef.current?.stop(); } catch { /* ok */ }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    finalTranscriptRef.current = "";
    latestTranscriptRef.current = "";
    setTranscript("");
    setSpeechError(null);
    shouldListenRef.current = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const part = e.results[i][0]?.transcript || "";
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += part + " ";
        } else {
          interim += part;
        }
      }
      const full = (finalTranscriptRef.current + interim).trim();
      latestTranscriptRef.current = full;
      setTranscript(full);
    };

    recognition.onerror = (e: { error: string }) => {
      if (e.error === "no-speech") {
        setSpeechError("No speech heard — keep speaking or type your answer");
        return;
      }
      if (e.error === "not-allowed") {
        setSpeechError("Microphone blocked for speech recognition");
        shouldListenRef.current = false;
        setIsListening(false);
        return;
      }
      if (e.error !== "aborted") {
        setSpeechError(`Mic error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
          setIsListening(true);
        } catch {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    answerStartRef.current = Date.now();

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setSpeechError("Could not start microphone — type your answer below");
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback((): Promise<{ text: string; durationSeconds: number }> => {
    return new Promise((resolve) => {
      shouldListenRef.current = false;
      const rec = recognitionRef.current;
      const duration = Math.round((Date.now() - answerStartRef.current) / 1000);
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        setIsListening(false);
        const text = latestTranscriptRef.current.trim()
          || finalTranscriptRef.current.trim();
        resolve({ text, durationSeconds: duration });
      };

      if (!rec) {
        finish();
        return;
      }

      rec.onend = () => setTimeout(finish, 100);

      try {
        rec.stop();
      } catch {
        finish();
        return;
      }

      setTimeout(finish, 1500);
    });
  }, []);

  const startTimer = useCallback((onExpire: () => void) => {
    setTimeLeft(INTERVIEW_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          onExpire();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  const setManualTranscript = useCallback((text: string) => {
    setTranscript(text);
    finalTranscriptRef.current = text;
    latestTranscriptRef.current = text;
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const load = () => window.speechSynthesis.getVoices();
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    return () => {
      shouldListenRef.current = false;
      try { recognitionRef.current?.stop(); } catch { /* ok */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      window.speechSynthesis?.cancel();
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return {
    videoRef, bindVideoRef, mediaReady, previewReady, cameraError,
    isListening, isSpeaking, transcript,
    setTranscript: setManualTranscript, timeLeft, formatTime, recording,
    speechSupported, speechError,
    initMedia, attachPreview, startRecording, stopRecording, stopMedia,
    speak, speakWithCaption, startListening, stopListening, startTimer,
  };
}
