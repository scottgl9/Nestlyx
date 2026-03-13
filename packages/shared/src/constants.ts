export const CHAT_NAMESPACE = '/chat';
export const SIGNALING_NAMESPACE = '/signaling';

export const CHAT_EVENTS = {
  SEND: 'chat:send',
  MESSAGE: 'chat:message',
  HISTORY: 'chat:history',
  HISTORY_RESPONSE: 'chat:history:response',
} as const;

export const SIGNAL_EVENTS = {
  JOIN_ROOM: 'signal:join-room',
  LEAVE_ROOM: 'signal:leave-room',
  OFFER: 'signal:offer',
  ANSWER: 'signal:answer',
  ICE_CANDIDATE: 'signal:ice-candidate',
  PEER_JOINED: 'signal:peer-joined',
  PEER_LEFT: 'signal:peer-left',
  MUTE_TOGGLE: 'signal:mute-toggle',
  MEDIA_STATE: 'signal:media-state',
  ROOM_PEERS: 'signal:room-peers',
} as const;

export const DEFAULT_CHAT_PAGE_SIZE = 50;
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const PEER_TIMEOUT_MS = 30_000;

export const AGENT_EVENTS = {
  TTS_READY: 'agent:tts-ready',
  TYPING: 'agent:typing',
} as const;
