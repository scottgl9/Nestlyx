import { PeerInfo } from './types';

// ── Chat Events ───────────────────────────────────────
export interface ChatSendEvent {
  workspaceId: string;
  roomId?: string;
  content: string;
}

export interface ChatMessageEvent {
  id: string;
  workspaceId: string;
  roomId: string | null;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  isBot?: boolean;
}

// ── Signaling Events ──────────────────────────────────
export interface SignalJoinRoomEvent {
  roomId: string;
}

export interface SignalOfferEvent {
  roomId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalAnswerEvent {
  roomId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalIceCandidateEvent {
  roomId: string;
  targetUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface SignalPeerJoinedEvent {
  roomId: string;
  peer: PeerInfo;
}

export interface SignalPeerLeftEvent {
  roomId: string;
  userId: string;
}

export interface SignalMuteToggleEvent {
  roomId: string;
  isMuted: boolean;
}

export interface SignalRoomPeersEvent {
  roomId: string;
  peers: PeerInfo[];
}
