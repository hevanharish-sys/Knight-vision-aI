"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

export type CameraHandle = {
  getVideo: () => HTMLVideoElement | null;
  captureDataUrl: (quality?: number) => string | null;
};

type CameraProps = {
  facingMode?: "user" | "environment";
  className?: string;
  onReady?: () => void;
  onError?: (message: string) => void;
  mirrored?: boolean;
};

async function getStream(facingMode: "user" | "environment") {
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: facingMode } } },
    {
      audio: false,
      video: {
        facingMode: {
          ideal: facingMode === "environment" ? "user" : "environment",
        },
      },
    },
    { audio: false, video: true },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Camera unavailable");
}

export const Camera = forwardRef<CameraHandle, CameraProps>(function Camera(
  {
    facingMode = "user",
    className = "",
    onReady,
    onError,
    mirrored = true,
  },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Starting camera…");

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useImperativeHandle(ref, () => ({
    getVideo: () => videoRef.current,
    captureDataUrl: (quality = 0.7) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;
      const canvas = document.createElement("canvas");
      const maxW = 960;
      const scale = Math.min(1, maxW / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      if (mirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    },
  }));

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setActive(false);
      setStatus("Starting camera…");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not supported in this browser.");
        }

        const stream = await getStream(facingMode);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");

        await video.play();

        await new Promise<void>((resolve) => {
          if (video.videoWidth > 0) {
            resolve();
            return;
          }
          video.onloadedmetadata = () => resolve();
          window.setTimeout(() => resolve(), 1200);
        });

        if (cancelled) return;
        setActive(true);
        setStatus("");
        onReadyRef.current?.();
      } catch {
        if (cancelled) return;
        setActive(false);
        setStatus("Camera blocked or unavailable");
        onErrorRef.current?.(
          "Camera permission denied or unavailable. Allow camera access and refresh."
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // Only restart when the camera facing mode changes — not when parent re-renders
  }, [facingMode]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#0A0A0A] ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 z-0 h-full w-full object-cover ${
          mirrored ? "scale-x-[-1]" : ""
        }`}
      />
      {!active ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#0A0A0A] text-sm text-white/85">
          {status || "Starting camera…"}
        </div>
      ) : null}
    </div>
  );
});
