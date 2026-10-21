# ==========================================
# Amrutam Telemedicine Backend: Multi-stage Dockerfile
# Optimized for minimal size, security, and performance
# ==========================================

# 1. Build Stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies for build
RUN npm ci

COPY src/ ./src/
COPY docs/ ./docs/

# Compile TypeScript to JavaScript
RUN npm run build

# Prune devDependencies to keep image lean
RUN npm prune --production

# ==========================================
# 2. Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=4000

# Install dumb-init for proper signal forwarding and zombie process reaping
RUN apk add --no-cache dumb-init

# Create non-root system user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /usr/src/app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /usr/src/app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /usr/src/app/src/core/database/schema.sql ./dist/core/database/schema.sql
COPY --from=builder --chown=appuser:appgroup /usr/src/app/docs ./docs

# Drop privileges to non-root user
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]
