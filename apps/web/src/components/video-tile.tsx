'use client';

import { useEffect, useRef } from 'react';
import { Avatar } from '@/components/ui/avatar';

interface VideoTileProps {
  stream?: MediaStream | null;
  displayName: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isSelf?: boolean;
  isBot?: boolean;
}

export function VideoTile({
  stream,
  displayName,
  isMuted,
  isCameraOn,
  isSelf = false,
  isBot = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = isCameraOn && stream && stream.getVideoTracks().length > 0;

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border bg-gray-900">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Avatar name={displayName} size="lg" />
        </div>
      )}

      {/* Overlays */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1">
        <span className="text-xs font-medium text-white">
          {isSelf ? 'You' : displayName}
        </span>
        {isBot && (
          <span className="rounded bg-indigo-500 px-1 py-0.5 text-[9px] font-bold text-white">
            BOT
          </span>
        )}
      </div>

      {isMuted && (
        <div className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5">
          <svg
            className="h-3.5 w-3.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
