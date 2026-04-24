FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

RUN npx -y skills add railwayapp/railway-skills || echo "[build] skills add failed, continuing without"

CMD ["npm", "start"]
