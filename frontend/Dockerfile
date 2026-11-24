FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_registry_ca \
    if [ -f /run/secrets/npm_registry_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_registry_ca; fi; \
    npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
