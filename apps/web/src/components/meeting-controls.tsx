'use client';

import { Button } from '@/components/ui/button';
import { RecordingControls } from '@/components/recording-controls';

interface MeetingControlsProps {
  roomId: string;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  screenShareUserId: string | null;
  selfUserId?: string;
  peerConnections?: Map<string, { userId: string; displayName: string; stream?: MediaStream }>;
  localDisplayName?: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
}

export function MeetingControls({
  roomId,
  isMuted,
  isCameraOn,
  isScreenSharing,
  screenShareUserId,
  selfUserId,
  peerConnections,
  localDisplayName = 'You',
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onLeave,
}: MeetingControlsProps) {
  const otherUserSharing =
    screenShareUserId !== null &&
    screenShareUserId !== 'self' &&
    screenShareUserId !== selfUserId;

  return (
    <div className="flex items-center justify-center gap-3 border-t bg-white px-6 py-4">
      <Button
        variant={isMuted ? 'danger' : 'secondary'}
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? 'Unmute' : 'Mute'}
      </Button>

      <Button
        variant={isCameraOn ? 'primary' : 'secondary'}
        onClick={onToggleCamera}
        title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraOn ? 'Cam On' : 'Cam Off'}
      </Button>

      <Button
        variant={isScreenSharing ? 'primary' : 'secondary'}
        onClick={onToggleScreenShare}
        disabled={otherUserSharing}
        title={
          otherUserSharing
            ? 'Another user is sharing their screen'
            : isScreenSharing
              ? 'Stop sharing'
              : 'Share screen'
        }
      >
        {isScreenSharing ? 'Stop Share' : 'Share Screen'}
      </Button>

      <RecordingControls
        roomId={roomId}
        peerConnections={peerConnections}
        localDisplayName={localDisplayName}
      />

      <Button variant="danger" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}
