# Deployment

## Docker Compose (Recommended)

The simplest way to deploy Nestlyx:

```bash
# Clone the repo
git clone <repo-url>
cd Nestlyx

# Configure environment
cp .env.example .env
# Edit .env with your settings (especially JWT_SECRET)

# Start all services
docker compose up -d
```

This starts:
- PostgreSQL 16
- Redis 7
- API server (port 3001)
- Web frontend (port 3000)

## Production Considerations

### JWT Secret
Generate a strong secret:
```bash
openssl rand -base64 32
```

### STUN/TURN Servers
The default config uses Google's public STUN server, which works for peers on the same network or with open NAT. For production across NATs:

1. Deploy [coturn](https://github.com/coturn/coturn)
2. Update `ICE_SERVERS` in your `.env`:
```json
[
  {"urls": "stun:your-turn-server.com:3478"},
  {"urls": "turn:your-turn-server.com:3478", "username": "user", "credential": "pass"}
]
```

### Recording Storage
For production, configure S3 storage:
```env
STORAGE_PROVIDER=s3
S3_BUCKET=nestlyx-recordings
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

### Reverse Proxy
Place behind nginx or Caddy for TLS:

```nginx
server {
    listen 443 ssl;
    server_name meet.example.com;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /api/ {
        proxy_pass http://localhost:3001/;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Database Backups
Set up regular PostgreSQL backups:
```bash
docker compose exec postgres pg_dump -U nestlyx nestlyx > backup.sql
```
