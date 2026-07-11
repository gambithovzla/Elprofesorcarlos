'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { createCharge } = require('../lib/culqi');
const { sendAccessEmail, sendPendingReviewEmail } = require('../lib/email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* Catálogo público de cursos (título, precio, sesiones incluidas). */
router.get('/courses', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT slug, title, description, price_pen, sessions_included
         FROM courses WHERE active = TRUE ORDER BY id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* Config pública que necesita el checkout del frontend. */
router.get('/config', (req, res) => {
  res.json({
    culqiPublicKey: process.env.CULQI_PUBLIC_KEY || null,
    manualPayment: {
      zelle: process.env.ZELLE_INFO || null,
      pagomovil: process.env.PAGOMOVIL_INFO || null,
      binance: process.env.BINANCE_INFO || null,
    },
  });
});

/* Crea la compra.
   - method 'culqi'  → queda 'pending'; el cobro se ejecuta en /:id/charge.
   - method 'manual' → requiere canal + referencia; queda 'pending_review'. */
router.post('/purchases', async (req, res, next) => {
  try {
    const { courseSlug, buyerName, buyerEmail, method, manualChannel, manualReference } = req.body || {};

    const name = String(buyerName || '').trim();
    const email = String(buyerEmail || '').trim().toLowerCase();
    if (name.length < 2) return res.status(400).json({ error: 'Ingresa tu nombre completo.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Ingresa un correo válido.' });
    if (!['culqi', 'manual'].includes(method)) return res.status(400).json({ error: 'Método de pago inválido.' });

    const { rows: courses } = await db.query(
      'SELECT id, title, price_pen FROM courses WHERE slug = $1 AND active = TRUE',
      [courseSlug]
    );
    if (!courses.length) return res.status(404).json({ error: 'Curso no encontrado.' });
    const course = courses[0];

    if (method === 'manual') {
      const channel = String(manualChannel || '').trim().toLowerCase();
      const reference = String(manualReference || '').trim();
      if (!['zelle', 'pagomovil', 'binance', 'otro'].includes(channel)) {
        return res.status(400).json({ error: 'Selecciona el medio por el que pagaste.' });
      }
      if (reference.length < 4) {
        return res.status(400).json({ error: 'Ingresa el número de referencia de tu pago.' });
      }
      const { rows } = await db.query(
        `INSERT INTO purchases (course_id, buyer_name, buyer_email, amount_pen,
                                payment_method, status, manual_channel, manual_reference)
         VALUES ($1, $2, $3, $4, 'manual', 'pending_review', $5, $6)
         RETURNING id`,
        [course.id, name, email, course.price_pen, channel, reference]
      );
      sendPendingReviewEmail({ to: email, buyerName: name, courseTitle: course.title })
        .catch((e) => console.error('[email]', e));
      return res.status(201).json({ purchaseId: rows[0].id, status: 'pending_review' });
    }

    // Tarjeta (Culqi)
    const { rows } = await db.query(
      `INSERT INTO purchases (course_id, buyer_name, buyer_email, amount_pen, payment_method, status)
       VALUES ($1, $2, $3, $4, 'culqi', 'pending')
       RETURNING id`,
      [course.id, name, email, course.price_pen]
    );
    res.status(201).json({
      purchaseId: rows[0].id,
      status: 'pending',
      amountPen: Number(course.price_pen),
      courseTitle: course.title,
    });
  } catch (err) { next(err); }
});

/* Ejecuta el cobro con el token generado por Culqi Checkout en el navegador. */
router.post('/purchases/:id/charge', async (req, res, next) => {
  try {
    const { tokenId } = req.body || {};
    if (!tokenId) return res.status(400).json({ error: 'Falta el token de pago.' });

    const { rows } = await db.query(
      `SELECT p.id, p.status, p.buyer_name, p.buyer_email, p.amount_pen, c.title AS course_title
         FROM purchases p JOIN courses c ON c.id = p.course_id
        WHERE p.id = $1 AND p.payment_method = 'culqi'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compra no encontrada.' });
    const purchase = rows[0];
    if (purchase.status === 'paid') return res.status(409).json({ error: 'Esta compra ya fue pagada.' });

    let charge;
    try {
      charge = await createCharge({
        tokenId,
        amountPen: purchase.amount_pen,
        email: purchase.buyer_email,
        description: purchase.course_title,
      });
    } catch (culqiErr) {
      console.error('[culqi] cargo rechazado:', culqiErr.culqi || culqiErr.message);
      return res.status(402).json({ error: culqiErr.message });
    }

    const accessToken = newAccessToken();
    await db.query(
      `UPDATE purchases
          SET status = 'paid', culqi_charge_id = $1, access_token = $2, paid_at = now()
        WHERE id = $3`,
      [charge.id, accessToken, purchase.id]
    );

    sendAccessEmail({
      to: purchase.buyer_email,
      buyerName: purchase.buyer_name,
      courseTitle: purchase.course_title,
      accessToken,
    }).catch((e) => console.error('[email]', e));

    res.json({ status: 'paid', accessUrl: `/acceso.html?token=${accessToken}` });
  } catch (err) { next(err); }
});

module.exports = router;
