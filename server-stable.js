const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-this';

console.log('🚀 Starting Transcription Server...');
console.log('📊 Environment Check:');
console.log(`   PORT: ${PORT}`);
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
app.use(express.static('public'));

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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// Simple transcription endpoint
app.post('/api/transcribe', requireSimpleAuth, upload.single('file'), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📄 Processing file: ${req.file.originalname}`);
    
    // For now, just handle audio files directly (no video conversion)
    if (!req.file.mimetype.startsWith('audio/')) {
      return res.status(400).json({ error: 'Please upload audio files only for now (MP3, WAV, M4A)' });
    }

    // Check file size
    if (req.file.size > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio file too large. Please keep under 25MB.' });
    }

    // Transcribe with OpenAI
    const FormData = require('form-data');
    const formData = new FormData();
    
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    console.log('🤖 Sending to OpenAI...');
    
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      timeout: 300000 // 5 minutes
    });

    const transcription = response.data.text;
    
    // Save transcription
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const transcriptionFilename = `${baseName}_transcription_${timestamp}.txt`;
    const transcriptionPath = path.join('uploads', transcriptionFilename);
    
    const content = `Transcription for: ${req.file.originalname}\nGenerated: ${new Date().toISOString()}\n\n${transcription}`;
    fs.writeFileSync(transcriptionPath, content, 'utf8');

    console.log('✅ Transcription completed');

    res.json({
      success: true,
      message: 'Transcription completed',
      transcription: transcription,
      originalFile: req.file.filename,
      transcriptionFile: transcriptionFilename
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({
      error: 'Transcription failed',
      details: error.message
    });
  }
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
const server = app.listen(PORT, () => {
  console.log('🎉 Server started successfully!');
  console.log(`🌐 Running on port ${PORT}`);
  console.log(`🌍 Binding: 0.0.0.0:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('🎵 Ready for transcriptions!');
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
});