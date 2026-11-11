const { createHandler } = require('../src/http');
const storage = require('../src/almacenamiento-vercel');

const handle = createHandler(storage);
const endpoints = new Set(['plantilla', 'sesion', 'ingresar', 'salir', 'subida']);

module.exports = (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const endpoint = request.query?.endpoint ?? url.searchParams.get('endpoint') ?? url.pathname.split('/').pop();
  return handle(request, response, endpoints.has(endpoint) ? '/api/' + endpoint : '');
};
