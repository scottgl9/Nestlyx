'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useWebRTC } from '@/hooks/use-webrtc';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { ChatPanel } from '@/components/chat-panel';
import { RecordingControls } from '@/components/recording-controls';
import { AudioStream } from '@/components/audio-stream';

interface RoomData {
  id: string;
  name: string;
  workspaceId: string;
  status: string;
  inviteCode: string;
  participants: Array<{
    id: string;
    isMuted: boolean;
    user: { id: string; displayName: string };
  }>;
}

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [joined, setJoined] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const { peers, peerConnections, isMuted, joinRoom, leaveRoom, toggleMute } = useWebRTC(
    joined ? id : null,
  );

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
          <Button variant="danger" size="sm" onClick={handleLeave}>
            Leave
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Participants */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {/* Self */}
              <div className="flex flex-col items-center rounded-xl border bg-white p-4">
                <Avatar name={user?.displayName || 'You'} size="lg" />
                <p className="mt-2 text-sm font-medium">You</p>
                <p className="text-xs text-gray-500">
                  {isMuted ? 'Muted' : 'Unmuted'}
                </p>
              </div>

              {/* Peers */}
              {peers.map((peer) => (
                <div
                  key={peer.userId}
                  className="flex flex-col items-center rounded-xl border bg-white p-4"
                >
                  <Avatar name={peer.displayName} size="lg" />
                  <p className="mt-2 text-sm font-medium">{peer.displayName}</p>
                  <p className="text-xs text-gray-500">
                    {peer.isMuted ? 'Muted' : 'Unmuted'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 border-t bg-white px-6 py-4">
            <Button
              variant={isMuted ? 'danger' : 'secondary'}
              onClick={toggleMute}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
            <RecordingControls roomId={id} />
          </div>
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
