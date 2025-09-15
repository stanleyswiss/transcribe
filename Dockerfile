FROM node:18-alpine

WORKDIR /app

# Copy and install dependencies first
COPY package*.json ./
RUN npm install --production

# Copy application
COPY . .

# Start the app
CMD ["node", "server-stable.js"]