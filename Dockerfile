FROM node:24-slim

WORKDIR /app

# Build tools required to compile better-sqlite3 native addon
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8080
ENV NODE_ENV=production
CMD ["npm", "start"]
