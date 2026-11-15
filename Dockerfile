# mums.flower on c0mpute Apps. Alpine so libSQL installs its musl binary.
FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile && pnpm store prune
COPY src ./src
COPY static ./static
# /data holds the libSQL file; c0mpute snapshots it to standbys (state = /data).
RUN install -d -o 65534 -g 65534 -m 750 /data
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 MUMS_DB_URL=file:/data/mums.db
USER 65534:65534
EXPOSE 8080
CMD ["node", "src/server.ts"]
