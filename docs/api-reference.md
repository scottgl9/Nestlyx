# API Reference

Base URL: `http://localhost:3001`

## Authentication

All endpoints require JWT authentication unless marked as **Public**.

Include the token in the `Authorization` header:
```
Authorization: Bearer <token>
```

---

## Auth

### POST /auth/register (Public)
Create a new account.

**Body:**
```json
{ "email": "user@example.com", "password": "12345678", "displayName": "John" }
```

**Response:** `{ "accessToken": "...", "user": { "id", "email", "displayName" } }`

### POST /auth/login (Public)
Sign in with existing credentials.

**Body:**
```json
{ "email": "user@example.com", "password": "12345678" }
```

**Response:** Same as register.

### GET /auth/me
Get the current authenticated user.

**Response:** `{ "id": "...", "email": "..." }`

---

## Workspaces

### POST /workspaces
Create a workspace. The creator becomes the owner.

**Body:** `{ "name": "My Workspace" }`

### GET /workspaces
List workspaces the current user is a member of.

### GET /workspaces/:id
Get workspace details including members.

### POST /workspaces/:id/members
Add a member to the workspace (requires OWNER or ADMIN role).

**Body:** `{ "email": "user@example.com", "role": "MEMBER" }`

---

## Rooms

### POST /workspaces/:wid/rooms
Create a room in a workspace.

**Body:** `{ "name": "Weekly Standup" }`

### GET /workspaces/:wid/rooms
List rooms in a workspace.

### GET /rooms/:id
Get room details with active participants.

### POST /rooms/:id/join
Join a room as a participant.

### POST /rooms/:id/leave
Leave a room.

### GET /rooms/invite/:code (Public)
Look up a room by invite code.

---

## Recordings

### POST /recordings/start/:roomId
Start a recording session.

### POST /recordings/:id/stop
Stop a recording session.

### POST /recordings/:id/upload
Upload the recorded audio file (mixed track).

**Body:** multipart/form-data with `file` field (max 500 MB). Sets recording status to `COMPLETED`.

### POST /recordings/:id/upload-speaker-track
Upload a per-speaker audio track for a recording. Creates a `SpeakerTrack` record. Multiple tracks can be uploaded for the same recording (one per participant). When transcription is triggered, these tracks are used for speaker-attributed transcription instead of the mixed file.

**Body:** multipart/form-data

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Audio file (max 500 MB) |
| `userId` | string | ID of the speaker |
| `speakerName` | string | Display name used as the speaker label in the transcript |

**Response:** The created `SpeakerTrack` record.

### GET /recordings/room/:roomId
List recordings for a room.

### GET /recordings/:id/download
Download a recording file.

---

## Transcriptions (Whisper STT)

### POST /transcriptions/recording/:recordingId
Start transcribing a recording using local Whisper. Returns immediately with a transcription entry in `PROCESSING` status. The transcription runs asynchronously.

**Response:** `{ "id": "...", "recordingId": "...", "status": "PROCESSING", "model": "base" }`

### GET /transcriptions/:id
Get transcription status and result.

**Response:**
```json
{
  "id": "...",
  "recordingId": "...",
  "status": "COMPLETED",
  "language": "en",
  "text": "Hello world, this is the transcribed text.",
  "segments": [{ "start": 0.0, "end": 2.5, "text": "Hello world" }],
  "model": "base"
}
```

Status values: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

### GET /transcriptions/recording/:recordingId
List all transcriptions for a recording.

---

## WebSocket Events

### Chat Namespace (`/chat`)

Connect with `auth: { token }` in handshake.

| Event | Direction | Payload |
|-------|-----------|---------|
| `join` | client→server | `{ workspaceId, roomId? }` |
| `chat:send` | client→server | `{ workspaceId, roomId?, content }` |
| `chat:message` | server→client | `{ id, workspaceId, roomId, senderId, senderName, content, createdAt }` |
| `chat:history` | client→server | `{ workspaceId, roomId?, cursor?, limit? }` |
| `chat:history:response` | server→client | `{ messages[], hasMore, nextCursor }` |

### Signaling Namespace (`/signaling`)

Connect with `auth: { token }` in handshake.

| Event | Direction | Payload |
|-------|-----------|---------|
| `signal:join-room` | client→server | `{ roomId }` |
| `signal:leave-room` | client→server | `{}` |
| `signal:offer` | client→server | `{ roomId, targetUserId, sdp }` |
| `signal:answer` | client→server | `{ roomId, targetUserId, sdp }` |
| `signal:ice-candidate` | client→server | `{ roomId, targetUserId, candidate }` |
| `signal:mute-toggle` | client→server | `{ roomId, isMuted }` |
| `signal:room-peers` | server→client | `{ roomId, peers[] }` |
| `signal:peer-joined` | server→client | `{ roomId, peer }` |
| `signal:peer-left` | server→client | `{ roomId, userId }` |
