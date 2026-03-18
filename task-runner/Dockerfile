# ─────────────────────────────────────────────────────────────────────────────
# CrewForm Task Runner — Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --include=dev

# Copy source code
COPY tsconfig.json .
COPY src ./src

# Build TypeScript to dist/
RUN npx tsc

# Health check — verify the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD pgrep -f "node" > /dev/null || exit 1

CMD ["node", "dist/index.js"]
