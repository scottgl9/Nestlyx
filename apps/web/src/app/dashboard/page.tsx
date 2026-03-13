'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  _count: { members: number; rooms: number };
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Workspace[]>('/workspaces').then((ws) => {
      setWorkspaces(ws);
      setLoading(false);
    });
  }, []);

  const createWorkspace = async () => {
    if (!newName.trim()) return;
    const ws = await api.post<Workspace>('/workspaces', { name: newName });
    setWorkspaces((prev) => [ws, ...prev]);
    setNewName('');
    setShowCreate(false);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-bold text-primary-700">Nestlyx</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workspaces</h2>
          <Button onClick={() => setShowCreate(true)}>New Workspace</Button>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : workspaces.length === 0 ? (
          <Card className="text-center text-gray-500">
            No workspaces yet. Create one to get started.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <Link key={ws.id} href={`/workspace/${ws.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <h3 className="font-semibold">{ws.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {ws._count?.members || 0} members &middot;{' '}
                    {ws._count?.rooms || 0} rooms
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <Dialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          title="Create Workspace"
        >
          <div className="space-y-4">
            <Input
              label="Workspace name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Workspace"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button onClick={createWorkspace}>Create</Button>
            </div>
          </div>
        </Dialog>
      </main>
    </div>
  );
}
