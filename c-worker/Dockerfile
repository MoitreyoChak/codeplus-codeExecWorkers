# Use GCC image (Debian-based)
FROM gcc:latest

# Install Node.js and npm
RUN apt-get update && apt-get install -y nodejs npm

# Set the working directory
WORKDIR /app

# Copy project files
COPY worker.js package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install

# Start the worker
CMD ["node", "worker.js"]
