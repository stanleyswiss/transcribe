require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const execAsync = promisify(exec);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.clerk.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.clerk.com", "https://*.clerk.accounts.dev"],
      frameSrc: ["https://accounts.clerk.dev"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://your-domain.com']
    : true,
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use('/api/', limiter);

// Serve static files (login page will be served from here)
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
    fileSize: 1500 * 1024 * 1024 // 1.5GB limit for videos
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/mkv', 'video/webm',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac'
    ];
    if (allowedTypes.some(type => file.mimetype.includes(type.split('/')[1]))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload video or audio files only.'));
    }
  }
});

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Authentication check endpoint
app.get('/api/auth/check', ClerkExpressRequireAuth(), (req, res) => {
  res.json({ 
    authenticated: true, 
    userId: req.auth.userId,
    sessionId: req.auth.sessionId
  });
});

// Protected API routes
app.get('/api/server-files', ClerkExpressRequireAuth(), (req, res) => {
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
    if (stderr) console.log('FFmpeg stderr:', stderr);
    return true;
  } catch (error) {
    console.error('FFmpeg error:', error);
    throw new Error(`Audio extraction failed: ${error.message}`);
  }
}

// Split audio into chunks if too large
async function splitAudioIntoChunks(audioPath, outputDir) {
  const stats = fs.statSync(audioPath);
  const fileSizeMB = Math.round(stats.size / 1024 / 1024);
  
  console.log(`Audio file size: ${fileSizeMB}MB`);
  
  // If file is under 20MB, no need to split
  if (stats.size < 20 * 1024 * 1024) {
    console.log('File is small enough, no chunking needed');
    return [audioPath];
  }
  
  console.log('File too large, splitting into chunks...');
  
  // Create chunks directory
  const chunksDir = path.join(outputDir, 'chunks_' + Date.now());
  if (!fs.existsSync(chunksDir)) {
    fs.mkdirSync(chunksDir, { recursive: true });
  }
  
  // Calculate chunk duration (aim for ~15MB chunks to stay well under 25MB limit)
  const chunkDurationSeconds = 1800; // 30 minutes per chunk
  
  const outputPattern = path.join(chunksDir, 'chunk_%03d.mp3');
  
  // Split audio using FFmpeg
  const splitCommand = `ffmpeg -i "${audioPath}" -f segment -segment_time ${chunkDurationSeconds} -c copy "${outputPattern}"`;
  
  console.log('Splitting audio with command:', splitCommand);
  
  try {
    const { stdout, stderr } = await execAsync(splitCommand);
    console.log('Audio splitting completed');
    if (stderr) console.log('Split stderr:', stderr);
    
    // Get list of generated chunks
    const chunkFiles = fs.readdirSync(chunksDir)
      .filter(file => file.startsWith('chunk_') && file.endsWith('.mp3'))
      .sort()
      .map(file => path.join(chunksDir, file));
    
    console.log(`Created ${chunkFiles.length} chunks:`, chunkFiles.map(f => path.basename(f)));
    
    return chunkFiles;
    
  } catch (error) {
    console.error('Audio splitting error:', error);
    throw new Error(`Audio splitting failed: ${error.message}`);
  }
}

// Transcribe a single audio file
async function transcribeSingleFile(audioPath, chunkIndex = null) {
  const FormData = require('form-data');
  const formData = new FormData();
  
  const stats = fs.statSync(audioPath);
  const fileSizeMB = Math.round(stats.size / 1024 / 1024);
  
  console.log(`Transcribing ${chunkIndex ? `chunk ${chunkIndex}` : 'file'}: ${path.basename(audioPath)} (${fileSizeMB}MB)`);
  
  if (stats.size > 25 * 1024 * 1024) {
    throw new Error(`File ${path.basename(audioPath)} is ${fileSizeMB}MB, exceeds 25MB Whisper limit`);
  }
  
  formData.append('file', fs.createReadStream(audioPath), {
    filename: path.basename(audioPath),
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
      timeout: 600000 // 10 minutes timeout
    });
    
    console.log(`Transcription completed for ${chunkIndex ? `chunk ${chunkIndex}` : 'file'}`);
    return response.data.text;
    
  } catch (error) {
    console.error(`Transcription error for ${path.basename(audioPath)}:`, error.message);
    throw error;
  }
}

// Save transcription to file
function saveTranscriptionToFile(transcription, originalFilename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(originalFilename, path.extname(originalFilename));
  const transcriptionFilename = `${baseName}_transcription_${timestamp}.txt`;
  const transcriptionPath = path.join('uploads', transcriptionFilename);
  
  const content = `Transcription for: ${originalFilename}\nGenerated: ${new Date().toISOString()}\n\n${transcription}`;
  
  fs.writeFileSync(transcriptionPath, content, 'utf8');
  console.log(`Transcription saved to: ${transcriptionPath}`);
  
  return transcriptionFilename;
}

// Clean up temporary files
function cleanupFiles(filesToDelete) {
  filesToDelete.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
        console.log(`Cleaned up: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error cleaning up ${filePath}:`, error.message);
    }
  });
}

// Check if file is already audio
function isAudioFile(mimetype) {
  return mimetype.startsWith('audio/');
}

