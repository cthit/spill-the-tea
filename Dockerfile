ARG NODE_VERSION=24.13.0

FROM node:${NODE_VERSION}-alpine AS base

# Set working directory
WORKDIR /app

# Install pnpm
RUN yarn global add pnpm@10

# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================

FROM base AS dependencies

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install project dependencies with frozen lockfile for reproducible builds
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile;

# ============================================
# Stage 2: Build Next.js application in standalone mode
# ============================================

FROM base AS builder

# Install openssl
RUN apk add --no-cache openssl

# Copy project dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source code
COPY . .

# Generate the Prisma client
RUN pnpm exec prisma generate

ENV NODE_ENV=production

# Disable Next.js anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Skip environment validation to prevent errors caused by required environment
# variables. Read more: https://create.t3.gg/en/deployment/docker
ENV SKIP_ENV_VALIDATION=1

# Build Next.js application with caching.
# This caches the .next/cache directory across builds, but it also prevents
# .next/cache/fetch-cache from being included in the final image, meaning
# cached fetch responses from the build won't be available at runtime.
RUN --mount=type=cache,target=/app/.next/cache \
    pnpm build;

# ============================================
# Stage 3: Run Next.js application
# ============================================

FROM base AS runner

# Install openssl
RUN apk add --no-cache openssl

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Disable Next.js anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Set owner for /app directory
RUN chown node:node /app

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts

# If you want to persist the fetch cache generated during the build so that
# cached responses are available immediately on startup, uncomment this line:
# COPY --from=builder --chown=node:node /app/.next/cache ./.next/cache

# Switch to non-root user for security best practices
USER node

# Expose port 3000 to allow HTTP traffic
EXPOSE 3000

# Start Next.js standalone server
CMD ["/bin/sh", "-c", "pnpm dlx prisma@7.8.0 migrate deploy && node server.js"]
