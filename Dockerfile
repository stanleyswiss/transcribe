FROM node:18-alpine

WORKDIR /app

# Copy and install dependencies first
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Start the app
CMD ["node", "server-stable.js"]