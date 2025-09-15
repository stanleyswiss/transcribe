#!/bin/bash

# Transcription App - Quick Start Script

echo "🎙️ Teams Meeting Transcription App"
echo "=================================="

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY environment variable not set"
    echo "Set it with: export OPENAI_API_KEY=your_api_key_here"
    exit 1
fi

echo "✅ OpenAI API key found"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

echo "✅ Docker is running"

# Build and run
echo "🔨 Building Docker image..."
docker build -t transcription-app .

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
    
    # Stop existing container if running
    docker stop transcription-app 2>/dev/null
    docker rm transcription-app 2>/dev/null
    
    echo "🚀 Starting container..."
    docker run -d \
        -p 3000:3000 \
        -e OPENAI_API_KEY="$OPENAI_API_KEY" \
        -v "$(pwd)/uploads:/app/uploads" \
        --name transcription-app \
        transcription-app
    
    if [ $? -eq 0 ]; then
        echo "✅ Container started successfully"
        echo "🌐 Access your app at: http://localhost:3000"
        echo ""
        echo "📊 Container status:"
        docker ps | grep transcription-app
        echo ""
        echo "📝 To view logs: docker logs -f transcription-app"
        echo "🛑 To stop: docker stop transcription-app"
    else
        echo "❌ Failed to start container"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi
