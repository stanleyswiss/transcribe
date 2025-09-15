FROM node:18-alpine

WORKDIR /app

# Copy and install dependencies first
COPY package*.json ./
RUN npm install --production

# Copy application
COPY . .

# Railway will set PORT env var
EXPOSE 3000

# Start the app
CMD ["npm", "start"]