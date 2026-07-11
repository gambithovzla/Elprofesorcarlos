'use strict';

/* Autenticación simple del panel admin: password compartida (ADMIN_PASSWORD)
   → cookie de sesión firmada con la propia password como secreto HMAC. */

const crypto = require('crypto');

const COOKIE = 'epc_admin';

function secret() {
  return process.env.ADMIN_PASSWORD || '';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function makeSessionCookie() {
  const payload = String(Date.now());
  return `${payload}.${sign(payload)}`;
}

function isValidSession(cookieValue) {
  if (!cookieValue || !secret()) return false;
  const [payload, sig] = String(cookieValue).split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  // Sesión válida por 12 horas
  return Date.now() - Number(payload) < 12 * 60 * 60 * 1000;
}

function adminAuth(req, res, next) {
  if (isValidSession(req.cookies[COOKIE])) return next();
  res.status(401).json({ error: 'No autorizado' });
}

module.exports = { adminAuth, makeSessionCookie, COOKIE };
