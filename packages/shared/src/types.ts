import {
  ParticipantRole,
  WorkspaceRole,
  RoomStatus,
  RecordingStatus,
  TranscriptionStatus,
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

// ── Transcription ─────────────────────────────────────
export interface Transcription {
  id: string;
  recordingId: string;
  status: TranscriptionStatus;
  language: string | null;
  text: string | null;
  segments: TranscriptionSegment[] | null;
  model: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
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
  isCameraOn?: boolean;
  isScreenSharing?: boolean;
}

// ── Agent ────────────────────────────────────────────
export interface AgentConfig {
  id: string;
  name: string;
  displayName: string;
  userId: string;
  openclawAgent: string;
  voiceEnabled: boolean;
  isActive: boolean;
}
