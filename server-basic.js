const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-this';

// Debug environment variables
console.log('Environment variables check:');
console.log('PORT:', PORT);
console.log('OPENAI_API_KEY:', OPENAI_API_KEY ? 'SET' : 'NOT SET');
console.log('ACCESS_PASSWORD:', ACCESS_PASSWORD !== 'changeme' ? 'SET' : 'NOT SET (using default)');
console.log('JWT_SECRET:', JWT_SECRET !== 'your-jwt-secret-change-this' ? 'SET' : 'NOT SET (using default)');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('All environment variables:');
Object.keys(process.env).forEach(key => {
  if (key.includes('API') || key.includes('PASSWORD') || key.includes('SECRET') || key.includes('NODE_ENV')) {
    console.log(`${key}: ${process.env[key] ? 'SET' : 'NOT SET'}`);
  }
});
const execAsync = promisify(exec);

// Basic middleware
app.use(express.json());
app.use(express.static('public'));

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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `video_${timestamp}_${file.originalname}`);
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
}

function requireSimpleAuth(req, res, next) {
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
}

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    env: {
      port: PORT,
      hasOpenAI: !!OPENAI_API_KEY,
      hasPassword: ACCESS_PASSWORD !== 'changeme',
      hasJWT: JWT_SECRET !== 'your-jwt-secret-change-this',
      nodeEnv: process.env.NODE_ENV || 'not set'
    }
  });
});

// Debug endpoint to check environment variables (public for now)
app.get('/debug/env', (req, res) => {
  const envVars = {};
  Object.keys(process.env).forEach(key => {
    // Only show non-sensitive info
    if (key.includes('PORT') || key.includes('NODE_ENV') || key.includes('RAILWAY')) {
      envVars[key] = process.env[key];
    } else if (key.includes('API') || key.includes('PASSWORD') || key.includes('SECRET')) {
      envVars[key] = process.env[key] ? '***SET***' : 'NOT SET';
    }
  });
  
  res.json({
    environment: envVars,
    processEnvKeys: Object.keys(process.env).length
  });
});

// Simple authentication endpoint
app.post('/api/auth/simple', authenticateSimple);

// Authentication check endpoint
app.get('/api/auth/check', requireSimpleAuth, (req, res) => {
  res.json({ 
    authenticated: true,
    timestamp: req.auth.timestamp
  });
});

// Protected API routes
app.get('/api/server-files', requireSimpleAuth, (req, res) => {
  try {
    const uploadsDir = './uploads';
    
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ files: [] });
    }
    
    const files = fs.readdirSync(uploadsDir)
      .filter(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        return stats.isFile() && /\.(mp4|avi|mov|wmv|mkv|webm|mp3|wav|m4a|aac|txt)$/i.test(file);
      })
      .map(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          isTranscription: file.includes('_transcription_')
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    res.json({ files });
  } catch (error) {
    console.error('Error listing server files:', error);
    res.status(500).json({ error: 'Failed to list server files' });
  }
});

// Extract audio from video using FFmpeg
async function extractAudio(inputPath, outputPath) {
  const command = `ffmpeg -i "${inputPath}" -vn -acodec mp3 -ab 64k -ac 1 -ar 22050 -y "${outputPath}"`;
  
  console.log('Running FFmpeg command:', command);
  
  try {
    const { stdout, stderr } = await execAsync(command);
    console.log('FFmpeg completed successfully');
    return true;
  } catch (error) {
    console.error('FFmpeg error:', error);
    throw new Error(`Audio extraction failed: ${error.message}`);
  }
}

// Transcribe a single audio file
async function transcribeSingleFile(audioPath) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  const stats = fs.statSync(audioPath);
  
  if (stats.size > 25 * 1024 * 1024) {
    throw new Error(`File exceeds 25MB Whisper limit`);
  }
  
  formData.append('file', fs.createReadStream(audioPath), {
    filename: path.basename(audioPath),
    contentType: 'audio/mp3'
  });
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');
  
  const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      ...formData.getHeaders()
    },
    timeout: 600000
  });
  
  return response.data.text;
}

// Save transcription to file
function saveTranscriptionToFile(transcription, originalFilename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(originalFilename, path.extname(originalFilename));
  const transcriptionFilename = `${baseName}_transcription_${timestamp}.txt`;
  const transcriptionPath = path.join('uploads', transcriptionFilename);
  
  const content = `Transcription for: ${originalFilename}\nGenerated: ${new Date().toISOString()}\n\n${transcription}`;
  
  fs.writeFileSync(transcriptionPath, content, 'utf8');
  
  return transcriptionFilename;
}

// Upload and transcribe endpoint (protected)
app.post('/api/transcribe', requireSimpleAuth, upload.single('file'), async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }
  
  let audioPath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`Processing file: ${req.file.originalname}`);
    
    const isAudio = req.file.mimetype.startsWith('audio/');
    
    if (isAudio) {
      audioPath = req.file.path;
    } else {
      audioPath = path.join('uploads', `server_audio_${Date.now()}.mp3`);
      await extractAudio(req.file.path, audioPath);
    }
    
    const transcription = await transcribeSingleFile(audioPath);
    const transcriptionFile = saveTranscriptionToFile(transcription, req.file.originalname);
    
    res.json({
      success: true,
      message: 'Transcription completed',
      transcription: transcription,
      originalFile: req.file.filename,
      transcriptionFile: transcriptionFile
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: 'Transcription failed',
      details: error.message
    });
    
  } finally {
    // Clean up temporary audio file if it was extracted from video
    if (audioPath && audioPath !== req.file?.path) {
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    }
  }
});

// Process server file endpoint (protected)
app.post('/api/transcribe-server-file', requireSimpleAuth, async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }
  
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'No filename provided' });
    }
    
    const filePath = path.join('uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const ext = path.extname(filename).toLowerCase();
    const isAudio = ['.mp3', '.wav', '.m4a', '.aac'].includes(ext);
    
    let audioPath = filePath;
    let tempAudioPath = null;
    
    if (!isAudio) {
      tempAudioPath = path.join('uploads', `audio_${Date.now()}.mp3`);
      await extractAudio(filePath, tempAudioPath);
      audioPath = tempAudioPath;
    }
    
    const transcription = await transcribeSingleFile(audioPath);
    const transcriptionFile = saveTranscriptionToFile(transcription, filename);
    
    // Cleanup
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }
    
    res.json({
      success: true,
      message: 'Transcription completed',
      transcription: transcription,
      transcriptionFile: transcriptionFile
    });
    
  } catch (error) {
    console.error('Server file transcription error:', error);
    res.status(500).json({
      error: 'Transcription failed',
      details: error.message
    });
  }
});

// Download transcription endpoint (protected)
app.get('/api/download/:filename', requireSimpleAuth, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('uploads', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  if (!OPENAI_API_KEY) {
    console.warn('WARNING: OPENAI_API_KEY not set!');
  }
  
  if (!process.env.ACCESS_PASSWORD || process.env.ACCESS_PASSWORD === 'changeme') {
    console.warn('WARNING: Using default ACCESS_PASSWORD. Please set a secure password!');
  }
});