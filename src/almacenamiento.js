const fs = require('node:fs');
const path = require('node:path');

const original = { url: '/plantillas/original.png', x: 714 / 1448, y: 550 / 1086 };
const dataDirectory = process.env.DIPLOMA_DATA_DIR || path.join(__dirname, '../plantillas');
const stateFile = path.join(dataDirectory, 'activa.json');

function readTemplate() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return original;
  }
}

function writeTemplate(template) {
  const temporary = stateFile + '.tmp';
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(template));
  fs.renameSync(temporary, stateFile);
}

module.exports = { readTemplate, writeTemplate, original };
