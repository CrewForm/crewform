# ─────────────────────────────────────────────────────────────────────────────
# CrewForm Task Runner — Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS build

WORKDIR /usr/src/app

# ── Build the chat widget first ──────────────────────────────────────────────
COPY chat-widget/package*.json ./chat-widget/
RUN cd chat-widget && npm ci --include=dev

COPY chat-widget/tsconfig.json ./chat-widget/tsconfig.json
COPY chat-widget/vite.config.ts ./chat-widget/vite.config.ts
COPY chat-widget/src ./chat-widget/src
RUN cd chat-widget && npx vite build

# ── Build the task runner ────────────────────────────────────────────────────
COPY agent-runtime /usr/src/agent-runtime
COPY task-runner/package*.json ./
RUN npm ci --include=dev

# Copy source code
COPY task-runner/tsconfig.json ./tsconfig.json
COPY task-runner/src ./src

# Build TypeScript to dist/
RUN npx tsc -p tsconfig.json

# Remove build/test tooling from the deployed image, then run without root.
RUN npm prune --omit=dev

FROM node:22-alpine
RUN apk upgrade --no-cache zlib
WORKDIR /usr/src/app
# The runtime needs Node, not package installation tooling or its dependencies.
RUN node -e "const fs=require('node:fs');fs.rmSync('/usr/local/lib/node_modules',{recursive:true,force:true});for(const file of ['npm','npx','corepack','yarn','yarnpkg','pnpm','pnpx']) fs.rmSync('/usr/local/bin/'+file,{force:true});for(const dir of fs.readdirSync('/opt').filter(name=>name.startsWith('yarn-'))) fs.rmSync('/opt/'+dir,{recursive:true,force:true});"
COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --from=build --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/package*.json ./
COPY --from=build --chown=node:node /usr/src/agent-runtime /usr/src/agent-runtime
COPY --from=build --chown=node:node /usr/src/app/chat-widget/dist ./chat-widget/dist
USER node

# Readiness includes the runner's database registration and recent heartbeat.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Set explicit Node.js heap limit.
# Railway typically provides 512MB–1GB RAM.
# We set 384MB to leave headroom for the OS and stack.
ENV NODE_OPTIONS="--max-old-space-size=384"

CMD ["node", "dist/index.js"]