// Helper function to process local server files
async function processServerFileForTranscription(filePath, originalFilename) {
  let tempAudioPath = null;
  let chunkFiles = [];
  let chunksDir = null;
  
  try {
    console.log(`\n=== Processing server file: ${originalFilename} ===`);
    console.log(`Path: ${filePath}`);
    
    const stats = fs.statSync(filePath);
    console.log(`Size: ${Math.round(stats.size / 1024 / 1024)}MB`);
    
    // Determine if it's audio or video based on file extension
    const ext = path.extname(originalFilename).toLowerCase();
    const isAudio = ['.mp3', '.wav', '.m4a', '.aac'].includes(ext);
    
    let audioPath = filePath;
    
    // If it's a video, extract audio
    if (!isAudio) {
      console.log('Video file detected, extracting audio...');
      tempAudioPath = path.join('uploads', `audio_${Date.now()}.mp3`);
      await extractAudio(filePath, tempAudioPath);
      audioPath = tempAudioPath;
      console.log(`Audio extracted to: ${tempAudioPath}`);
    } else {
      console.log('Audio file detected, no extraction needed');
    }
    
    // Split audio if needed
    chunkFiles = await splitAudioIntoChunks(audioPath, 'uploads');
    
    let fullTranscription = '';
    
    // Transcribe each chunk
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunk = chunkFiles[i];
      const chunkTranscription = await transcribeSingleFile(chunk, i + 1);
      fullTranscription += (i > 0 ? '\n\n' : '') + chunkTranscription;
    }
    
    // Save transcription
    const transcriptionFile = saveTranscriptionToFile(fullTranscription, originalFilename);
    
    return {
      success: true,
      transcriptionFile: transcriptionFile,
      transcription: fullTranscription
    };
    
  } finally {
    // Clean up temporary files
    const filesToClean = [];
    
    if (tempAudioPath) filesToClean.push(tempAudioPath);
    
    // If chunks were created and they're in a separate directory, clean them
    if (chunkFiles.length > 1) {
      chunksDir = path.dirname(chunkFiles[0]);
      if (chunksDir.includes('chunks_')) {
        filesToClean.push(chunksDir);
      }
    }
    
    if (filesToClean.length > 0) {
      console.log('Cleaning up temporary files...');
      cleanupFiles(filesToClean);
    }
  }
}

// Upload and transcribe endpoint (protected)
app.post('/api/transcribe', ClerkExpressRequireAuth(), upload.single('file'), async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }
  
  let audioPath = null;
  let chunkFiles = [];
  let chunksDir = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`\n=== New transcription request ===`);
    console.log(`User: ${req.auth.userId}`);
    console.log(`Original filename: ${req.file.originalname}`);
    console.log(`Uploaded filename: ${req.file.filename}`);
    console.log(`File size: ${Math.round(req.file.size / 1024 / 1024)}MB`);
    console.log(`Mimetype: ${req.file.mimetype}`);
    
    const isAudio = isAudioFile(req.file.mimetype);
    
    // Extract audio if video
    if (isAudio) {
      console.log('Audio file detected, no extraction needed');
      audioPath = req.file.path;
    } else {
      console.log('Video file detected, extracting audio...');
      audioPath = path.join('uploads', `server_audio_${Date.now()}.mp3`);
      await extractAudio(req.file.path, audioPath);
      console.log(`Audio extracted to: ${audioPath}`);
    }
    
    // Split audio if needed
    chunkFiles = await splitAudioIntoChunks(audioPath, 'uploads');
    
    let fullTranscription = '';
    
    // Transcribe each chunk
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunk = chunkFiles[i];
      const chunkTranscription = await transcribeSingleFile(chunk, i + 1);
      fullTranscription += (i > 0 ? '\n\n' : '') + chunkTranscription;
    }
    
    // Save transcription to file
    const transcriptionFile = saveTranscriptionToFile(fullTranscription, req.file.originalname);
    
    console.log('=== Transcription completed successfully ===\n');
    
    res.json({
      success: true,
      message: 'Transcription completed',
      transcription: fullTranscription,
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
    // Clean up temporary files
    const filesToClean = [];
    
    // Clean up extracted audio if it was from a video
    if (audioPath && audioPath !== req.file?.path) {
      filesToClean.push(audioPath);
    }
    
    // Clean up chunks if they were created in a separate directory
    if (chunkFiles.length > 1) {
      chunksDir = path.dirname(chunkFiles[0]);
      if (chunksDir.includes('chunks_')) {
        filesToClean.push(chunksDir);
      }
    }
    
    if (filesToClean.length > 0) {
      console.log('Cleaning up temporary files...');
      cleanupFiles(filesToClean);
    }
  }
});

// Process server file endpoint (protected)
app.post('/api/transcribe-server-file', ClerkExpressRequireAuth(), async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }
  
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'No filename provided' });
    }
    
    console.log(`\n=== Server file transcription request ===`);
    console.log(`User: ${req.auth.userId}`);
    console.log(`Requested file: ${filename}`);
    
    const filePath = path.join('uploads', filename);
    
    // Security check: ensure the file is within uploads directory
    const resolvedPath = path.resolve(filePath);
    const uploadsDir = path.resolve('uploads');
    if (!resolvedPath.startsWith(uploadsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const result = await processServerFileForTranscription(filePath, filename);
    
    console.log('=== Server file transcription completed successfully ===\n');
    
    res.json({
      success: true,
      message: 'Transcription completed',
      transcription: result.transcription,
      transcriptionFile: result.transcriptionFile
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
app.get('/api/download/:filename', ClerkExpressRequireAuth(), (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('uploads', filename);
  
  // Security check
  const resolvedPath = path.resolve(filePath);
  const uploadsDir = path.resolve('uploads');
  if (!resolvedPath.startsWith(uploadsDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(filePath);
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 1.5GB.' });
    }
  }
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
  
  if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    console.warn('WARNING: Clerk authentication keys not set!');
  }
});