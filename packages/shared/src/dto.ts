// ── Auth DTOs ─────────────────────────────────────────
export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

// ── Workspace DTOs ────────────────────────────────────
export interface CreateWorkspaceDto {
  name: string;
}

export interface AddWorkspaceMemberDto {
  email: string;
  role?: 'ADMIN' | 'MEMBER';
}

// ── Room DTOs ─────────────────────────────────────────
export interface CreateRoomDto {
  name: string;
}

// ── Chat DTOs ─────────────────────────────────────────
export interface SendChatMessageDto {
  roomId?: string;
  workspaceId: string;
  content: string;
}

export interface ChatHistoryQuery {
  roomId?: string;
  workspaceId: string;
  cursor?: string;
  limit?: number;
}

// ── Recording DTOs ────────────────────────────────────
export interface CreateRecordingDto {
  roomId: string;
}

// ── Agent DTOs ───────────────────────────────────────
export interface CreateAgentDto {
  name: string;
  displayName: string;
  openclawAgent: string;
  voiceEnabled?: boolean;
  ttsVoiceId?: string;
  systemPrompt?: string;
}

export interface AssignAgentDto {
  workspaceId: string;
  roomId?: string;
  mentionOnly?: boolean;
}
