"use client";

import { useEffect, useRef } from "react";

/** Soft drifting starfield behind the hero. */
export function Starfield({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let t = 0;

    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      s: 0.4 + Math.random() * 1.4,
    }));

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      t += reduce ? 0 : 0.0022;
      ctx!.clearRect(0, 0, w, h);
      for (const star of stars) {
        const drift = (star.y + t * (0.04 + star.z * 0.08)) % 1;
        const x = star.x * w;
        const y = drift * h;
        const a = 0.25 + star.z * 0.55;
        ctx!.beginPath();
        ctx!.fillStyle = `rgba(220, 245, 248, ${a})`;
        ctx!.arc(x, y, star.s, 0, Math.PI * 2);
        ctx!.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
