# Use GCC image (Debian-based)
FROM gcc:latest

# Install Node.js and npm
RUN apt-get update && apt-get install -y nodejs npm

# Set the working directory
WORKDIR /app

# Copy package.json from root
COPY package*.json ./

# Copy the shared folder and c-worker folder
COPY shared ./shared
COPY cpp-worker ./cpp-worker

# Install root-level dependencies (for shared usage)
RUN npm install

# Set working dir to c-worker and run the worker
WORKDIR /app/cpp-worker

# Start the worker
CMD ["node", "worker.js"]
