const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-this';

console.log('🚀 Starting Transcription Server...');
console.log('📊 Environment Check:');
console.log(`   PORT: ${PORT}`);
console.log(`   process.env.PORT: ${process.env.PORT}`);
console.log(`   Railway PORT env: ${process.env.PORT || 'NOT SET'}`);
console.log(`   OPENAI_API_KEY: ${OPENAI_API_KEY ? '✅ SET' : '❌ NOT SET'}`);
console.log(`   ACCESS_PASSWORD: ${ACCESS_PASSWORD !== 'changeme' ? '✅ SET' : '❌ NOT SET'}`);
console.log(`   JWT_SECRET: ${JWT_SECRET !== 'your-jwt-secret-change-this' ? '✅ SET' : '❌ NOT SET'}`);

// Basic middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
  console.log('📁 Created uploads directory');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `upload_${timestamp}_${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1500 * 1024 * 1024 // 1.5GB limit
  }
});

// Simple auth functions
function authenticateSimple(req, res) {
  try {
    const { password } = req.body;
    
    if (password === ACCESS_PASSWORD) {
      const token = jwt.sign(
        { authenticated: true, timestamp: Date.now() },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

function requireSimpleAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid token' });
      }
      
      req.auth = decoded;
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

// Basic routes
app.get('/', (req, res) => {
  res.send('Transcription App is Running!');
});

app.get('/test', (req, res) => {
  res.send('OK');
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });
});

app.post('/api/auth/simple', authenticateSimple);

app.get('/api/auth/check', requireSimpleAuth, (req, res) => {
  res.json({ 
    authenticated: true,
    timestamp: req.auth.timestamp
  });
});

app.get('/api/server-files', requireSimpleAuth, (req, res) => {
  try {
    const uploadsDir = './uploads';
    
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ files: [] });
    }
    
    const files = fs.readdirSync(uploadsDir)
      .filter(file => {
        try {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          return stats.isFile() && /\.(mp4|avi|mov|wmv|mkv|webm|mp3|wav|m4a|aac|txt)$/i.test(file);
        } catch (e) {
          return false;
        }
      })
      .map(file => {
        try {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            isTranscription: file.includes('_transcription_')
          };
        } catch (e) {
          return null;
        }
      })
      .filter(file => file !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    res.json({ files });
  } catch (error) {
    console.error('Error listing server files:', error);
    res.status(500).json({ error: 'Failed to list server files' });
  }
});

// Extract audio from video using FFmpeg
async function extractAudio(inputPath, outputPath, progressId) {
  const command = `ffmpeg -i "${inputPath}" -vn -acodec mp3 -ab 64k -ac 1 -ar 22050 -y "${outputPath}"`;
  
  console.log('🎬 Extracting audio with FFmpeg...');
  sendProgress(progressId, 'Extracting audio from video...', 'info');
  
  try {
    const { stdout, stderr } = await execAsync(command);
    console.log('✅ Audio extraction completed');
    sendProgress(progressId, 'Audio extraction completed', 'success');
    return true;
  } catch (error) {
    console.error('❌ FFmpeg error:', error);
    sendProgress(progressId, `Audio extraction failed: ${error.message}`, 'error');
    throw new Error(`Audio extraction failed: ${error.message}`);
  }
}

// Split audio into chunks
async function splitAudioIntoChunks(audioPath, progressId, maxSizeMB = 24) {
  const stats = fs.statSync(audioPath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  if (fileSizeMB <= maxSizeMB) {
    return [audioPath];
  }
  
  console.log(`📊 File size: ${fileSizeMB.toFixed(2)}MB, splitting into chunks...`);
  sendProgress(progressId, `File size: ${fileSizeMB.toFixed(2)}MB, splitting into chunks...`, 'info');
  
  // Get audio duration
  const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
  const { stdout: duration } = await execAsync(durationCommand);
  const totalDuration = parseFloat(duration);
  
  // Calculate chunk duration to get files under maxSizeMB
  const numChunks = Math.ceil(fileSizeMB / maxSizeMB);
  const chunkDuration = Math.floor(totalDuration / numChunks);
  
  const chunks = [];
  const baseDir = path.dirname(audioPath);
  const baseName = path.basename(audioPath, path.extname(audioPath));
  
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const chunkPath = path.join(baseDir, `${baseName}_chunk_${i + 1}.mp3`);
    
    const splitCommand = `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${chunkDuration} -acodec copy -y "${chunkPath}"`;
    
    console.log(`🔪 Creating chunk ${i + 1}/${numChunks}...`);
    sendProgress(progressId, `Creating chunk ${i + 1}/${numChunks}...`, 'info');
    await execAsync(splitCommand);
    
    chunks.push(chunkPath);
  }
  
  console.log(`✅ Split into ${chunks.length} chunks`);
  sendProgress(progressId, `Split into ${chunks.length} chunks`, 'success');
  return chunks;
}

// Transcribe multiple audio chunks
async function transcribeChunks(chunks, progressId) {
  const FormData = require('form-data');
  const transcriptions = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`🎙️ Transcribing chunk ${i + 1}/${chunks.length}...`);
    sendProgress(progressId, `Transcribing chunk ${i + 1}/${chunks.length}...`, 'info');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(chunks[i]), {
      filename: path.basename(chunks[i]),
      contentType: 'audio/mp3'
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');
    
    try {
      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders()
        },
        timeout: 600000
      });
      
      transcriptions.push(response.data.text);
    } catch (error) {
      console.error(`❌ Error transcribing chunk ${i + 1}:`, error);
      throw error;
    }
  }
  
  return transcriptions.join(' ');
}

// Progress tracking for SSE
const progressClients = new Map();

// SSE endpoint for progress updates
app.get('/api/progress/:id', requireSimpleAuth, (req, res) => {
  const { id } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  progressClients.set(id, res);
  
  req.on('close', () => {
    progressClients.delete(id);
  });
});

// Helper to send progress updates
function sendProgress(id, message, type = 'info') {
  const client = progressClients.get(id);
  if (client) {
    client.write(`data: ${JSON.stringify({ message, type, timestamp: new Date().toISOString() })}\n\n`);
  }
}

// Enhanced transcription endpoint with video support and chunking
app.post('/api/transcribe', requireSimpleAuth, upload.single('file'), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique ID for this transcription
    const progressId = `transcribe_${Date.now()}`;
    
    console.log(`📄 Processing file: ${req.file.originalname}`);
    sendProgress(progressId, `Processing file: ${req.file.originalname}`, 'info');
    
    // Send progress ID immediately and let client connect to SSE
    res.json({ progressId, message: 'Processing started' });
    
    // Process async after response
    setTimeout(async () => {
    
    let audioPath = req.file.path;
    let tempFiles = [];
    
    try {
      // Check if it's a video file
      const isVideo = req.file.mimetype.startsWith('video/');
      const isAudio = req.file.mimetype.startsWith('audio/');
      
      if (!isVideo && !isAudio) {
        return res.status(400).json({ error: 'Please upload video or audio files only' });
      }
      
      // Extract audio from video if needed
      if (isVideo) {
        audioPath = path.join('uploads', `audio_${Date.now()}.mp3`);
        tempFiles.push(audioPath);
        await extractAudio(req.file.path, audioPath, progressId);
      }
      
      // Split audio into chunks if needed
      const chunks = await splitAudioIntoChunks(audioPath, progressId);
      
      // Add chunk files to temp files for cleanup
      if (chunks.length > 1) {
        tempFiles.push(...chunks);
      }
      
      // Transcribe all chunks
      console.log('🤖 Starting transcription...');
      sendProgress(progressId, 'Starting transcription...', 'info');
      const transcription = await transcribeChunks(chunks, progressId);
    
    // Save transcription
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const transcriptionFilename = `${baseName}_transcription_${timestamp}.txt`;
    const transcriptionPath = path.join('uploads', transcriptionFilename);
    
    const content = `Transcription for: ${req.file.originalname}\nGenerated: ${new Date().toISOString()}\n\n${transcription}`;
    fs.writeFileSync(transcriptionPath, content, 'utf8');

    console.log('✅ Transcription completed');
    sendProgress(progressId, 'Transcription completed!', 'success');
    
    // Send final result
    sendProgress(progressId, JSON.stringify({
      success: true,
      transcription: transcription,
      originalFile: req.file.filename,
      transcriptionFile: transcriptionFilename
    }), 'complete');
    
    // Close SSE connection
    setTimeout(() => {
      const client = progressClients.get(progressId);
      if (client) {
        client.end();
        progressClients.delete(progressId);
      }
    }, 1000);
        success: true,
        message: 'Transcription completed',
        transcription: transcription,
        originalFile: req.file.filename,
        transcriptionFile: transcriptionFilename
      });

    } finally {
      // Cleanup temporary files
      for (const tempFile of tempFiles) {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            console.log(`🧹 Cleaned up: ${path.basename(tempFile)}`);
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
    }

  } catch (error) {
    console.error('❌ Transcription error:', error);
    sendProgress(progressId, `Transcription failed: ${error.message}`, 'error');
    
    // Close SSE connection on error
    setTimeout(() => {
      const client = progressClients.get(progressId);
      if (client) {
        client.end();
        progressClients.delete(progressId);
      }
    }, 1000);
  }
    }, 100); // Small delay to let client connect to SSE
  } catch (error) {
    console.error('❌ Initial error:', error);
    res.status(500).json({
      error: 'Failed to start processing',
      details: error.message
    });
  }
});

// Catch-all route for debugging
app.get('*', (req, res) => {
  console.log(`Unhandled route: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start server - Railway needs this specific binding
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🎉 Server started successfully!');
  console.log(`🌐 Running on port ${PORT}`);
  console.log(`🌍 Binding: 0.0.0.0:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('🎵 Ready for transcriptions!');
  
  // Test if server is really listening
  const address = server.address();
  console.log(`📡 Server actually listening on: ${address.address}:${address.port}`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit on uncaught exceptions - let Railway handle it
});