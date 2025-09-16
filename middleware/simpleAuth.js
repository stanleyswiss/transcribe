const jwt = require('jsonwebtoken');

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

if (!ACCESS_PASSWORD) {
  console.error('❌ CRITICAL: ACCESS_PASSWORD environment variable is not set!');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET environment variable is not set!');
  process.exit(1);
}

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

module.exports = { authenticateSimple, requireSimpleAuth };