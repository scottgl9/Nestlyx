'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useWebRTC } from '@/hooks/use-webrtc';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { ChatPanel } from '@/components/chat-panel';
import { AudioStream } from '@/components/audio-stream';
import { VideoTile } from '@/components/video-tile';
import { ScreenShareView } from '@/components/screen-share-view';
import { MeetingControls } from '@/components/meeting-controls';

interface RoomData {
  id: string;
  name: string;
  workspaceId: string;
  status: string;
  inviteCode: string;
  participants: Array<{
    id: string;
    isMuted: boolean;
    user: { id: string; displayName: string; isBot?: boolean };
  }>;
}

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [joined, setJoined] = useState(false);
  const [showChat, setShowChat] = useState(true);

  const {
    peers,
    peerConnections,
    isMuted,
    isCameraOn,
    isScreenSharing,
    localVideoStream,
    localScreenStream,
    screenShareUserId,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  } = useWebRTC(joined ? id : null);

  useEffect(() => {
    api.get<RoomData>(`/rooms/${id}`).then(setRoom);
  }, [id]);

  const handleJoin = async () => {
    await api.post(`/rooms/${id}/join`);
    await joinRoom();
    setJoined(true);
  };

  const handleLeave = async () => {
    leaveRoom();
    await api.post(`/rooms/${id}/leave`);
    setJoined(false);
    router.push('/dashboard');
  };

  if (!room) return <div className="p-8 text-gray-500">Loading...</div>;

  if (!joined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold">{room.name}</h1>
          <p className="mb-6 text-gray-500">
            {room.participants.length} participant(s) in room
          </p>
          <Button size="lg" onClick={handleJoin}>
            Join Room
          </Button>
        </div>
      </div>
    );
  }

  // Find screen share stream
  const hasScreenShare = screenShareUserId !== null;
  let screenStream: MediaStream | undefined;
  let screenSharerName = '';

  if (screenShareUserId === 'self') {
    screenStream = localScreenStream ?? undefined;
    screenSharerName = 'You';
  } else if (screenShareUserId) {
    const sharerPeer = peerConnections.get(screenShareUserId);
    screenStream = sharerPeer?.screenStream;
    const sharerInfo = peers.find((p) => p.userId === screenShareUserId);
    screenSharerName = sharerInfo?.displayName ?? screenShareUserId;
  }

  // Determine grid columns based on participant count
  const totalParticipants = peers.length + 1;
  const gridCols =
    totalParticipants <= 1
      ? 'grid-cols-1'
      : totalParticipants <= 4
        ? 'grid-cols-2'
        : totalParticipants <= 9
          ? 'grid-cols-2 sm:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div>
          <h1 className="font-semibold">{room.name}</h1>
          <p className="text-xs text-gray-500">
            Invite code: {room.inviteCode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChat(!showChat)}
          >
            {showChat ? 'Hide Chat' : 'Show Chat'}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-auto p-4">
            {hasScreenShare && screenStream ? (
              /* Presentation layout */
              <div className="flex h-full gap-4">
                <div className="flex-[3]">
                  <ScreenShareView
                    stream={screenStream}
                    sharerName={screenSharerName}
                  />
                </div>
                <div className="flex flex-[1] flex-col gap-3 overflow-auto">
                  {/* Self tile */}
                  <VideoTile
                    stream={localVideoStream}
                    displayName={user?.displayName || 'You'}
                    isMuted={isMuted}
                    isCameraOn={isCameraOn}
                    isSelf
                  />
                  {/* Peer tiles */}
                  {peers.map((peer) => {
                    const pc = peerConnections.get(peer.userId);
                    return (
                      <VideoTile
                        key={peer.userId}
                        stream={pc?.videoStream}
                        displayName={peer.displayName}
                        isMuted={peer.isMuted}
                        isCameraOn={peer.isCameraOn ?? false}
                        isBot={(peer as any).isBot}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Grid layout */
              <div className={`grid ${gridCols} gap-4`}>
                {/* Self tile */}
                <VideoTile
                  stream={localVideoStream}
                  displayName={user?.displayName || 'You'}
                  isMuted={isMuted}
                  isCameraOn={isCameraOn}
                  isSelf
                />
                {/* Peer tiles */}
                {peers.map((peer) => {
                  const pc = peerConnections.get(peer.userId);
                  return (
                    <VideoTile
                      key={peer.userId}
                      stream={pc?.videoStream}
                      displayName={peer.displayName}
                      isMuted={peer.isMuted}
                      isCameraOn={peer.isCameraOn ?? false}
                      isBot={(peer as any).isBot}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Controls */}
          <MeetingControls
            roomId={id}
            isMuted={isMuted}
            isCameraOn={isCameraOn}
            isScreenSharing={isScreenSharing}
            screenShareUserId={screenShareUserId}
            selfUserId={user?.id}
            peerConnections={peerConnections}
            localDisplayName={user?.displayName || 'You'}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={toggleScreenShare}
            onLeave={handleLeave}
          />
        </main>

        {/* Chat sidebar */}
        {showChat && (
          <div className="w-80 border-l">
            <ChatPanel workspaceId={room.workspaceId} roomId={id} />
          </div>
        )}
      </div>

      {/* Remote audio streams */}
      {Array.from(peerConnections.entries()).map(([userId, peer]) =>
        peer.stream ? <AudioStream key={userId} stream={peer.stream} /> : null,
      )}
    </div>
  );
}
