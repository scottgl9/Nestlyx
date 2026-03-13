# Nestlyx

Self-hosted meeting platform with chat, voice calling, and recording.

## Monorepo Layout

- `packages/shared` — `@nestlyx/shared`: types, enums, DTOs, constants
- `apps/api` — NestJS backend (REST + WebSocket)
- `apps/web` — Next.js 15 frontend (App Router)

## Commands

```bash
# Install all dependencies
npm install

# Build everything
npm run build

# Dev servers
npm run dev:api     # NestJS on :3001
npm run dev:web     # Next.js on :3000

# Tests
npm test            # all workspaces
npm run test:api    # API only

# Database
npm run db:generate # regenerate Prisma client
npm run db:migrate  # run migrations

# Docker
docker compose up   # postgres + redis + api + web
```

## Tech Stack

- **Backend**: NestJS, Prisma (PostgreSQL), Socket.IO, Passport JWT, bcrypt
- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Zustand, Socket.IO client
- **Infra**: PostgreSQL 16, Redis 7, Docker Compose

## Architecture

- REST API for CRUD, WebSocket (Socket.IO) for real-time chat and WebRTC signaling
- Socket.IO namespaces: `/chat` and `/signaling`
- WebRTC mesh topology for voice, camera video, and screen sharing (no SFU)
- Client-side MediaRecorder for recording, uploaded to API
- JWT auth on both HTTP and WebSocket

## Conventions

- Use `@nestlyx/shared` for any types/DTOs shared between frontend and backend
- Prisma schema lives in `apps/api/prisma/schema.prisma`
- API modules follow NestJS conventions: controller, service, module, guards
- Frontend uses App Router with `app/` directory structure
- Environment variables documented in `.env.example`
