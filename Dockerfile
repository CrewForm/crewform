# ─────────────────────────────────────────────────────────────────────────────
# CrewForm Frontend — Multi-stage Dockerfile
# Stage 1: Build Vite app
# Stage 2: Serve static files via nginx
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Accept build-time env vars for Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_TASK_RUNNER_URL
ARG VITE_CREWFORM_EDITION=ce
ARG VITE_APP_URL

# Copy source and build
COPY . .
RUN npm run build

# ── Serve stage ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
