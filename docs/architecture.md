# Architecture

## Overview

Nestlyx is a self-hosted meeting platform using a monorepo structure with npm workspaces.

```
Client (Next.js)
  ├── REST API ──────> NestJS API ──> PostgreSQL
  ├── WebSocket /chat ─> Chat Gateway ──> Redis PubSub
  └── WebSocket /signaling ─> Signaling Gateway
        └── WebRTC Mesh (peer-to-peer audio)

Recording & Transcription:
  Client ──> POST /recordings/:id/upload ──> StorageService (local disk)
  Client ──> POST /recordings/:id/upload-speaker-track ──> StorageService
  POST /transcriptions/recording/:id ──> TranscriptionService
        ├── (no speaker tracks) WhisperService ──> whisper.cpp (nodejs-whisper)
        └── (speaker tracks) WhisperService × N speakers ──> merged segments
```

## Packages

### `@nestlyx/shared`
Shared TypeScript types, enums, DTOs, and constants used by both frontend and backend.

### `@nestlyx/api` (apps/api)
NestJS backend with the following modules:
- **AuthModule** — JWT-based authentication with Passport
- **UsersModule** — User CRUD operations
- **WorkspacesModule** — Workspace management and membership
- **RoomsModule** — Room lifecycle (create, join, leave, status transitions)
- **ChatModule** — Real-time chat via Socket.IO `/chat` namespace
- **SignalingModule** — WebRTC signaling via Socket.IO `/signaling` namespace
- **RecordingModule** — Recording management, file upload, and per-speaker track upload
- **TranscriptionModule** — Whisper STT transcription with speaker diarization support

### `@nestlyx/web` (apps/web)
Next.js 15 frontend with App Router:
- Auth pages (login, register)
- Dashboard (workspace listing)
- Workspace page (room listing, workspace chat)
- Room page (voice call, chat, recording)
- Invite link flow

## WebRTC Architecture

Nestlyx v1 uses **mesh topology** for voice calls:
- Each peer connects directly to every other peer
- The signaling server relays SDP offers/answers and ICE candidates
- Works well for up to ~8-10 peers with audio-only
- No SFU (Selective Forwarding Unit) required for v1

## Recording

Client-side recording using the MediaRecorder API:
1. Host starts recording via the UI
2. A recording entry is created on the server
3. MediaRecorder captures audio (mixed or per-speaker tracks)
4. On stop, the recorded blob(s) are uploaded to the API
5. Files are stored locally under `STORAGE_LOCAL_PATH` (default: `./uploads`)

**Per-speaker recording** allows each participant to upload their own audio track separately. Each track is stored as a `SpeakerTrack` record associated with the `Recording`. This enables speaker-attributed transcription without a separate diarization model.

## Transcription (Whisper STT)

Transcription is handled by `TranscriptionModule`, which uses `WhisperService` backed by [nodejs-whisper](https://github.com/ChetanXpro/nodejs-whisper) (a Node.js wrapper around whisper.cpp).

**Single-track flow:**
1. `POST /transcriptions/recording/:id` is called
2. A `Transcription` row is created with status `PROCESSING` and returned immediately
3. `WhisperService.transcribe()` runs asynchronously on `recording.filePath`
4. The result is parsed from the whisper.cpp JSON output file, then stored in the `Transcription` row with status `COMPLETED` (or `FAILED`)

**Per-speaker (diarized) flow:**
1. Same request — `TranscriptionService` detects that `SpeakerTrack` records exist
2. Each speaker track is transcribed independently and in sequence
3. All segments are merged and sorted by start time
4. The formatted transcript uses `[SpeakerName]` labels to delineate speaker turns
5. The merged result is stored in the `Transcription` row

The Whisper model is configured via the `WHISPER_MODEL` environment variable (default: `base`). FFmpeg must be available on the system PATH for audio conversion.

## Authentication

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens issued on login/register
- JwtAuthGuard applied globally, `@Public()` decorator for open endpoints
- WebSocket authentication via token in handshake
