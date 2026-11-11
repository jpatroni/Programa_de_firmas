const select = (id) => document.getElementById(id);
const canvas = select('certificate');
const position = select('position');
const form = select('form');
const first = select('first');
const last = select('last');
const login = select('login');
const file = select('file');
const adminStatus = select('admin-status');
const publish = select('publish');
const remove = select('remove');
const download = select('download');
const print = select('print');
let active = null;
let draft = null;
let recipient = '';
let admin = false;
let busy = false;
let choosingFile = false;
let fileVersion = 0;

async function api(route, method = 'GET', body) {
  const response = await fetch('/api/' + route, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Diploma': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && route !== 'ingresar') showAdmin(false);
    throw new Error(data.error);
  }
  return data;
}

async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function draw(target, template, name = '') {
  target.width = template.bitmap.width;
  target.height = template.bitmap.height;
  const ctx = target.getContext('2d');
  ctx.drawImage(template.bitmap, 0, 0);
  if (!name) return;
  const maxWidth = target.width * Math.min(.71, 2 * Math.min(template.x, 1 - template.x) - .04);
  const preferred = Math.min(target.width * .044, target.height * .08);
  ctx.font = 'bold ' + preferred + 'px Georgia, serif';
  const size = Math.min(preferred, preferred * maxWidth / ctx.measureText(name).width);
  ctx.font = 'bold ' + size + 'px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a1316';
  ctx.fillText(name, template.x * target.width, template.y * target.height, maxWidth);
}

function showDraft() {
  select('position-editor').hidden = !draft;
  publish.disabled = !draft || busy || choosingFile;
  remove.disabled = !active || busy;
  if (draft) draw(position, draft, 'Nombre y apellido');
}

function showAdmin(value) {
  admin = value;
  login.hidden = value;
  select('editor').hidden = !value;
  draft = value && active ? { ...active } : null;
  showDraft();
}

function updatePreview(name = '') {
  recipient = name;
  download.disabled = !name;
  print.disabled = !name;
  canvas.setAttribute('aria-label', name ? 'Diploma de ' + name : 'Plantilla del diploma');
  select('status').textContent = name ? 'Diploma listo para descargar o imprimir.' : '';
  if (active) draw(canvas, active, name);
}

async function refreshTemplate() {
  const template = await api('plantilla');
  active = template ? {
    ...template,
    bitmap: await loadImage('data:image/png;base64,' + template.image),
  } : null;
  select('workspace').hidden = !active;
  select('availability').hidden = !!active;
  select('availability').textContent = active ? '' : 'Todavía no hay un diploma disponible.';
  updatePreview();
  if (admin) showAdmin(true);
}

form.addEventListener('input', event => {
  event.target.setCustomValidity('');
  if (recipient) updatePreview();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!active) return;
  for (const field of [first, last]) {
    if (field.value.trim()) continue;
    field.setCustomValidity('Completá este campo.');
    field.reportValidity();
    return;
  }
  updatePreview([first.value.trim(), last.value.trim()].join(' ').replace(/\s+/g, ' '));
});

download.addEventListener('click', () => {
  const name = recipient.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 100);
  const link = document.createElement('a');
  link.download = 'Diploma - ' + name + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

print.addEventListener('click', () => window.print());

select('admin-toggle').addEventListener('click', event => {
  const section = select('administracion');
  section.hidden = !section.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!section.hidden));
});

login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  button.disabled = true;
  adminStatus.textContent = '';
  try {
    await api('ingresar', 'POST', { email: select('email').value, password: select('password').value });
    login.reset();
    showAdmin(true);
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

file.addEventListener('change', async () => {
  const selected = file.files[0];
  if (!selected) return;
  const version = ++fileVersion;
  choosingFile = true;
  showDraft();
  adminStatus.textContent = '';
  const url = URL.createObjectURL(selected);
  try {
    if (!['image/png', 'image/jpeg'].includes(selected.type) || selected.size > 20 * 1024 * 1024) {
      throw new Error('Elegí una imagen PNG o JPG de hasta 20 MB.');
    }
    const image = await loadImage(url);
    if (version !== fileVersion || !admin) return;
    const buffer = document.createElement('canvas');
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    buffer.width = Math.max(1, Math.round(image.width * scale));
    buffer.height = Math.max(1, Math.round(image.height * scale));
    buffer.getContext('2d').drawImage(image, 0, 0, buffer.width, buffer.height);
    draft = { bitmap: buffer, image: buffer.toDataURL('image/png').split(',')[1], x: .5, y: .51 };
  } catch (error) {
    if (version === fileVersion) adminStatus.textContent = error.message || 'No se pudo abrir la imagen.';
  } finally {
    URL.revokeObjectURL(url);
    if (version === fileVersion) {
      file.value = '';
      choosingFile = false;
      showDraft();
    }
  }
});

function moveName(x, y) {
  if (!draft || busy) return;
  draft.x = Math.min(.95, Math.max(.05, x));
  draft.y = Math.min(.95, Math.max(.05, y));
  showDraft();
}

position.addEventListener('click', event => {
  const rect = position.getBoundingClientRect();
  moveName((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
});

position.addEventListener('keydown', event => {
  const movement = { ArrowUp: [0, -.01], ArrowDown: [0, .01], ArrowLeft: [-.01, 0], ArrowRight: [.01, 0] }[event.key];
  if (!movement || !draft) return;
  event.preventDefault();
  moveName(draft.x + movement[0], draft.y + movement[1]);
});

async function changeTemplate(method) {
  busy = true;
  file.disabled = true;
  select('logout').disabled = true;
  showDraft();
  adminStatus.textContent = '';
  try {
    const body = method === 'PUT' ? { image: draft.image, x: draft.x, y: draft.y } : undefined;
    await api('plantilla', method, body);
    await refreshTemplate();
    adminStatus.textContent = method === 'PUT' ? 'Plantilla publicada.' : 'Plantilla quitada.';
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    busy = false;
    file.disabled = false;
    select('logout').disabled = false;
    showDraft();
  }
}

publish.addEventListener('click', () => changeTemplate('PUT'));
remove.addEventListener('click', () => {
  if (window.confirm('¿Querés quitar el diploma disponible para los asistentes?')) changeTemplate('DELETE');
});

select('logout').addEventListener('click', async () => {
  try {
    await api('salir', 'POST');
    fileVersion++;
    choosingFile = false;
    showAdmin(false);
    adminStatus.textContent = 'Sesión cerrada.';
  } catch (error) {
    adminStatus.textContent = error.message;
  }
});

refreshTemplate().catch(() => {
  select('availability').textContent = 'No se pudo cargar el diploma. Actualizá la página para volver a intentar.';
});
api('sesion').then(session => showAdmin(session.admin)).catch(() => {
  adminStatus.textContent = 'No se pudo verificar la sesión.';
});
