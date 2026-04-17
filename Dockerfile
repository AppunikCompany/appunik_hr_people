FROM node:22.12.0-bookworm-slim

WORKDIR /app

RUN npm i -g pnpm@10.33.0

ARG CLERK_PUBLISHABLE_KEY
ENV CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY

# Copy monorepo and install workspace deps.
COPY . .
RUN pnpm install --frozen-lockfile

# Build frontend + api for deployment.
RUN pnpm run build:deploy

EXPOSE 3001

# Runtime: run shared DB guard/bootstrap then start api server.
CMD ["pnpm", "run", "deploy:start"]
