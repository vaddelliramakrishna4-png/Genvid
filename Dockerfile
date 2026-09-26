FROM node:22-slim

# Install Python, pip, ffmpeg, and other dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/

# Install Node dependencies
RUN pnpm install --frozen-lockfile

# Setup Python virtual environment and install Kokoro dependencies
RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
RUN pip3 install --no-cache-dir torch numpy soundfile kokoro faster-whisper

# Copy the rest of the application
COPY . .

# Build the API
RUN pnpm run build --filter @genvid/api...

# Start the API server
EXPOSE 3001
CMD ["pnpm", "run", "--filter", "@genvid/api", "start"]
