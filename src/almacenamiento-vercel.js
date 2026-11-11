const { Redis } = require('@upstash/redis');
const { head, BlobNotFoundError } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');
const { original } = require('./almacenamiento');

const namespace = 'diplomas:' + (process.env.VERCEL_ENV || 'preview');
const templateKey = namespace + ':plantilla';
const prefix = namespace.replace(':', '/') + '/';
const maxUploadSize = 12 * 1024 * 1024;
let redis;

function database() {
  if (!redis) {
    const upstash = {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    const integration = {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    };
    const credentials = [upstash, integration].find(({ url, token }) => url && token);
    if (!credentials) {
      throw Object.assign(new Error('Falta conectar Upstash Redis en el entorno Production de Vercel.'), { status: 503 });
    }
    redis = new Redis(credentials);
  }
  return redis;
}

function isTemplatePath(pathname) {
  return typeof pathname === 'string' && pathname.startsWith(prefix) &&
    /^[a-f0-9-]{36}\.png$/.test(pathname.slice(prefix.length));
}

async function readTemplate() {
  const stored = await database().get(templateKey);
  if (!stored) return original;
  return stored.removed ? null : stored;
}

function writeTemplate(template) {
  return database().set(templateKey, template ?? { removed: true });
}

async function resolveTemplate(pathname) {
  if (!isTemplatePath(pathname)) return null;
  try {
    const blob = await head(pathname);
    if (blob.contentType !== 'image/png' || blob.size > maxUploadSize || blob.size < 33) return null;
    return { pathname, url: blob.url };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

async function authorizeUpload(request, body) {
  if (body.type !== 'blob.generate-client-token' || !isTemplatePath(body.payload?.pathname)) {
    throw Object.assign(new Error('La ruta de la plantilla no es válida.'), { status: 400 });
  }
  return handleUpload({
    request,
    body,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: ['image/png'],
      maximumSizeInBytes: maxUploadSize,
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: Date.now() + 5 * 60 * 1000,
    }),
  });
}

function sessionKey(token) {
  return namespace + ':sesion:' + token;
}

function attemptKey(address) {
  return namespace + ':intentos:' + address;
}

function createSession(token, duration) {
  return database().set(sessionKey(token), 1, { ex: duration });
}

async function isAdmin(token) {
  return !!token && !!await database().exists(sessionKey(token));
}

async function logout(token) {
  if (token) await database().del(sessionKey(token));
}

function countAttempt(address) {
  return database().eval(
    "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 300) end; return n",
    [attemptKey(address)],
    [],
  );
}

function clearAttempts(address) {
  return database().del(attemptKey(address));
}

module.exports = { prefix, readTemplate, writeTemplate, resolveTemplate, authorizeUpload, createSession, isAdmin, logout, countAttempt, clearAttempts };
