'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface AgentAssignment {
  id: string;
  workspaceId: string;
  roomId: string | null;
  mentionOnly: boolean;
}

interface Agent {
  id: string;
  name: string;
  displayName: string;
  openclawAgent: string;
  isActive: boolean;
  assignments: AgentAssignment[];
}

interface AgentSettingsProps {
  workspaceId: string;
  rooms: Array<{ id: string; name: string }>;
}

export function AgentSettings({ workspaceId, rooms }: AgentSettingsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    try {
      const data = await api.get<Agent[]>('/openclaw/agents');
      setAgents(data);
    } catch {
      // Agent endpoint may not be available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleAssign = async (agentId: string, roomId?: string) => {
    await api.post(`/openclaw/agents/${agentId}/assign`, {
      workspaceId,
      roomId,
      mentionOnly: false,
    });
    loadAgents();
  };

  const handleUnassign = async (agentId: string, roomId?: string) => {
    await api.del(`/openclaw/agents/${agentId}/assign`, { workspaceId, roomId });
    loadAgents();
  };

  const isAssigned = (agent: Agent, roomId?: string) => {
    return agent.assignments.some(
      (a) => a.workspaceId === workspaceId && a.roomId === (roomId || null),
    );
  };

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading agents...</div>;

  if (agents.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        No agents configured. Create agents via the API to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">Agent Assignments</h3>

      {agents.map((agent) => (
        <div key={agent.id} className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="font-medium">{agent.displayName}</span>
              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-600">
                bot
              </span>
            </div>
            <span
              className={`text-xs ${agent.isActive ? 'text-green-600' : 'text-gray-400'}`}
            >
              {agent.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Workspace-wide assignment */}
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-gray-600">All rooms</span>
            {isAssigned(agent) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUnassign(agent.id)}
              >
                Remove
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAssign(agent.id)}
              >
                Assign
              </Button>
            )}
          </div>

          {/* Per-room assignments */}
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center justify-between border-t py-1 text-sm"
            >
              <span className="text-gray-600">{room.name}</span>
              {isAssigned(agent, room.id) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnassign(agent.id, room.id)}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAssign(agent.id, room.id)}
                >
                  Assign
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
