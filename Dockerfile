FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="Knowledge Cockpit"
LABEL org.opencontainers.image.description="Static Knowledge Cockpit prototype"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY healthz /usr/share/nginx/html/healthz

RUN chmod 0644 /usr/share/nginx/html/index.html /usr/share/nginx/html/healthz

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
