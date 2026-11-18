'use client';

import {
  Check,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_BY_SLUG } from '@/data/categories';
import { formatVndNumber, parseVietnameseExpenseText } from '@/lib/vietnameseParser';

interface VoiceRecorderSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmitTranscript: (text: string) => Promise<void>;
  isSubmitting: boolean;
}

const QUICK_VOICE_SAMPLES = [
  'Ăn phở bò 50k',
  'Đổ xăng 70 nghìn',
  'Sáng mua rau 35k với thịt bò 1 trăm rưỡi',
  'Nhận lương 12 triệu',
];

export function VoiceRecorderSheet({
  open,
  onClose,
  onSubmitTranscript,
  isSubmitting,
}: VoiceRecorderSheetProps) {
  const [status, setStatus] = useState<'listening' | 'paused' | 'unsupported'>('listening');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSpeakingNow, setIsSpeakingNow] = useState(false);
  const [voiceLevelPct, setVoiceLevelPct] = useState(0);
  const [autoSendCountdown, setAutoSendCountdown] = useState<number | null>(null);
  const [micErrorMsg, setMicErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<{
    stop?: () => void;
    abort?: () => void;
  } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetAmplitudeRef = useRef(0.12);
  const currentAmplitudeRef = useRef(0.12);
  const phaseRef = useRef(0);
  const mountedRef = useRef(true);
  const latestFullTextRef = useRef('');

  const fullTranscript = useMemo(
    () => `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, ' ').trim(),
    [finalTranscript, interimTranscript]
  );

  useEffect(() => {
    latestFullTextRef.current = fullTranscript;
  }, [fullTranscript]);

  // 0ms Instant On-Device Preview using our Vietnamese NLP engine
  const instantPreviewItems = useMemo(() => {
    if (!fullTranscript) return [];
    return parseVietnameseExpenseText(fullTranscript);
  }, [fullTranscript]);

  const stopAllAudioAndRecognition = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop?.();
        recognitionRef.current.abort?.();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const handleConfirmSend = useCallback(
    async (overrideText?: string) => {
      const textToSend = (overrideText ?? latestFullTextRef.current).trim();
      if (!textToSend || isSubmitting) return;
      stopAllAudioAndRecognition();
      onClose();
      await onSubmitTranscript(textToSend);
    },
    [isSubmitting, onClose, onSubmitTranscript, stopAllAudioAndRecognition]
  );

  // Start fluid 60fps canvas waveform loop + real microphone analyser
  const startWaveformAndAudio = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Initialize Microphone Analyser if available
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.72;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        }
      }
    } catch {
      // If user denied mic permission or OS mic unavailable, fallback smoothly to speech events wave
    }

    const freqData = new Uint8Array(128);

    const drawFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 320;
      const height = canvas.clientHeight || 110;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Compute real-time voice amplitude from AnalyserNode
      let measuredLevel = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqData);
        let sum = 0;
        // Focus on human voice frequencies (bins 2..48)
        for (let i = 2; i < 48; i++) {
          sum += freqData[i];
        }
        const avg = sum / 46;
        measuredLevel = Math.min(1, avg / 75);
        targetAmplitudeRef.current = 0.14 + measuredLevel * 0.95;

        const speaking = measuredLevel > 0.12;
        setIsSpeakingNow(speaking);
        setVoiceLevelPct(Math.round(measuredLevel * 100));
      } else {
        // Gentle idle breathing wave when mic analyser is unavailable
        targetAmplitudeRef.current = status === 'listening' ? 0.25 : 0.08;
      }

      // Smooth spring interpolation for silky organic motion
      currentAmplitudeRef.current +=
        (targetAmplitudeRef.current - currentAmplitudeRef.current) * 0.22;
      const amp = currentAmplitudeRef.current;
      phaseRef.current += 0.065 + amp * 0.09;

      const centerY = height / 2;
      const maxWaveH = height * 0.42;

      const layers = [
        {
          color: 'rgba(56, 189, 248, 0.45)',
          lineWidth: 2.5,
          freq: 1.8,
          phaseOffset: 0,
          scale: 0.72,
        },
        {
          color: 'rgba(139, 92, 246, 0.55)',
          lineWidth: 3,
          freq: 2.4,
          phaseOffset: 1.6,
          scale: 0.88,
        },
        {
          color: '#4F46E5',
          lineWidth: 3.5,
          freq: 2.0,
          phaseOffset: 3.1,
          scale: 1.0,
        },
      ];

      for (const layer of layers) {
        ctx.beginPath();
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
        gradient.addColorStop(0.25, '#2563EB');
        gradient.addColorStop(0.5, '#6366F1');
        gradient.addColorStop(0.75, '#9333EA');
        gradient.addColorStop(1, 'rgba(147, 51, 234, 0.2)');

        ctx.strokeStyle = layer.scale === 1 ? gradient : layer.color;
        ctx.lineWidth = layer.lineWidth;
        ctx.lineCap = 'round';

        const step = 4;
        for (let x = 0; x <= width; x += step) {
          const normX = x / width;
          // Hanning envelope tapers edges smoothly to zero
          const envelope = Math.sin(normX * Math.PI);
          const harmonic1 = Math.sin(
            normX * Math.PI * 2 * layer.freq + phaseRef.current + layer.phaseOffset
          );
          const harmonic2 =
            0.45 *
            Math.cos(
              normX * Math.PI * 3.7 - phaseRef.current * 1.3 + layer.phaseOffset
            );
          const y =
            centerY +
            (harmonic1 + harmonic2) * maxWaveH * amp * layer.scale * envelope;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [status]);

  // Start Web Speech API (vi-VN) with interimResults = true for 0ms real-time words
  const startSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setStatus('unsupported');
      setMicErrorMsg(
        'Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói tự động. Bạn hãy bấm câu mẫu bên dưới hoặc dùng Google Chrome / Safari.'
      );
      return;
    }

    try {
      const recognition = new (SpeechRec as new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        maxAlternatives: number;
        onresult: (event: {
          resultIndex: number;
          results: ArrayLike<{ isFinal?: boolean } & ArrayLike<{ transcript: string }>>;
        }) => void;
        onerror: (ev: { error?: string }) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
        abort: () => void;
      })();

      recognition.lang = 'vi-VN';
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognitionRef.current = recognition;
      setStatus('listening');
      setMicErrorMsg(null);

      let accumulatedFinal = '';

      recognition.onresult = (event) => {
        let liveInterim = '';
        let rebuiltFinal = accumulatedFinal;

        for (let i = event.resultIndex || 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            rebuiltFinal = `${rebuiltFinal} ${text}`.replace(/\s+/g, ' ').trim();
          } else {
            liveInterim = `${liveInterim} ${text}`.replace(/\s+/g, ' ').trim();
          }
        }

        accumulatedFinal = rebuiltFinal;
        setFinalTranscript(rebuiltFinal);
        setInterimTranscript(liveInterim);
        // Pulse wave immediately on speech token even if analyser is muted
        targetAmplitudeRef.current = Math.max(targetAmplitudeRef.current, 0.78);
        setIsSpeakingNow(true);
      };

      recognition.onerror = (ev) => {
        if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
          setStatus('paused');
          setMicErrorMsg(
            'Bạn chưa cấp quyền Micro cho trình duyệt. Hãy bật quyền Micro trên thanh địa chỉ hoặc chọn câu mẫu bên dưới.'
          );
        }
      };

      recognition.onend = () => {
        setStatus((prev) => (prev === 'listening' ? 'paused' : prev));
      };

      recognition.start();
    } catch {
      setStatus('paused');
      setMicErrorMsg('Không thể khởi động Micro tự động. Bạn có thể chạm vào micro để thử lại.');
    }
  }, []);

  // Lifecycle when sheet opens/closes
  useEffect(() => {
    mountedRef.current = true;
    if (!open) {
      stopAllAudioAndRecognition();
      return;
    }

    setFinalTranscript('');
    setInterimTranscript('');
    setAutoSendCountdown(null);
    setMicErrorMsg(null);
    setIsSpeakingNow(false);
    setVoiceLevelPct(0);

    startWaveformAndAudio();
    startSpeechRecognition();

    return () => {
      mountedRef.current = false;
      stopAllAudioAndRecognition();
    };
  }, [open, startSpeechRecognition, startWaveformAndAudio, stopAllAudioAndRecognition]);

  // Smart low-delay auto-submit countdown when user finishes speaking a valid amount
  useEffect(() => {
    if (!open || status !== 'listening' || instantPreviewItems.length === 0) {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setAutoSendCountdown(null);
      return;
    }

    // Reset 1.5s countdown whenever transcript changes
    let remainingMs = 1500;
    setAutoSendCountdown(remainingMs);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);

    silenceTimerRef.current = setInterval(() => {
      remainingMs -= 150;
      if (remainingMs <= 0) {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        handleConfirmSend();
      } else {
        setAutoSendCountdown(remainingMs);
      }
    }, 150);

    return () => {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [open, status, fullTranscript, instantPreviewItems.length, handleConfirmSend]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-indigo-200/80 bg-white p-5 pb-safe shadow-[0_-12px_50px_rgba(79,70,229,0.25)] dark:border-indigo-500/30 dark:bg-[#111829] sm:rounded-3xl sm:p-6">
        {/* Mobile Grabber Handle */}
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                isSpeakingNow
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                  : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white'
              }`}
            >
              {isSpeakingNow ? (
                <Volume2 className="h-4 w-4 animate-pulse" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Trợ lý Giọng nói Gemini AI
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    status === 'listening'
                      ? isSpeakingNow
                        ? 'animate-ping bg-emerald-500'
                        : 'bg-sky-500'
                      : 'bg-amber-500'
                  }`}
                />
                <span
                  className={
                    isSpeakingNow
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {status === 'listening'
                    ? isSpeakingNow
                      ? `Đang thu âm rõ nét (${voiceLevelPct}%)`
                      : 'Đang bật Mic · Mời bạn nói...'
                    : 'Đã tạm dừng nghe'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopAllAudioAndRecognition();
              onClose();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            title="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* FLUID 60FPS WAVEFORM CANVAS */}
        <div className="relative mt-4 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-b from-slate-50/90 to-indigo-50/50 p-3 dark:border-indigo-500/20 dark:from-[#0B1020] dark:to-[#131B2E]">
          <canvas
            ref={canvasRef}
            className="h-[104px] w-full"
            aria-label="Sóng âm thanh trực tiếp"
          />
          <div className="mt-1 flex items-center justify-between px-2 text-[10px] font-bold text-slate-400">
            <span>{isSpeakingNow ? 'Nhận thấy giọng nói' : 'Sẵn sàng thu âm tiếng Việt'}</span>
            {autoSendCountdown !== null && (
              <span className="text-indigo-600 dark:text-indigo-300">
                Tự động lưu sau {(autoSendCountdown / 1000).toFixed(1)}s...
              </span>
            )}
          </div>
        </div>

        {/* Error / Mic Hint */}
        {micErrorMsg && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
            {micErrorMsg}
          </div>
        )}

        {/* LIVE STREAMING TRANSCRIPT & 0ms PREVIEW */}
        <div className="mt-4 space-y-3">
          <div className="min-h-[68px] rounded-2xl border border-indigo-100 bg-slate-50/80 p-3.5 dark:border-indigo-500/20 dark:bg-[#0B0F19]">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
              Nội dung nhận diện trực tiếp:
            </div>
            {fullTranscript ? (
              <p className="text-base font-bold leading-snug text-slate-900 dark:text-white">
                {finalTranscript}{' '}
                {interimTranscript && (
                  <span className="text-indigo-500 dark:text-indigo-300">
                    {interimTranscript}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm font-medium italic text-slate-400">
                Ví dụ: &ldquo;Ăn trưa 45 nghìn với đổ xăng 70k&rdquo;...
              </p>
            )}
          </div>

          {/* 0ms Instant Preview Badges */}
          {instantPreviewItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-500/25 dark:bg-emerald-950/30">
              {instantPreviewItems.map((item, i) => {
                const cat = CATEGORY_BY_SLUG[item.categorySlug] || CATEGORY_BY_SLUG['khac'];
                return (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-xs font-extrabold text-slate-800 shadow-2xs dark:bg-slate-900 dark:text-slate-100"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{item.description}:</span>
                    <span
                      className={
                        item.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                      }
                    >
                      {formatVndNumber(item.amount)} ₫
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      ({cat.name})
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Controls (Large Mobile-Friendly Touch Targets) */}
        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (status === 'listening') {
                try {
                  recognitionRef.current?.stop?.();
                } catch {
                  // ignore
                }
                setStatus('paused');
              } else {
                startSpeechRecognition();
              }
            }}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border text-xs font-extrabold transition ${
              status === 'listening'
                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300'
                : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-300'
            }`}
          >
            {status === 'listening' ? (
              <>
                <MicOff className="h-4 w-4" />
                <span>Tạm dừng Mic</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                <span>Nói tiếp</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!fullTranscript || isSubmitting}
            onClick={() => handleConfirmSend()}
            className="flex h-12 flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-105 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span>Lưu ngay (0s chờ)</span>
          </button>
        </div>

        {/* Quick 1-Tap Simulation Samples (Great for silent testing or quick demos) */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 mb-2">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            <span>Hoặc chạm 1 lần để thử nhanh không cần nói:</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {QUICK_VOICE_SAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleConfirmSend(sample)}
                className="shrink-0 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200"
              >
                “{sample}”
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
