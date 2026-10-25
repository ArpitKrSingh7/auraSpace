FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
