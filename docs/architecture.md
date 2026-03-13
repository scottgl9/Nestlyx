# Architecture

## Overview

Nestlyx is a self-hosted meeting platform using a monorepo structure with npm workspaces.

```
Client (Next.js)
  ├── REST API ──────> NestJS API ──> PostgreSQL
  ├── WebSocket /chat ─> Chat Gateway ──> Redis PubSub
  └── WebSocket /signaling ─> Signaling Gateway
        └── WebRTC Mesh (peer-to-peer audio)
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
- **RecordingModule** — Recording management and file storage

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
3. MediaRecorder captures mixed audio (local mic + remote streams)
4. On stop, the recorded blob is uploaded to the API
5. Files are stored locally or on S3

## Authentication

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens issued on login/register
- JwtAuthGuard applied globally, `@Public()` decorator for open endpoints
- WebSocket authentication via token in handshake
