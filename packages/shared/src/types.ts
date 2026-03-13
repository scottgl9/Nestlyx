import {
  ParticipantRole,
  WorkspaceRole,
  RoomStatus,
  RecordingStatus,
  MeetingEventType,
} from './enums';

// ── User ──────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Workspace ─────────────────────────────────────────
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

// ── Room ──────────────────────────────────────────────
export interface Room {
  id: string;
  workspaceId: string;
  name: string;
  inviteCode: string;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ── Participant ───────────────────────────────────────
export interface Participant {
  id: string;
  roomId: string;
  userId: string;
  role: ParticipantRole;
  isMuted: boolean;
  joinedAt: Date;
  leftAt: Date | null;
}

// ── Chat ──────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  roomId: string | null;
  workspaceId: string;
  senderId: string;
  content: string;
  createdAt: Date;
}

// ── Recording ─────────────────────────────────────────
export interface Recording {
  id: string;
  roomId: string;
  userId: string;
  status: RecordingStatus;
  filePath: string | null;
  fileSize: number | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Meeting Event ─────────────────────────────────────
export interface MeetingEvent {
  id: string;
  roomId: string;
  type: MeetingEventType;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ── Signaling ─────────────────────────────────────────
export interface SignalPayload {
  roomId: string;
  targetUserId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface PeerInfo {
  userId: string;
  displayName: string;
  isMuted: boolean;
}
