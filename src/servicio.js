const crypto = require('node:crypto');
const { promisify } = require('node:util');
const local = require('./almacenamiento');
const derivePassword = promisify(crypto.scrypt);

const adminEmail = 'irismaria.gomezcornejo@yahoo.com.ar';
const salt = 'dceb150a5a26cea0798526891d850047';
const defaultHash = 'da2543098368caf201bd0099361215c5a2ccc3896020cc8385ababf83802f37d6a5737ce7ce8880c994a395cffb47f30b0da374ee0fc6bb96a36abbd2b1af8d0';
const sessionDuration = 8 * 60 * 60;
const sessions = new Map();
const attempts = new Map();

function expiredEntries(entries, now) {
  for (const [key, entry] of entries) {
    if (entry.expires <= now) entries.delete(key);
  }
}

function localAttempt(address) {
  const now = Date.now();
  expiredEntries(attempts, now);
  const entry = attempts.get(address) ?? { count: 0, expires: now + 5 * 60 * 1000 };
  attempts.set(address, entry);
  return ++entry.count;
}

function validatePng(image) {
  if (typeof image !== 'string') return null;
  const png = Buffer.from(image, 'base64');
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (png.length < 33 || png.length > 12 * 1024 * 1024 ||
      !png.subarray(0, 8).equals(signature) || png.toString('ascii', 12, 16) !== 'IHDR' ||
      ![png.readUInt32BE(16), png.readUInt32BE(20)].every(size => size > 0 && size <= 4000)) {
    return null;
  }
  return { image: png.toString('base64') };
}

function createService(cloud) {
  const storage = cloud ?? local;
  const password = process.env.ADMIN_PASSWORD;
  const passwordHash = password
    ? crypto.scryptSync(password, salt, 64)
    : cloud ? null : Buffer.from(defaultHash, 'hex');

  async function login(email, candidate, address) {
    if (!passwordHash) return { status: 503, error: 'Falta configurar el acceso de administración.' };
    const count = cloud ? await cloud.countAttempt(address) : localAttempt(address);
    if (count > 8) return { status: 429, error: 'Esperá unos minutos antes de volver a intentar.' };
    const validPassword = typeof candidate === 'string' && candidate.length <= 256 &&
      crypto.timingSafeEqual(await derivePassword(candidate, salt, 64), passwordHash);
    if (typeof email !== 'string' || email.trim().toLowerCase() !== adminEmail || !validPassword) {
      return { status: 401, error: 'Revisá el correo y la contraseña.' };
    }
    const token = crypto.randomBytes(32).toString('hex');
    if (cloud) {
      await cloud.createSession(token, sessionDuration);
      await cloud.clearAttempts(address);
    } else {
      attempts.delete(address);
      expiredEntries(sessions, Date.now());
      sessions.set(token, { expires: Date.now() + sessionDuration * 1000 });
    }
    return { token };
  }

  async function saveTemplate({ image, pathname, x, y }, token) {
    if (![x, y].every(value => Number.isFinite(value) && value >= 0.05 && value <= 0.95)) return false;
    const source = cloud
      ? pathname === '/plantillas/original.png' ? { url: local.original.url } : await cloud.resolveTemplate(pathname)
      : pathname === '/plantillas/original.png' ? { url: local.original.url } : validatePng(image);
    if (!source) return false;
    if (cloud && !await cloud.isAdmin(token)) {
      throw Object.assign(new Error('Volvé a iniciar sesión.'), { status: 401 });
    }
    await storage.writeTemplate({ ...source, x, y });
    return true;
  }

  return {
    login,
    saveTemplate,
    readTemplate: storage.readTemplate,
    removeTemplate: () => storage.writeTemplate(null),
    isAdmin: cloud ? cloud.isAdmin : token => sessions.get(token)?.expires > Date.now(),
    logout: cloud ? cloud.logout : token => sessions.delete(token),
  };
}

module.exports = { createService };
