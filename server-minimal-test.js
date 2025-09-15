const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting MINIMAL test server...');
console.log(`📍 PORT: ${PORT}`);
console.log(`🔑 OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`🔐 ACCESS_PASSWORD: ${process.env.ACCESS_PASSWORD ? 'SET' : 'NOT SET'}`);

// Minimal middleware
app.use(express.json());
app.use(express.static('public'));

// Test route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Transcription App - Test</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            .status { padding: 20px; margin: 10px 0; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; }
            .info { background: #d1ecf1; color: #0c5460; }
        </style>
    </head>
    <body>
        <h1>🎙️ Transcription App</h1>
        <div class="status success">✅ Server is running!</div>
        <div class="status info">
            <strong>Environment:</strong><br>
            Port: ${PORT}<br>
            OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not set'}<br>
            Access Password: ${process.env.ACCESS_PASSWORD ? '✅ Configured' : '❌ Not set'}<br>
            JWT Secret: ${process.env.JWT_SECRET ? '✅ Configured' : '❌ Not set'}
        </div>
        <p>🎯 If you see this page, the server is working correctly!</p>
        <p>📝 Next step: Add authentication and transcription features.</p>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: PORT,
    env_check: {
      openai: !!process.env.OPENAI_API_KEY,
      password: !!process.env.ACCESS_PASSWORD,
      jwt: !!process.env.JWT_SECRET
    }
  });
});

app.get('/test', (req, res) => {
  res.json({
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).send('Server error: ' + error.message);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', (error) => {
  if (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
  
  console.log('✅ Server started successfully!');
  console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully');  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('🎯 Minimal server setup complete, waiting for connections...');