FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY libs ./libs
COPY src ./src
COPY scripts ./scripts
RUN npx prisma generate && npx tsc -p tsconfig.build.json

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NODE_PATH=/app/dist
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
USER node
EXPOSE 4310
# Aplica migraciones (idempotente) y arranca. Los documentos llegan por el volumen de solo lectura /privados.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
