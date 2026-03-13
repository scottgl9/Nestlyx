# Development

## Prerequisites

- Node.js 20+
- Docker and Docker Compose (for PostgreSQL and Redis)
- FFmpeg (required for Whisper STT transcription)

## Setup

```bash
# Install dependencies
npm install

# Start database and Redis
docker compose up postgres redis -d

# Copy environment config
cp .env.example .env

# Generate Prisma client and run migrations
npm run db:generate
npm run db:migrate

# Build shared package
npm run build:shared

# Start dev servers (in separate terminals)
npm run dev:api    # API on http://localhost:3001
npm run dev:web    # Web on http://localhost:3000
```

## Project Structure

```
Nestlyx/
├── packages/shared/      # Shared types, enums, DTOs
│   └── src/
├── apps/api/             # NestJS backend
│   ├── prisma/           # Database schema and migrations
│   └── src/
│       ├── auth/         # Authentication (JWT, Passport)
│       ├── users/        # User management
│       ├── workspaces/   # Workspace CRUD
│       ├── rooms/        # Room lifecycle
│       ├── chat/         # WebSocket chat gateway
│       ├── signaling/    # WebRTC signaling gateway
│       ├── recording/    # Recording management and speaker track upload
│       ├── transcription/ # Whisper STT transcription
│       └── prisma/       # Database service
└── apps/web/             # Next.js frontend
    └── src/
        ├── app/          # Pages (App Router)
        ├── components/   # UI components
        ├── hooks/        # React hooks
        ├── lib/          # Utilities (API client)
        └── stores/       # Zustand stores
```

## Testing

```bash
# Run all tests
npm test

# Run API tests only
npm run test:api

# Run specific test file
cd apps/api && npx jest src/auth/auth.service.spec.ts
```

## Database

```bash
# Create a new migration
cd apps/api && npx prisma migrate dev --name <migration-name>

# Reset database
cd apps/api && npx prisma migrate reset

# Open Prisma Studio
cd apps/api && npx prisma studio
```

## Code Conventions

- Backend modules follow NestJS patterns: module, controller, service, guards
- Frontend uses React hooks for state/logic, components for UI
- Shared types go in `@nestlyx/shared`, not duplicated
- WebSocket events are defined as constants in shared package
