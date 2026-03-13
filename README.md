# Nestlyx

Nestlyx is an open-source, self-hosted meeting platform with real-time chat, voice calling, and recording.

## Features

- **Workspaces** — Organize teams and meetings
- **Rooms** — Create meeting rooms with invite links
- **Voice Calls** — WebRTC-based peer-to-peer audio
- **Camera Video** — Toggle camera on/off during meetings with video tile grid
- **Screen Sharing** — Share your screen with participants (one at a time per room)
- **Chat** — Real-time messaging (workspace and room-scoped)
- **Recording** — Client-side audio recording with upload
- **Auth** — JWT-based authentication

## Quick Start

```bash
# Install dependencies
npm install

# Start database services
docker compose up postgres redis -d

# Configure environment
cp .env.example .env

# Setup database
npm run db:generate
npm run db:migrate

# Build shared package
npm run build:shared

# Start development servers
npm run dev:api    # API on :3001
npm run dev:web    # Web on :3000
```

## Docker Compose

```bash
docker compose up
```

Starts PostgreSQL, Redis, API, and web frontend.

## Tech Stack

- **Backend**: NestJS, Prisma, Socket.IO, Passport JWT
- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Zustand
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Voice**: WebRTC mesh topology

## Documentation

- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [Database Schema](docs/database-schema.md)

## License

See [LICENSE](LICENSE) for details.
