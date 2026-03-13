'use client';

import { useEffect, useRef } from 'react';

interface ScreenShareViewProps {
  stream: MediaStream;
  sharerName: string;
}

export function ScreenShareView({ stream, sharerName }: ScreenShareViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-contain"
      />
      <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-3 py-1.5">
        <span className="text-sm font-medium text-white">
          {sharerName} is sharing their screen
        </span>
      </div>
    </div>
  );
}
