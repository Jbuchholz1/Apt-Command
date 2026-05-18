const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { supabase } = require('../lib/db');

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const EXTERNAL_JWT_SECRET = process.env.EXTERNAL_JWT_SECRET;

const EXTERNAL_ISSUER = 'apt-req-board';
const EXTERNAL_AUDIENCE = 'apt-req-board-client';
const AZURE_ISSUER_PREFIX = 'https://login.microsoftonline.com/';

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

function verifyAzureToken(token) {
  return new Promise((resolve, reject) => {
    const options = {
      algorithms: ['RS256'],
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      audience: CLIENT_ID,
    };
    jwt.verify(token, getSigningKey, options, (err, decoded) => {
      if (err) return reject(err);
      resolve({
        id: decoded.oid,
        name: decoded.name,
        email: decoded.preferred_username,
        provider: 'azure',
      });
    });
  });
}

/**
 * Verifies an app-issued JWT for an external (non-Azure) user. Also verifies
 * the token's pwUpdatedAt claim matches the row's current password_updated_at,
 * so an admin password reset invalidates any outstanding tokens.
 */
async function verifyExternalToken(token) {
  if (!EXTERNAL_JWT_SECRET) {
    throw new Error('EXTERNAL_JWT_SECRET not configured');
  }
  const decoded = jwt.verify(token, EXTERNAL_JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: EXTERNAL_ISSUER,
    audience: EXTERNAL_AUDIENCE,
  });

  if (!decoded.email) throw new Error('External token missing email claim');

  // Compare the password timestamp claim to the live row. Mismatch ⇒ token
  // was issued before an admin reset and is no longer valid.
  if (supabase) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, auth_provider, is_active, password_updated_at')
      .ilike('email', decoded.email.toLowerCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('External user no longer exists');
    if (data.auth_provider !== 'external') throw new Error('User is not external');
    if (!data.is_active) throw new Error('User is inactive');
    const live = data.password_updated_at ? new Date(data.password_updated_at).getTime() : 0;
    const claim = Number(decoded.pwUpdatedAt) || 0;
    if (live !== claim) throw new Error('Token superseded by password change');

    return {
      id: data.id,
      name: data.full_name || decoded.name || data.email,
      email: data.email,
      provider: 'external',
    };
  }

  return {
    id: decoded.sub,
    name: decoded.name,
    email: decoded.email,
    provider: 'external',
  };
}

/**
 * Issue an external-user JWT. Lives in the auth module so the secret stays here.
 */
function issueExternalToken({ id, email, name, passwordUpdatedAt }) {
  if (!EXTERNAL_JWT_SECRET) {
    throw new Error('EXTERNAL_JWT_SECRET not configured');
  }
  const pwTs = passwordUpdatedAt ? new Date(passwordUpdatedAt).getTime() : 0;
  return jwt.sign(
    {
      sub: id,
      email,
      name,
      pwUpdatedAt: pwTs,
    },
    EXTERNAL_JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: EXTERNAL_ISSUER,
      audience: EXTERNAL_AUDIENCE,
      expiresIn: '8h',
    },
  );
}

/**
 * Express middleware that validates either a Microsoft Entra ID JWT or an
 * app-issued external-user JWT. Dispatches on the iss claim in the token
 * header. Rejects requests with missing or invalid tokens with 401.
 */
function requireAuth(req, res, next) {
  // Dev bypass — only when env is empty/development AND Azure creds are missing.
  if (!TENANT_ID || !CLIENT_ID) {
    const nodeEnv = process.env.NODE_ENV;
    const isLocalDev = !nodeEnv || nodeEnv === 'development';
    if (!isLocalDev) {
      console.error(`[AUTH] FATAL: AZURE_TENANT_ID and AZURE_CLIENT_ID must be set when NODE_ENV='${nodeEnv}'`);
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

  let decoded;
  try {
    decoded = jwt.decode(token, { complete: false });
  } catch {
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
  if (!decoded || !decoded.iss) {
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }

  const dispatch = decoded.iss === EXTERNAL_ISSUER
    ? verifyExternalToken(token)
    : decoded.iss.startsWith(AZURE_ISSUER_PREFIX)
      ? verifyAzureToken(token)
      : Promise.reject(new Error(`Unknown issuer: ${decoded.iss}`));

  dispatch
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((err) => {
      console.error('[AUTH] Token validation failed:', err.message);
      res.status(401).json({ error: 'Unauthorized — invalid token' });
    });
}

module.exports = {
  requireAuth,
  verifyAzureToken,
  verifyExternalToken,
  issueExternalToken,
  EXTERNAL_ISSUER,
};
