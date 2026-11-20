FROM node:22-bookworm-slim

WORKDIR /app

COPY express/package.json express/package-lock.json ./
RUN npm ci

COPY --chown=node:node express/index.js ./
COPY --chown=node:node express/src ./src
COPY --chown=node:node express/tests ./tests
COPY --chown=node:node express/database ./database
COPY --chown=node:node contracts/schemas /contracts/schemas
COPY --chown=node:node contracts/examples/valid/request-partial.json contracts/examples/valid/response-follow-up.json /contracts/examples/valid/

USER node

EXPOSE 3000

CMD ["node", "index.js"]
