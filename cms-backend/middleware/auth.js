/**
 * JWT Authentication middleware
 */
const jwt = require('jsonwebtoken');

// JWT secret key - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'cms-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * Generate JWT token
 * @param {Object} payload - Token payload
 * @param {string} type - 'admin' or 'driver'
 * @returns {string} - JWT token
 */
function generateToken(payload, type) {
    return jwt.sign({ ...payload, type }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded payload or null if invalid
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Extract token from Authorization header
 * @param {Object} req - Express request
 * @returns {string|null} - Token or null
 */
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return null;
}

/**
 * Requires admin authentication
 */
function requireAdmin(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'admin') {
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    req.admin = decoded;
    next();
}

/**
 * Requires driver authentication
 */
function requireDriver(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'driver') {
        return res.status(401).json({ error: 'Driver authentication required' });
    }

    req.driver = decoded;
    next();
}

/**
 * Requires any authenticated user (admin or driver)
 */
function requireAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
}

module.exports = {
    generateToken,
    verifyToken,
    requireAdmin,
    requireDriver,
    requireAuth,
    JWT_SECRET
};
