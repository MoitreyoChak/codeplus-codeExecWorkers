# Use OpenJDK base image
FROM openjdk:24-jdk-slim

# Install curl and required tools
RUN apt-get update && apt-get install -y curl gnupg ca-certificates

# Add NodeSource (for Node.js 18) and install Node.js + npm
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
COPY shared ./shared
COPY java-worker ./java-worker

RUN npm install

# Set working directory to java-worker
WORKDIR /app/java-worker

# Start the worker
CMD ["node", "worker.js"]
