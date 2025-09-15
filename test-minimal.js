const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 MINIMAL SERVER TEST');
console.log(`PORT from Railway: ${PORT}`);
console.log(`Raw process.env.PORT: ${process.env.PORT}`);

app.get('/', (req, res) => {
  res.json({ 
    message: 'SUCCESS! Railway is working!', 
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', port: PORT });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ MINIMAL SERVER running on 0.0.0.0:${PORT}`);
  console.log('🎯 If Railway works, you should see this message at your URL');
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

console.log('⏰ Server startup completed');