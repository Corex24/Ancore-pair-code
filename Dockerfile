# Use official Node.js LTS version
FROM node:lts-buster

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Install system dependencies (FIXED)
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Install global dependencies
RUN npm install -g qrcode-terminal pm2

# Copy app source code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1001 -s /bin/bash appuser && \
    chown -R appuser:appuser /usr/src/app

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start the application
CMD ["pm2-runtime", "start", "index.js", "--name", "ancorepair"]
