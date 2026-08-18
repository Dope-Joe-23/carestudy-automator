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

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Install Python 3 and pip for the RAG engine (use venv to avoid PEP 668)
RUN apk add --no-cache python3 py3-pip py3-virtualenv \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
        anthropic>=0.40 \
        pypdf>=4.0 \
        python-docx>=1.1 \
        scikit-learn>=1.3

# Make the venv python the default
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Copy the bundled API server
COPY --from=builder /app/artifacts/api-server/dist/ dist/

# Copy the Python RAG engine (needed by draftWorker at runtime)
COPY --from=builder /app/carestudy_rag/ carestudy_rag/

# Create data directories
RUN mkdir -p /app/data/uploads /app/data/studies /app/data/library

# Expose the API server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start the API server
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
