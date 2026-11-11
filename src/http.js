const { createService } = require('./servicio');
const contentSecurityPolicy = "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob: https://*.public.blob.vercel-storage.com; connect-src 'self' https://vercel.com/api/blob https://vercel.com/api/blob/ https://blob.vercel-storage.com https://*.blob.vercel-storage.com; frame-ancestors 'none'";

function setHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', contentSecurityPolicy);
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

function bodyError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readBody(request, limit, cloud) {
  let body;
  if (Number(request.headers['content-length']) > limit) {
    throw bodyError(413, 'El archivo es demasiado grande.');
  }
  try {
    if (cloud && 'body' in request) {
      body = request.body;
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > limit) {
          request.resume();
          throw bodyError(413, 'El archivo es demasiado grande.');
        }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    if (cloud && Buffer.byteLength(JSON.stringify(body)) > limit) {
      throw bodyError(413, 'El archivo es demasiado grande.');
    }
    return body;
  } catch (error) {
    if (error.status === 413) throw error;
    throw bodyError(400, 'Los datos recibidos no son válidos.');
  }
}

function createHandler(cloud) {
  const service = createService(cloud);
  const cookieOptions = '; Path=/; HttpOnly; SameSite=Strict' +
    (cloud || process.env.SECURE_COOKIE === '1' ? '; Secure' : '');

  return async function handleApi(request, response, route) {
    setHeaders(response);
    const method = request.method;
    const token = request.headers.cookie?.match(/(?:^|;\s*)admin=([a-f0-9]{64})(?:;|$)/)?.[1];
    try {
      if (method === 'GET' && route === '/api/plantilla') {
        return json(response, 200, await service.readTemplate());
      }
      if (method === 'GET' && route === '/api/sesion') {
        return json(response, 200, { admin: !!await service.isAdmin(token), uploadPrefix: cloud?.prefix });
      }
      if (method !== 'GET' && request.headers['x-diploma'] !== '1') {
        return json(response, 403, { error: 'Solicitud no permitida.' });
      }
      if (method === 'POST' && route === '/api/ingresar') {
        const { email, password } = await readBody(request, 4096, cloud);
        const address = (cloud && request.headers['x-vercel-forwarded-for']?.split(',')[0].trim()) ||
          request.socket.remoteAddress;
        const result = await service.login(email, password, address);
        if (!result.token) return json(response, result.status, { error: result.error });
        await service.logout(token);
        return json(response, 200, { admin: true, uploadPrefix: cloud?.prefix }, {
          'Set-Cookie': 'admin=' + result.token + cookieOptions,
        });
      }
      if (method === 'POST' && route === '/api/salir') {
        await service.logout(token);
        return json(response, 200, { admin: false }, { 'Set-Cookie': 'admin=' + cookieOptions + '; Max-Age=0' });
      }
      if (cloud && method === 'POST' && route === '/api/subida') {
        if (!await service.isAdmin(token)) return json(response, 401, { error: 'Volvé a iniciar sesión.' });
        const body = await readBody(request, 8192, cloud);
        return json(response, 200, await cloud.authorizeUpload(request, body));
      }
      if (route === '/api/plantilla' && ['PUT', 'DELETE'].includes(method)) {
        if (!await service.isAdmin(token)) {
          return json(response, 401, { error: 'Ingresá como administradora para cambiar la plantilla.' });
        }
        if (method === 'DELETE') {
          await service.removeTemplate();
        } else {
          const body = await readBody(request, cloud ? 4096 : 17 * 1024 * 1024, cloud);
          if (!await service.saveTemplate(body, token)) {
            return json(response, 400, { error: 'La plantilla o la posición del nombre no son válidas.' });
          }
        }
        return json(response, 200, { ok: true });
      }
      return json(response, 404, { error: 'Página no encontrada.' });
    } catch (error) {
      if (!error.status) console.error(error);
      return json(response, error.status || 500, { error: error.status ? error.message : 'Hubo un problema al procesar el pedido.' });
    }
  };
}

module.exports = { createHandler, setHeaders };
