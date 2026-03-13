'use client';

import { useState, useEffect } from 'react';
import { useWebSocket } from './use-websocket';
import { CHAT_NAMESPACE, AGENT_EVENTS } from '@nestlyx/shared';

export function useBotTyping(workspaceId: string, roomId?: string) {
  const [isTyping, setIsTyping] = useState(false);
  const { on } = useWebSocket(CHAT_NAMESPACE);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const unsub = on(AGENT_EVENTS.TYPING, () => {
      setIsTyping(true);
      clearTimeout(timer);
      // Clear typing indicator after 10 seconds if no message comes
      timer = setTimeout(() => setIsTyping(false), 10000);
    });

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [on]);

  // Clear typing when a new message arrives (handled by message arrival)
  useEffect(() => {
    // Reset typing state when messages change is handled by the timer
  }, []);

  return { isTyping };
}
