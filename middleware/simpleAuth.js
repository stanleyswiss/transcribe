const jwt = require('jsonwebtoken');

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-this';

// Simple password authentication
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

// Middleware to verify JWT token
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

module.exports = {
    authenticateSimple,
    requireSimpleAuth
};