# Instance demo portfolio: Node API + frontend + PostgreSQL dalam satu container.
# Data demo dibuat ulang tiap container start (lihat deploy/start-demo.sh).
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund
COPY . .
ENV DEMO_MODE=1 PGSSL=disable NODE_ENV=production
CMD ["bash", "deploy/start-demo.sh"]
