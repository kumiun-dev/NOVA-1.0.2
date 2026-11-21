FROM node:22-bookworm-slim AS base
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dumb-init fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 \
    libpango-1.0-0 libstdc++6 libwayland-client0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 libxss1 libxtst6 \
    python3 make g++ && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /app/data /app/backups /ms-playwright && chown -R node:node /app /ms-playwright

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci && npx playwright install chromium

FROM deps AS builder
COPY . .
ENV NOVA_ADMIN_EMAIL=build-only@example.invalid NOVA_ADMIN_PASSWORD=build-only-password-12345
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/app/data NOVA_SECURE_COOKIES=true
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node seed ./seed
COPY --from=deps --chown=node:node /ms-playwright /ms-playwright
COPY --chown=node:node scripts/backup-data.mjs ./scripts/backup-data.mjs
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
