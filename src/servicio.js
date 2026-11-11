const crypto = require('node:crypto');
const storage = require('./almacenamiento');

const adminEmail = 'irismaria.gomezcornejo@yahoo.com.ar';
const salt = 'dceb150a5a26cea0798526891d850047';
const defaultHash = 'da2543098368caf201bd0099361215c5a2ccc3896020cc8385ababf83802f37d6a5737ce7ce8880c994a395cffb47f30b0da374ee0fc6bb96a36abbd2b1af8d0';
const passwordHash = process.env.ADMIN_PASSWORD
  ? crypto.scryptSync(process.env.ADMIN_PASSWORD, salt, 64)
  : Buffer.from(defaultHash, 'hex');
const sessionDuration = 8 * 60 * 60 * 1000;
const sessions = new Map();
const attempts = new Map();

function expiredEntries(entries, now) {
  for (const [key, entry] of entries) {
    if (entry.expires <= now) entries.delete(key);
  }
}

function login(email, password, address) {
  const now = Date.now();
  expiredEntries(attempts, now);
  const attempt = attempts.get(address) ?? { count: 0, expires: now + 5 * 60 * 1000 };
  if (attempt.count >= 8) return { status: 429, error: 'Esperá unos minutos antes de volver a intentar.' };
  const validPassword = typeof password === 'string' && password.length <= 256 &&
    crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), passwordHash);
  if (typeof email !== 'string' || email.trim().toLowerCase() !== adminEmail || !validPassword) {
    attempt.count++;
    attempts.set(address, attempt);
    return { status: 401, error: 'Revisá el correo y la contraseña.' };
  }
  attempts.delete(address);
  expiredEntries(sessions, now);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: now + sessionDuration });
  return { token };
}

function isAdmin(token) {
  return sessions.get(token)?.expires > Date.now();
}

function logout(token) {
  sessions.delete(token);
}

function saveTemplate({ image, x, y }) {
  if (typeof image !== 'string' || ![x, y].every(value => Number.isFinite(value) && value >= 0.05 && value <= 0.95)) {
    return false;
  }
  const png = Buffer.from(image, 'base64');
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (png.length < 33 || png.length > 12 * 1024 * 1024 ||
      !png.subarray(0, 8).equals(signature) || png.toString('ascii', 12, 16) !== 'IHDR' ||
      ![png.readUInt32BE(16), png.readUInt32BE(20)].every(size => size > 0 && size <= 4000)) {
    return false;
  }
  storage.writeTemplate({ image: png.toString('base64'), x, y });
  return true;
}

function removeTemplate() {
  storage.writeTemplate(null);
}

module.exports = { login, isAdmin, logout, saveTemplate, removeTemplate, readTemplate: storage.readTemplate };
