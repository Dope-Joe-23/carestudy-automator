# Deployment Guide

This project is deployed as two separate services:

- **Backend (Render)**: Dockerized Node.js API server + Python RAG engine + PostgreSQL
- **Frontend (Vercel)**: Static React app built with Vite

---

## Prerequisites

1. **GitHub/GitLab account** with this repository pushed
2. **Render account** (https://render.com) — free tier available
3. **Vercel account** (https://vercel.com) — free tier available
4. **Anthropic API key** or **OpenRouter token** for the AI drafting engine

---

## Backend Deployment (Render)

### Option A: Using Render Blueprint (Recommended)

1. **Push your code** to GitHub/GitLab

2. **Create a Blueprint on Render**:
   - Go to [render.com/dashboard](https://render.com/dashboard)
   - Click **New** → **Blueprint**
   - Connect your repository
   - Render will detect `render.yaml` and create:
     - A PostgreSQL database (`carestudy-db`)
     - A web service (`carestudy-api`)

3. **Set environment variables** in the Render dashboard:
   - Go to `carestudy-api` → **Environment** tab
   - Set these secrets:
     ```
     ANTHROPIC_AUTH_TOKEN=your-openrouter-or-anthropic-token
     ADMIN_PASSWORD=your-secure-admin-password
     ```
   - Optional (for large file uploads):
     ```
     CLOUDFLARE_ACCOUNT_ID=xxx
     CLOUDFLARE_R2_ACCESS_KEY_ID=xxx
     CLOUDFLARE_R2_SECRET_ACCESS_KEY=xxx
     R2_BUCKET_NAME=xxx
     ```

4. **Wait for deployment** — Render will build the Docker image and start the service

5. **Note your API URL** — it will be something like:
   ```
   https://carestudy-api.onrender.com
   ```

### Option B: Manual Docker Deployment on Render

1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click **New** → **Web Service**
3. Connect your repository
4. Configure:
   - **Runtime**: Docker
   - **Dockerfile**: `./Dockerfile`
   - **Docker Context**: `.`
   - **Plan**: Starter (512 MB RAM)
5. Set environment variables (same as Option A)
6. Create a PostgreSQL database separately and set `DATABASE_URL`

---

## Frontend Deployment (Vercel)

### Step 1: Import Repository

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your repository

### Step 2: Configure Build Settings

Vercel should auto-detect the configuration from `vercel.json`. If not, set:

- **Framework Preset**: Other
- **Build Command**: `cd artifacts/carestudy-assistant && pnpm install && pnpm build`
- **Output Directory**: `artifacts/carestudy-assistant/dist/public`
- **Install Command**: `corepack enable && pnpm install --frozen-lockfile`

### Step 3: Set Environment Variables

In the Vercel project settings → **Environment Variables**:

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_API_URL` | `https://carestudy-api.onrender.com/api` | Backend API URL |

> **Important**: Replace the URL with your actual Render deployment URL.

### Step 4: Deploy

Click **Deploy** — Vercel will build and deploy your frontend.

---

## Local Development with Docker

### Quick Start

```bash
# Start API server + PostgreSQL
docker compose up

# Or in detached mode
docker compose up -d

# View logs
docker compose logs -f api

# Stop everything
docker compose down
```

### First Time Setup

1. Create a `.env` file in the project root:
   ```bash
   cp artifacts/api-server/.env.example .env
   ```

2. Edit `.env` with your API keys:
   ```
   ANTHROPIC_AUTH_TOKEN=your-token-here
   ADMIN_PASSWORD=your-admin-password
   ```

3. Start the services:
   ```bash
   docker compose up
   ```

4. The API will be available at `http://localhost:5000`

5. In another terminal, start the frontend:
   ```bash
   pnpm --filter @workspace/carestudy-assistant run dev
   ```

### Database Management

The PostgreSQL database runs in a Docker container. To run migrations:

```bash
# Push schema to PostgreSQL
DB_DRIVER=postgres DATABASE_URL=postgresql://carestudy:carestudy_dev_password@localhost:5432/carestudy \
  pnpm --filter @workspace/db run push:pg
```

---

## Environment Variables Reference

### Backend (Render)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port |
| `DB_DRIVER` | No | `sqlite` | Database backend: `sqlite` or `postgres` |
| `DATABASE_URL` | If postgres | — | PostgreSQL connection string |
| `ANTHROPIC_AUTH_TOKEN` | Yes* | — | API token for AI drafting |
| `ANTHROPIC_BASE_URL` | No | `https://openrouter.ai/api` | API endpoint |
| `ANTHROPIC_MODEL` | No | `openai/gpt-oss-20b:free` | AI model to use |
| `ADMIN_USERNAME` | No | `admin` | Studio admin username |
| `ADMIN_PASSWORD` | Yes | — | Studio admin password |
| `MAX_UPLOAD_MB` | No | `250` | Max file upload size in MB |
| `CLOUDFLARE_ACCOUNT_ID` | No | — | R2 storage (for large files) |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | No | — | R2 storage |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | No | — | R2 storage |
| `R2_BUCKET_NAME` | No | — | R2 storage |
| `PYTHON_BIN` | No | `python` | Python binary path |

*Required if not using direct Anthropic API

### Frontend (Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `/api` | Backend API URL |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  React Frontend (Static Files)                       │   │
│  │  artifacts/carestudy-assistant/dist/public           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ VITE_API_URL
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        Render                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Node.js API Server (Express)                        │   │
│  │  artifacts/api-server/dist/index.mjs                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           │ child_process                   │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Python RAG Engine (draft_worker.py)                 │   │
│  │  carestudy_rag/src/draft_worker.py                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           │ DATABASE_URL                    │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PostgreSQL Database                                 │   │
│  │  Render Managed PostgreSQL                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Backend won't start

1. Check Render logs for build errors
2. Verify all required environment variables are set
3. Ensure `DATABASE_URL` is correct if using PostgreSQL

### Frontend can't reach API

1. Verify `VITE_API_URL` is set correctly in Vercel
2. Check that the backend is running and healthy
3. Ensure CORS is enabled (it is by default)

### File uploads failing

1. For large files (>250 MB), configure Cloudflare R2
2. Check `MAX_UPLOAD_MB` is set appropriately
3. Verify R2 CORS is enabled for your frontend origin

### Python RAG engine errors

1. Ensure Python dependencies are installed in the Docker image
2. Check `PYTHON_BIN` is set to `python3` on Render
3. View logs for Python traceback errors

---

## Cost Estimates

### Render (Starter Plan)
- Web Service: ~$7/month
- PostgreSQL: ~$7/month (or free tier)
- **Total**: ~$7-14/month

### Vercel (Hobby Plan)
- Frontend hosting: Free (100 GB bandwidth/month)
- **Total**: $0

### Free Tier Option
- Render Free Tier: Web service sleeps after 15 min inactivity
- Vercel Hobby: Free for personal projects
- **Total**: $0 (with cold start delays)
