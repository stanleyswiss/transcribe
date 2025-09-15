const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const execAsync = promisify(exec);

// Middleware
app.use(cors());
app.use(express.json());
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
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
  // Estimate: 64kbps = ~8KB/s, so 15MB = ~1875 seconds = ~31 minutes
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

// Main transcription endpoint
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  let tempAudioPath = null;
  let chunkFiles = [];
  let chunksDir = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log(`\n=== Processing file: ${req.file.filename} ===`);
    console.log(`Size: ${Math.round(req.file.size / 1024 / 1024)}MB, Type: ${req.file.mimetype}`);

    let audioPath = req.file.path;

    // Convert video to audio if necessary
    if (!isAudioFile(req.file.mimetype)) {
      console.log('Video file detected, extracting audio...');
      tempAudioPath = path.join('uploads', `audio_${Date.now()}.mp3`);
      
      await extractAudio(req.file.path, tempAudioPath);
      audioPath = tempAudioPath;
      console.log('Audio extraction completed');
    } else {
      console.log('Audio file detected, proceeding to transcription');
    }

    // Split audio into chunks if needed
    console.log('Checking if audio needs to be chunked...');
    chunkFiles = await splitAudioIntoChunks(audioPath, 'uploads');
    
    if (chunkFiles.length > 1) {
      chunksDir = path.dirname(chunkFiles[0]);
      console.log(`Audio split into ${chunkFiles.length} chunks`);
    }

    // Transcribe all chunks
    console.log('Starting transcription process...');
    const transcriptions = [];
    
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkPath = chunkFiles[i];
      console.log(`\n--- Processing chunk ${i + 1}/${chunkFiles.length} ---`);
      
      const chunkTranscription = await transcribeSingleFile(chunkPath, i + 1);
      transcriptions.push(chunkTranscription);
      
      console.log(`Chunk ${i + 1} transcription: ${chunkTranscription.substring(0, 100)}...`);
    }

    // Combine all transcriptions
    const fullTranscription = transcriptions.join('\n\n');
    console.log(`\n=== Transcription completed ===`);
    console.log(`Total chunks: ${chunkFiles.length}`);
    console.log(`Total text length: ${fullTranscription.length} characters`);

    // Save transcription to file
    const transcriptionFilename = saveTranscriptionToFile(fullTranscription, req.file.originalname);

    // Clean up temporary files
    const filesToCleanup = [req.file.path];
    if (tempAudioPath && tempAudioPath !== audioPath) {
      filesToCleanup.push(tempAudioPath);
    }
    if (chunksDir) {
      filesToCleanup.push(chunksDir);
    }
    
    cleanupFiles(filesToCleanup);

    res.json({
      success: true,
      transcription: fullTranscription,
      filename: req.file.originalname,
      fileType: isAudioFile(req.file.mimetype) ? 'audio' : 'video',
      chunksProcessed: chunkFiles.length,
      transcriptionFile: transcriptionFilename,
      savedToFile: true
    });

  } catch (error) {
    console.error('\n=== Transcription Error ===');
    console.error('Error:', error.message);
    
    // Clean up files on error
    const filesToCleanup = [req.file?.path, tempAudioPath, chunksDir].filter(Boolean);
    cleanupFiles(filesToCleanup);

    if (error.response) {
      res.status(error.response.status).json({
        error: 'Transcription service error',
        details: error.response.data
      });
    } else {
      res.status(500).json({
        error: 'Processing failed',
        details: error.message
      });
    }
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Transcription server running on port ${PORT}`);
  console.log(`Access the app at: http://localhost:${PORT}`);
  
  // Check FFmpeg installation
  exec('ffmpeg -version', (error, stdout, stderr) => {
    if (error) {
      console.warn('⚠️  WARNING: FFmpeg not found. Video conversion will not work.');
    } else {
      console.log('✅ FFmpeg available');
    }
  });
  
  if (!OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY environment variable not set');
  } else {
    console.log('✅ OpenAI API key configured');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});
