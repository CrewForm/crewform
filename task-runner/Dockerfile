# ─────────────────────────────────────────────────────────────────────────────
# CrewForm Task Runner — Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /usr/src/app

# ── Build the chat widget first ──────────────────────────────────────────────
COPY chat-widget/package*.json ./chat-widget/
RUN cd chat-widget && npm ci --include=dev

COPY chat-widget/tsconfig.json ./chat-widget/tsconfig.json
COPY chat-widget/vite.config.ts ./chat-widget/vite.config.ts
COPY chat-widget/src ./chat-widget/src
RUN cd chat-widget && npx vite build

# ── Build the task runner ────────────────────────────────────────────────────
COPY task-runner/package*.json ./
RUN npm ci --include=dev

# Copy source code
COPY task-runner/tsconfig.json ./tsconfig.json
COPY task-runner/src ./src

# Build TypeScript to dist/
RUN npx tsc -p tsconfig.json

# Health check — verify the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD pgrep -f "node" > /dev/null || exit 1

# Set explicit Node.js heap limit.
# Railway typically provides 512MB–1GB RAM.
# We set 384MB to leave headroom for the OS and stack.
ENV NODE_OPTIONS="--max-old-space-size=384"

CMD ["node", "dist/index.js"]
