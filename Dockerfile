FROM node:24-bookworm-slim AS build
LABEL org.opencontainers.image.source="https://github.com/skords83/notera"
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["npm", "start"]
