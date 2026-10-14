FROM node:24-slim AS base
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY lib ./lib
COPY api ./api
COPY legal ./legal

EXPOSE 3000
CMD ["node", "server.js"]
