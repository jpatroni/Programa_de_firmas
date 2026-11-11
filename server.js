const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHandler, setHeaders } = require('./src/http');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/plantillas/original.png', ['plantillas/original.png', 'image/png']],
]);

const handleApi = createHandler();
const server = http.createServer((request, response) => {
  const pathname = request.url.split('?')[0];
  if (request.method === 'GET' && publicFiles.has(pathname)) {
    setHeaders(response);
    const [filename, type] = publicFiles.get(pathname);
    const content = fs.readFileSync(path.join(__dirname, 'public', filename));
    response.writeHead(200, { 'Content-Type': type });
    return response.end(content);
  }
  return handleApi(request, response, pathname);
});

server.listen(port, host, () => {
  const url = 'http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + server.address().port;
  console.log('Generador de diplomas disponible en ' + url);
  if (process.argv.includes('--abrir') && process.platform === 'win32') {
    spawn('explorer.exe', [url], { stdio: 'ignore', detached: true }).unref();
  }
});
