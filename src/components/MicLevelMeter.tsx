"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
  onLevel?: (level: number) => void;
};

/**
 * Visual mic input meter. Helps catch wrong-device / silent Bluetooth mics.
 */
export function MicLevelMeter({ active, onLevel }: Props) {
  const [level, setLevel] = useState(0);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      setLevel(0);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setError("");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getAudioTracks()[0];
        setDeviceLabel(track?.label || "Microphone");

        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const next = Math.min(1, rms * 4.5);
          setLevel(next);
          onLevel?.(next);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setError("Mic blocked — allow microphone in the browser.");
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [active, onLevel]);

  const pct = Math.round(level * 100);
  const quiet = active && !error && pct < 4;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide text-white/55">
        <span>Mic level</span>
        <span className="normal-case tracking-normal text-white/70 truncate max-w-[60%]">
          {deviceLabel || "—"}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-75 ${
            pct > 12 ? "bg-[#7C3AED]" : pct > 4 ? "bg-[#DDD6FE]" : "bg-[#e4572e]"
          }`}
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-[#ffb4a2]">{error}</p>
      ) : quiet ? (
        <p className="mt-2 text-xs font-semibold text-[#ffb4a2]">
          Almost no sound detected. Your browser may be using the headset mic
          (Airdopes). Switch to the laptop microphone in the site mic settings,
          or tap the big buttons below instead of speaking.
        </p>
      ) : (
        <p className="mt-2 text-xs text-white/55">
          Speak when the bar moves. Or tap buttons — voice is optional.
        </p>
      )}
    </div>
  );
}
