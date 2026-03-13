'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { isAuthenticated } = useAuth(false);
  const [room, setRoom] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/rooms/invite/${code}`)
      .then(setRoom)
      .catch(() => setError('Invalid invite link'));
  }, [code]);

  const handleJoin = () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/invite/${code}`);
      return;
    }
    if (room) {
      router.push(`/room/${room.id}`);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="text-center">
          <p className="text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="text-center">
        <h1 className="mb-2 text-xl font-bold">Join Room</h1>
        <p className="mb-4 text-gray-600">{room.name}</p>
        <Button onClick={handleJoin}>
          {isAuthenticated ? 'Join Room' : 'Sign in to join'}
        </Button>
      </Card>
    </div>
  );
}
