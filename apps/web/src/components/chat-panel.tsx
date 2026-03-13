'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useChat } from '@/hooks/use-chat';
import { useBotTyping } from '@/hooks/use-bot-typing';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar } from '@/components/ui/avatar';

interface ChatPanelProps {
  workspaceId: string;
  roomId?: string;
}

export function ChatPanel({ workspaceId, roomId }: ChatPanelProps) {
  const { messages, sendMessage } = useChat(workspaceId, roomId);
  const { isTyping } = useBotTyping(workspaceId, roomId);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          {roomId ? 'Room Chat' : 'Workspace Chat'}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-3 ${msg.senderId === currentUser?.id ? 'text-right' : ''}`}
          >
            <div className="flex items-start gap-2">
              {msg.senderId !== currentUser?.id && (
                <div className="relative">
                  <Avatar name={msg.senderName} size="sm" />
                  {msg.isBot && (
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-indigo-500 px-1 text-[8px] font-bold text-white">
                      BOT
                    </span>
                  )}
                </div>
              )}
              <div
                className={`inline-block max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.senderId === currentUser?.id
                    ? 'ml-auto bg-primary-600 text-white'
                    : msg.isBot
                      ? 'bg-indigo-50 text-gray-900 border border-indigo-100'
                      : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.senderId !== currentUser?.id && (
                  <p className="mb-0.5 text-xs font-medium text-gray-500">
                    {msg.senderName}
                    {msg.isBot && (
                      <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-600">
                        bot
                      </span>
                    )}
                  </p>
                )}
                <p>{msg.content}</p>
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
            <span className="flex gap-0.5">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
            </span>
            <span>Agent is typing</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
