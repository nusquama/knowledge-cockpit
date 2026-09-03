FROM node:24-alpine

LABEL org.opencontainers.image.title="Knowledge Cockpit"
LABEL org.opencontainers.image.description="Connected private knowledge dashboard"

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.mjs index.html app.js healthz ./

RUN apk add --no-cache libcap \
    && setcap cap_net_bind_service=+ep /usr/local/bin/node \
    && apk del libcap \
    && chown -R node:node /app
USER node

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["node", "server.mjs"]
