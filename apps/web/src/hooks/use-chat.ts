'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './use-websocket';
import { CHAT_NAMESPACE, CHAT_EVENTS } from '@nestlyx/shared';
import type { ChatMessageEvent } from '@nestlyx/shared';

export function useChat(workspaceId: string, roomId?: string) {
  const [messages, setMessages] = useState<ChatMessageEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const { emit, on } = useWebSocket(CHAT_NAMESPACE);

  useEffect(() => {
    // Join room/workspace for receiving messages
    emit('join', { workspaceId, roomId });

    // Load initial history
    emit(CHAT_EVENTS.HISTORY, { workspaceId, roomId });
  }, [workspaceId, roomId, emit]);

  useEffect(() => {
    const unsubMessage = on(CHAT_EVENTS.MESSAGE, (msg: ChatMessageEvent) => {
      setMessages((prev) => [...prev, msg]);
    });

    const unsubHistory = on(CHAT_EVENTS.HISTORY_RESPONSE, (data: any) => {
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const newMsgs = data.messages.filter((m: any) => !existing.has(m.id));
        return [...newMsgs, ...prev];
      });
      setHasMore(data.hasMore);
    });

    return () => {
      unsubMessage();
      unsubHistory();
    };
  }, [on]);

  const sendMessage = useCallback(
    (content: string) => {
      emit(CHAT_EVENTS.SEND, { workspaceId, roomId, content });
    },
    [workspaceId, roomId, emit],
  );

  return { messages, sendMessage, hasMore };
}
