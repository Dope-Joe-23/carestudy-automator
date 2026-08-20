# ============================================================================
# Backend API Server — Multi-stage Docker build
# ============================================================================
# The build uses esbuild to bundle the entire Node.js API server into a single
# dist/index.mjs. At runtime we need Node.js + Python (for the RAG engine).
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm v10 (matches the lockfile and workspace config format)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace root files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy package.json files for all workspace packages (needed for pnpm install)
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/carestudy-assistant/package.json artifacts/carestudy-assistant/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY scripts/package.json scripts/

# Install dependencies
# pnpm v10+ requires explicit build script approval — approve all non-interactively
RUN pnpm approve-builds --all || true
RUN pnpm install --frozen-lockfile

# Copy source code
COPY lib/ lib/
COPY artifacts/api-server/ artifacts/api-server/
COPY carestudy_rag/ carestudy_rag/

# Build the API server (esbuild bundles everything into dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# Install Python 3 and the toolchain needed to build scikit-learn from source
# Alpine does not ship a C compiler by default, and scikit-learn needs one.
RUN apk add --no-cache build-base python3 python3-dev py3-pip py3-virtualenv \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
        anthropic>=0.40 \
        pypdf>=4.0 \
        python-docx>=1.1 \
        scikit-learn>=1.3

# Make the venv python the default
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Preserve the build output path. esbuild-plugin-pino embeds this directory in
# Pino's worker/transport paths, so moving the bundle to /app/dist would leave
# thread-stream-worker.mjs unavailable at runtime.
COPY --from=builder /app/artifacts/api-server/dist/ artifacts/api-server/dist/

# Copy the Python RAG engine (needed by draftWorker at runtime)
COPY --from=builder /app/carestudy_rag/ carestudy_rag/

# Create data directories
# NOTE: On Render, /app/data is overridden by a persistent disk mount
# (see render.yaml) so these directories survive deploys. In local
# development the directories are created here.
RUN mkdir -p /app/data/uploads /app/data/studies /app/data/library

# Expose the API server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the API server
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
