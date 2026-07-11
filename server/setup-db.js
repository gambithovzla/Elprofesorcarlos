'use strict';

/* Crea las tablas y siembra los cursos. Idempotente: se puede correr
   en cada deploy (railway.json lo invoca antes de `npm start`). */

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  await pool.query(schema);
  await pool.query(seed);
  console.log('Base de datos lista.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error preparando la base de datos:', err);
  process.exit(1);
});
