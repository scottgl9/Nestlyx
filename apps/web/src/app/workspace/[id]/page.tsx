'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { ChatPanel } from '@/components/chat-panel';

interface Room {
  id: string;
  name: string;
  status: string;
  inviteCode: string;
  _count: { participants: number };
}

interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  members: Array<{
    id: string;
    role: string;
    user: { id: string; email: string; displayName: string };
  }>;
}

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  useEffect(() => {
    api.get<WorkspaceData>(`/workspaces/${id}`).then(setWorkspace);
    api.get<Room[]>(`/workspaces/${id}/rooms`).then(setRooms);
  }, [id]);

  const createRoom = async () => {
    if (!newRoomName.trim()) return;
    const room = await api.post<Room>(`/workspaces/${id}/rooms`, {
      name: newRoomName,
    });
    setRooms((prev) => [room, ...prev]);
    setNewRoomName('');
    setShowCreate(false);
  };

  if (!workspace) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-white p-4">
        <Link
          href="/dashboard"
          className="mb-4 block text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to dashboard
        </Link>
        <h2 className="mb-4 text-lg font-bold">{workspace.name}</h2>

        <div className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">
            Members ({workspace.members.length})
          </h3>
          <div className="space-y-2">
            {workspace.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Avatar name={m.user.displayName} size="sm" />
                <div>
                  <p className="text-sm font-medium">{m.user.displayName}</p>
                  <p className="text-xs text-gray-500">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Rooms</h1>
            <Button onClick={() => setShowCreate(true)}>New Room</Button>
          </div>
        </header>

        <div className="flex flex-1">
          <main className="flex-1 p-6">
            {rooms.length === 0 ? (
              <Card className="text-center text-gray-500">
                No rooms yet. Create one to start a meeting.
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {rooms.map((room) => (
                  <Link key={room.id} href={`/room/${room.id}`}>
                    <Card className="cursor-pointer transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{room.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            room.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700'
                              : room.status === 'ENDED'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {room.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {room._count?.participants || 0} participants
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </main>

          {/* Workspace chat */}
          <div className="w-80 border-l">
            <ChatPanel workspaceId={id} />
          </div>
        </div>

        <Dialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title="Create Room"
        >
          <div className="space-y-4">
            <Input
              label="Room name"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Weekly standup"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button onClick={createRoom}>Create</Button>
            </div>
          </div>
        </Dialog>
      </div>
    </div>
  );
}
