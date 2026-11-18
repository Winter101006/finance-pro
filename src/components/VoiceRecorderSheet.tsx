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
import type { TransactionType } from '@/types/finance';

interface VoiceRecorderSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmitTranscript: (
    text: string,
    forcedType?: 'auto' | TransactionType
  ) => Promise<void>;
  isSubmitting: boolean;
}

const QUICK_VOICE_SAMPLES = [
  'Mẹ cho 75k',
  'Ăn phở bò 50k',
  'Đổ xăng 70 nghìn',
  'Sáng mua rau 35k với thịt bò 1 trăm rưỡi',
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
  const [forcedType, setForcedType] = useState<'auto' | TransactionType>('auto');
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

  // Physics state for true static-when-silent -> volume-proportional motion
  const targetAmplitudeRef = useRef(0);
  const currentAmplitudeRef = useRef(0);
  const fallbackPulseRef = useRef(0);
  const phaseRef = useRef(0);
  const mountedRef = useRef(true);
  const latestFullTextRef = useRef('');
  const latestForcedTypeRef = useRef<'auto' | TransactionType>('auto');

  const fullTranscript = useMemo(
    () => `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, ' ').trim(),
    [finalTranscript, interimTranscript]
  );

  useEffect(() => {
    latestFullTextRef.current = fullTranscript;
  }, [fullTranscript]);

  useEffect(() => {
    latestForcedTypeRef.current = forcedType;
  }, [forcedType]);

  // 0ms Instant On-Device Preview
  const instantPreviewItems = useMemo(() => {
    if (!fullTranscript) return [];
    return parseVietnameseExpenseText(fullTranscript, undefined, forcedType);
  }, [fullTranscript, forcedType]);

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
    targetAmplitudeRef.current = 0;
    currentAmplitudeRef.current = 0;
    fallbackPulseRef.current = 0;
  }, []);

  const handleConfirmSend = useCallback(
    async (overrideText?: string) => {
      const textToSend = (overrideText ?? latestFullTextRef.current).trim();
      const chosenType = latestForcedTypeRef.current;
      if (!textToSend || isSubmitting) return;
      stopAllAudioAndRecognition();
      onClose();
      await onSubmitTranscript(textToSend, chosenType);
    },
    [isSubmitting, onClose, onSubmitTranscript, stopAllAudioAndRecognition]
  );

  // Start fluid 60fps canvas waveform loop: STRICTLY STILL/FLAT when silent, scales dynamically with speech volume
  const startWaveformAndAudio = useCallback(async () => {
    if (typeof window === 'undefined') return;

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
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.65;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        }
      }
    } catch {
      // If browser blocks direct mic stream, keep line static unless speech tokens arrive
    }

    const timeData = new Uint8Array(512);
    let ambientNoiseFloor = 0.014;
    let calibratedFrames = 0;
    let lastUiUpdateMs = 0;

    const drawFrame = (nowMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth || 320;
      const height = canvas.clientHeight || 104;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Measure real acoustic PCM RMS when microphone stream is active
      if (analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const sample = (timeData[i] - 128) / 128;
          sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / timeData.length);

        // Adaptive noise floor over initial ~18 silent frames, only drifting down or slightly when quiet
        if (calibratedFrames < 18) {
          ambientNoiseFloor = ambientNoiseFloor * 0.8 + rms * 0.2;
          calibratedFrames++;
        } else if (rms < ambientNoiseFloor * 1.15) {
          ambientNoiseFloor = ambientNoiseFloor * 0.96 + rms * 0.04;
        }

        const noiseGate = Math.max(0.018, ambientNoiseFloor * 1.55);

        if (rms <= noiseGate) {
          // SILENCE: strict 0 amplitude -> static flat line
          targetAmplitudeRef.current = 0;
          if (nowMs - lastUiUpdateMs > 120) {
            setIsSpeakingNow(false);
            setVoiceLevelPct(0);
            lastUiUpdateMs = nowMs;
          }
        } else {
          // SPEAKING: soft voice -> small ripple; loud voice -> big wave!
          const excess = Math.min(1, (rms - noiseGate) / 0.12);
          const scaled = Math.pow(excess, 0.78);
          targetAmplitudeRef.current = Math.min(1, 0.1 + scaled * 0.9);
          if (nowMs - lastUiUpdateMs > 90) {
            setIsSpeakingNow(true);
            setVoiceLevelPct(Math.max(8, Math.min(100, Math.round(targetAmplitudeRef.current * 100))));
            lastUiUpdateMs = nowMs;
          }
        }
      } else {
        // Without analyser stream: stay STRICTLY FLAT (0) unless SpeechRecognition emitted live words
        targetAmplitudeRef.current = fallbackPulseRef.current;
        fallbackPulseRef.current *= 0.88;
        if (fallbackPulseRef.current < 0.01) {
          fallbackPulseRef.current = 0;
          if (nowMs - lastUiUpdateMs > 150) {
            setIsSpeakingNow(false);
            setVoiceLevelPct(0);
            lastUiUpdateMs = nowMs;
          }
        }
      }

      // Asymmetric spring interpolation: fast attack when speaking, clean settle back to 0 when silent
      const target = targetAmplitudeRef.current;
      const rate = target > currentAmplitudeRef.current ? 0.36 : 0.18;
      currentAmplitudeRef.current += (target - currentAmplitudeRef.current) * rate;
      if (target === 0 && currentAmplitudeRef.current < 0.006) {
        currentAmplitudeRef.current = 0;
      }

      const amp = currentAmplitudeRef.current;
      const centerY = height / 2;

      if (amp <= 0.001) {
        // STATIC MODE (Chế độ tĩnh hoàn toàn khi không nói)
        const staticGrad = ctx.createLinearGradient(0, 0, width, 0);
        staticGrad.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
        staticGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.5)');
        staticGrad.addColorStop(1, 'rgba(99, 102, 241, 0.12)');
        ctx.beginPath();
        ctx.moveTo(12, centerY);
        ctx.lineTo(width - 12, centerY);
        ctx.strokeStyle = staticGrad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        // ACTIVE SPEAKING WAVEFORM (Rung động tỷ lệ đúng theo độ to nhỏ giọng nói)
        phaseRef.current += 0.055 + amp * 0.13;
        const maxWaveH = height * 0.43;

        const layers = [
          {
            color: 'rgba(56, 189, 248, 0.45)',
            lineWidth: 2.2,
            freq: 2.0,
            phaseOffset: 0,
            scale: 0.65,
          },
          {
            color: 'rgba(139, 92, 246, 0.55)',
            lineWidth: 2.8,
            freq: 2.6,
            phaseOffset: 1.5,
            scale: 0.85,
          },
          {
            color: 'gradient',
            lineWidth: 3.4,
            freq: 2.2,
            phaseOffset: 3.0,
            scale: 1.0,
          },
        ];

        for (const layer of layers) {
          ctx.beginPath();
          if (layer.color === 'gradient') {
            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, 'rgba(37, 99, 235, 0.18)');
            gradient.addColorStop(0.25, '#2563EB');
            gradient.addColorStop(0.5, '#6366F1');
            gradient.addColorStop(0.75, '#9333EA');
            gradient.addColorStop(1, 'rgba(147, 51, 234, 0.18)');
            ctx.strokeStyle = gradient;
          } else {
            ctx.strokeStyle = layer.color;
          }

          ctx.lineWidth = layer.lineWidth;
          ctx.lineCap = 'round';

          const step = 3;
          for (let x = 0; x <= width; x += step) {
            const normX = x / width;
            const envelope = Math.pow(Math.sin(normX * Math.PI), 1.2);
            const harmonic1 = Math.sin(
              normX * Math.PI * 2 * layer.freq + phaseRef.current + layer.phaseOffset
            );
            const harmonic2 =
              0.42 *
              Math.cos(
                normX * Math.PI * 3.8 - phaseRef.current * 1.25 + layer.phaseOffset
              );
            const y =
              centerY +
              (harmonic1 + harmonic2) * maxWaveH * amp * layer.scale * envelope;

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  // Start Web Speech API (vi-VN) with interimResults = true
  const startSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setStatus('unsupported');
      setMicErrorMsg(
        'Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói tự động. Bạn hãy bấm câu mẫu bên dưới hoặc dùng ô nhắn tin nhanh.'
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
        // If no direct WebAudio stream, trigger transient speech pulse ONLY during actual recognized words
        if (!analyserRef.current) {
          fallbackPulseRef.current = 0.65;
          setIsSpeakingNow(true);
          setVoiceLevelPct(55);
        }
      };

      recognition.onerror = (ev) => {
        if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
          setStatus('paused');
          setMicErrorMsg(
            'Bạn chưa cấp quyền Micro cho trình duyệt. Hãy bật Micro trên thanh địa chỉ hoặc dùng ô nhắn tin nhanh.'
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

  useEffect(() => {
    mountedRef.current = true;
    if (!open) {
      stopAllAudioAndRecognition();
      return;
    }

    setFinalTranscript('');
    setInterimTranscript('');
    setForcedType('auto');
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

  // Auto-submit countdown after user stops speaking a valid transaction
  useEffect(() => {
    if (!open || status !== 'listening' || instantPreviewItems.length === 0) {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      setAutoSendCountdown(null);
      return;
    }

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

  const loudnessLabel =
    voiceLevelPct === 0
      ? 'Yên tĩnh (Sóng đang đứng yên)'
      : voiceLevelPct < 35
      ? `Nói nhỏ (${voiceLevelPct}%)`
      : voiceLevelPct < 70
      ? `Nói vừa rõ (${voiceLevelPct}%)`
      : `Nói to rõ nét (${voiceLevelPct}%)`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-indigo-200/80 bg-white p-5 pb-safe shadow-[0_-12px_50px_rgba(79,70,229,0.25)] dark:border-indigo-500/30 dark:bg-[#111829] sm:rounded-3xl sm:p-6">
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
                Trợ lý Giọng nói Thông minh
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    status === 'listening'
                      ? isSpeakingNow
                        ? 'animate-ping bg-emerald-500'
                        : 'bg-slate-400'
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
                  {status === 'listening' ? loudnessLabel : 'Đã tạm dừng nghe'}
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

        {/* FLUID WAVEFORM CANVAS (FLAT LINE WHEN SILENT, DYNAMIC AMPLITUDE WHEN SPEAKING) */}
        <div className="relative mt-4 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-b from-slate-50/90 to-indigo-50/40 p-3 dark:border-indigo-500/20 dark:from-[#0B1020] dark:to-[#131B2E]">
          <canvas
            ref={canvasRef}
            className="h-[100px] w-full"
            aria-label="Sóng âm thanh trực tiếp"
          />
          <div className="mt-1 flex items-center justify-between px-2 text-[10px] font-bold text-slate-400">
            <span>{isSpeakingNow ? 'Đang rung theo giọng bạn' : 'Chế độ tĩnh · Mời bạn nói'}</span>
            {autoSendCountdown !== null && (
              <span className="text-indigo-600 dark:text-indigo-300">
                Tự lưu sau {(autoSendCountdown / 1000).toFixed(1)}s...
              </span>
            )}
          </div>
        </div>

        {/* Explicit Income / Expense Toggle for Voice */}
        <div className="mt-3 grid grid-cols-3 rounded-2xl border border-indigo-100 bg-slate-100/90 p-1 dark:border-indigo-500/20 dark:bg-slate-900">
          {(
            [
              { id: 'auto', label: 'Tự động AI', activeClass: 'bg-indigo-600 text-white' },
              { id: 'expense', label: '− Chi tiêu', activeClass: 'bg-rose-600 text-white' },
              { id: 'income', label: '+ Thu nhập', activeClass: 'bg-emerald-600 text-white' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setForcedType(opt.id)}
              className={`h-8 rounded-xl text-[11px] font-extrabold transition ${
                forcedType === opt.id
                  ? `${opt.activeClass} shadow-xs`
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {micErrorMsg && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
            {micErrorMsg}
          </div>
        )}

        {/* LIVE STREAMING TRANSCRIPT & 0ms PREVIEW */}
        <div className="mt-3 space-y-2.5">
          <div className="min-h-[60px] rounded-2xl border border-indigo-100 bg-slate-50/80 p-3 dark:border-indigo-500/20 dark:bg-[#0B0F19]">
            <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Nội dung nghe được:
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
                Ví dụ: &ldquo;Mẹ cho 75k&rdquo;, &ldquo;Ăn trưa 45 nghìn&rdquo;...
              </p>
            )}
          </div>

          {instantPreviewItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-2.5 dark:border-indigo-500/25 dark:bg-indigo-950/30">
              {instantPreviewItems.map((item, i) => {
                const cat = CATEGORY_BY_SLUG[item.categorySlug] || CATEGORY_BY_SLUG['khac'];
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-extrabold shadow-2xs ${
                      item.type === 'income'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-200'
                        : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/60 dark:text-rose-200'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{item.description}:</span>
                    <span className="font-mono">
                      {item.type === 'income' ? '+' : '−'}
                      {formatVndNumber(item.amount)} ₫
                    </span>
                    <span className="text-[10px] opacity-75">({cat.name})</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Controls */}
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
            <span>Lưu ngay</span>
          </button>
        </div>

        {/* Quick 1-Tap Simulation Samples */}
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            <span>Hoặc chạm 1 lần để thử nhanh:</span>
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
