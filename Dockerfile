FROM node:18-alpine

# Install FFmpeg for video processing
RUN apk add --no-cache ffmpeg

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