FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY src ./src
COPY public ./public
ENV RSS_HOST=0.0.0.0 RSS_PORT=3001 RSS_DATA=/data TZ=Europe/Berlin
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3001
USER node
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 CMD ["wget", "-qO-", "http://127.0.0.1:3001/health"]
CMD ["node", "bin/rss.js"]
