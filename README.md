# Aivora AI Cloud Browser Platform

Production-grade starter for an AI-powered cloud browser with role-based access:
- Parent
- Student (parent-controlled)
- Normal user

## 1) Folder Structure

```txt
client/
  electron/
  src/
    components/
    pages/
    layouts/
    animations/
    services/
server/
  src/
    ai/
    browser/
    config/
    controllers/
    middleware/
    models/
    routes/
    socket/
docker-compose.yml
```

## 2) Backend Implementation

Server stack:
- Node.js + Express
- MongoDB + Mongoose
- Playwright
- Socket.IO

Core modules:
- `server/src/controllers/authController.js`
- `server/src/controllers/parentController.js`
- `server/src/controllers/browserController.js`
- `server/src/browser/sessionManager.js`
- `server/src/ai/tabOptimizer.js`

## 3) Database Models

- `User`: includes role (`parent`, `student`, `normal`)
- `Relationship`: maps `parentId -> studentId`
- `Restriction`: blocked keywords/domains per parent
- `History`: search + visited URL logs
- `BrowserSession`: tab-level cloud browser state

## 4) Authentication (3 Roles)

Routes:
- `POST /auth/signup`
- `POST /auth/login`

Login enforces role match to prevent incorrect role-session usage.

## 5) Parent-Student Linking

Routes:
- `POST /parent/link-student`

Supports:
- parent linking existing student email
- student signup with parent email

## 6) Parental Control System

Routes:
- `POST /parent/add-keyword`
- `POST /parent/remove-keyword`
- `POST /parent/block-domain`
- `GET /parent/get-student-history`

Enforcement middleware:
- `server/src/middleware/restrictionGuard.js`

Applied before:
- `POST /browser/search`
- `POST /browser/open-tab`

## 7) Browser Engine (Playwright)

Cloud browser session manager:
- isolated browser context per user
- open / close / switch tabs
- active tab tracking

See `server/src/browser/sessionManager.js`.

## 8) WebSocket Streaming

Socket events:
- `join-user-room`
- `join-parent-room`
- `student-live-event`
- `platform-heartbeat`

Streaming gateway entry point:
- `server/src/browser/streamGateway.js`

## 9) Frontend Futuristic UI

Client stack:
- React + Vite + Electron
- Tailwind CSS
- Framer Motion

Pages:
- Role selection
- Role-aware login/signup
- Browser dashboard (search, tab open, warnings)
- Parent dashboard (link student, policies, monitoring)

## 10) Dashboards

- Parent dashboard: student linking, restrictions, history monitoring
- Student/normal dashboard: cloud browsing, smart search, warning overlays

## 11) AI Tab Optimization

`analyzeTabs(tabs)` returns:
- `suspend`
- `optimize`
- `keepActive`

Implementation:
- `server/src/ai/tabOptimizer.js`

## 12) Docker Setup

Backend Dockerized with Playwright base image:
- `server/Dockerfile`
- `docker-compose.yml` for `server + mongodb`

Run:

```bash
docker compose up --build
```

## 13) AWS Deployment Guide (EC2)

1. Create Ubuntu EC2 instance (recommended: `t3.large` for Playwright workloads).
2. Install Docker + Docker Compose plugin.
3. Clone repository and copy `.env` values into environment (or compose overrides).
4. Open security group ports:
   - `4000` (API/WebSocket)
   - `22` (SSH)
5. Deploy:
   ```bash
   docker compose up -d --build
   ```
6. Configure reverse proxy (Nginx) and TLS with Let's Encrypt.
7. Add autoscaling path:
   - move API/container to ECS or EKS
   - externalize MongoDB to DocumentDB/Atlas
   - store session metadata in Redis
8. Production hardening:
   - strong JWT secret
   - rate limiting + WAF
   - CloudWatch log shipping
   - encrypted at-rest + in-transit data

## 14) Electron Desktop Build (Light Client)

The desktop app is a lightweight Electron shell that connects to your cloud backend.

### Configure client environment

Create `client/.env`:

```env
VITE_API_URL=https://your-api-domain.com
VITE_WS_URL=https://your-api-domain.com
```

### Dev mode

```bash
cd client
npm install
npm run electron:dev
```

### Build desktop installer (Windows)

```bash
cd client
npm install
npm run electron:build
```

If Windows blocks symlink extraction during `electron-builder` (winCodeSign cache error), use:

```bash
npm run electron:build:unsigned
```

Also enable **Developer Mode** in Windows or run terminal as **Administrator**.

Installer output appears in `client/release/`.

## 15) Cloud-Only Runtime Model (AWS + WebSocket)

Recommended architecture for lightweight desktop client:

1. Deploy `server` on AWS (EC2/ECS) with public HTTPS domain.
2. Enable TLS termination (Nginx/ALB) so HTTP + WebSocket are secure.
3. Keep Playwright, AI, session logic, and monitoring in cloud backend.
4. Desktop app only renders UI and sends user actions over API/WebSocket.
5. Users install only desktop client; no local browser engine setup needed.

### Nginx reverse proxy snippet for WebSocket

```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:4000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}

location / {
  proxy_pass http://127.0.0.1:4000;
  proxy_set_header Host $host;
}
```

## Local Development

### Server
```bash
cd server
npm install
npm run dev
```

### Client
```bash
cd client
npm install
npm run dev
```

### Electron Client
```bash
cd client
npm run electron:dev
```

## Environment Variables (Server)

Create `server/.env`:

```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/aivora
JWT_SECRET=your-strong-secret
# Single origin, or comma-separated (required if the browser runs on a different host than the API, e.g. local Vite → cloud API):
CLIENT_ORIGIN=http://localhost:5173
# Example when API is on AWS and you also test from local Vite:
# CLIENT_ORIGIN=https://65.0.96.136.nip.io,http://localhost:5173
NODE_ENV=development
```
