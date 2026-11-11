const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const service = require('./src/servicio');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const secureCookie = process.env.SECURE_COOKIE === '1' ? '; Secure' : '';
const cookieOptions = '; Path=/; HttpOnly; SameSite=Strict' + secureCookie;
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      request.resume();
      throw Object.assign(new Error('El archivo es demasiado grande.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw Object.assign(new Error('Los datos recibidos no son válidos.'), { status: 400 });
  }
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'");
  const route = request.url.split('?')[0];
  const method = request.method;
  const token = request.headers.cookie?.match(/(?:^|;\s*)admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  try {
    if (method === 'GET' && publicFiles.has(route)) {
      const [filename, type] = publicFiles.get(route);
      const content = fs.readFileSync(path.join(__dirname, 'public', filename));
      response.writeHead(200, { 'Content-Type': type });
      return response.end(content);
    }
    if (method === 'GET' && route === '/api/plantilla') return json(response, 200, service.readTemplate());
    if (method === 'GET' && route === '/api/sesion') return json(response, 200, { admin: service.isAdmin(token) });
    if (method !== 'GET' && request.headers['x-diploma'] !== '1') {
      return json(response, 403, { error: 'Solicitud no permitida.' });
    }
    if (method === 'POST' && route === '/api/ingresar') {
      const { email, password } = await readBody(request, 4096);
      const result = service.login(email, password, request.socket.remoteAddress);
      if (!result.token) return json(response, result.status, { error: result.error });
      service.logout(token);
      return json(response, 200, { admin: true }, { 'Set-Cookie': 'admin=' + result.token + cookieOptions });
    }
    if (method === 'POST' && route === '/api/salir') {
      service.logout(token);
      return json(response, 200, { admin: false }, { 'Set-Cookie': 'admin=' + cookieOptions + '; Max-Age=0' });
    }
    if (route === '/api/plantilla' && ['PUT', 'DELETE'].includes(method)) {
      if (!service.isAdmin(token)) return json(response, 401, { error: 'Ingresá como administradora para cambiar la plantilla.' });
      if (method === 'DELETE') {
        service.removeTemplate();
      } else {
        const body = await readBody(request, 17 * 1024 * 1024);
        if (!service.isAdmin(token)) return json(response, 401, { error: 'Volvé a iniciar sesión.' });
        if (!service.saveTemplate(body)) return json(response, 400, { error: 'Elegí una imagen PNG o JPG válida.' });
      }
      return json(response, 200, { ok: true });
    }
    return json(response, 404, { error: 'Página no encontrada.' });
  } catch (error) {
    if (!error.status) console.error(error);
    return json(response, error.status || 500, { error: error.status ? error.message : 'Hubo un problema al procesar el pedido.' });
  }
});

server.listen(port, host, () => {
  const url = 'http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + server.address().port;
  console.log('Generador de diplomas disponible en ' + url);
  if (process.argv.includes('--abrir') && process.platform === 'win32') {
    spawn('explorer.exe', [url], { stdio: 'ignore', detached: true }).unref();
  }
});
