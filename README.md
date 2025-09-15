# Teams Meeting Transcription App

Single-container application for transcribing Microsoft Teams recordings using FFmpeg.js and OpenAI Whisper API.

## Features

- **Upload Teams recordings** (MP4, AVI, MOV, etc.)
- **Client-side audio extraction** using FFmpeg.js
- **High-accuracy transcription** via OpenAI Whisper API
- **Single Docker container** - easy deployment
- **Clean web interface** with drag-and-drop upload
- **Copy/download results** as text files

## Quick Start

### 1. Set OpenAI API Key
```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

### 2. Build & Run with Docker
```bash
# Build image
docker build -t transcription-app .

# Run container
docker run -d \
  -p 3000:3000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -v $(pwd)/uploads:/app/uploads \
  --name transcription \
  transcription-app
```

### 3. Access Application
Open http://localhost:3000 in your browser

## QNAP Container Station Deployment

1. **Upload project folder** to QNAP
2. **Container Station** → Create → Build Image
3. **Set environment variable**: `OPENAI_API_KEY`
4. **Map volume**: `/share/transcriptions` → `/app/uploads`
5. **Expose port**: `3000`

## Usage

1. **Upload** Teams recording file (video or audio)
2. **Wait** for FFmpeg to extract audio (if video)
3. **Transcription** happens automatically via Whisper API
4. **Copy or download** the result text

## File Size Limits

- **Max upload**: 100MB
- **Recommended**: Use MP3/M4A for faster processing
- **Cost**: ~$0.36 per hour of audio

## Supported Formats

**Input**: MP4, AVI, MOV, WMV, MKV, MP3, WAV, M4A, AAC
**Output**: Compressed MP3 (128kbps) → Whisper API

## Architecture

```
Browser → FFmpeg.js (audio extraction) → Node.js API → OpenAI Whisper
```

## Environment Variables

- `OPENAI_API_KEY` - Required for transcription
- `PORT` - Server port (default: 3000)

## Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Access at http://localhost:3000
```

## Troubleshooting

**FFmpeg loading issues**: Refresh browser, check console
**Transcription errors**: Verify OpenAI API key and credits
**Large files**: Consider pre-converting to MP3 for faster processing
**QNAP deployment**: Ensure Container Station has sufficient RAM (4GB+)
