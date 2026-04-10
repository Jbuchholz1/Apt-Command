const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;

// Microsoft's JWKS endpoint for token signature verification
const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,           // Cache signing keys
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

function getSigningKey(header, callback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Express middleware that validates Microsoft Entra ID JWT tokens.
 * Rejects requests with missing or invalid tokens with 401.
 */
function requireAuth(req, res, next) {
  // Skip auth if env vars are not configured (local dev only — blocked in production)
  if (!TENANT_ID || !CLIENT_ID) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[AUTH] FATAL: AZURE_TENANT_ID and AZURE_CLIENT_ID must be set in production');
      return res.status(500).json({ error: 'Server misconfigured — authentication not available' });
    }
    console.warn('[AUTH] Azure credentials not configured — skipping auth (dev mode)');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }

  const token = authHeader.slice(7);

  const options = {
    algorithms: ['RS256'],
    issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
    audience: CLIENT_ID,
  };

  jwt.verify(token, getSigningKey, options, (err, decoded) => {
    if (err) {
      console.error('[AUTH] Token validation failed:', err.message);
      return res.status(401).json({ error: 'Unauthorized — invalid token' });
    }
    // Token is valid — attach user info to request
    req.user = {
      id: decoded.oid,       // Object ID
      name: decoded.name,
      email: decoded.preferred_username,
    };
    next();
  });
}

module.exports = { requireAuth };
