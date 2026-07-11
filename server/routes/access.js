'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { sendBookingEmail } = require('../lib/email');

const router = express.Router();

const PDF_DIR = process.env.PDF_DIR || path.join(__dirname, '..', '..', 'storage', 'pdfs');
const TOKEN_RE = /^[a-f0-9]{64}$/;

async function findPaidPurchase(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const { rows } = await db.query(
    `SELECT p.id, p.buyer_name, p.buyer_email, p.paid_at,
            c.id AS course_id, c.slug, c.title, c.description,
            c.sessions_included, c.pdf_path
       FROM purchases p JOIN courses c ON c.id = p.course_id
      WHERE p.access_token = $1 AND p.status = 'paid'`,
    [token]
  );
  return rows[0] || null;
}

/* Datos del portal: curso, material disponible y sesiones del comprador. */
router.get('/access/:token', async (req, res, next) => {
  try {
    const purchase = await findPaidPurchase(req.params.token);
    if (!purchase) return res.status(403).json({ error: 'Acceso no válido.' });

    const { rows: myBookings } = await db.query(
      `SELECT id, starts_at, duration_minutes, meeting_link
         FROM session_slots
        WHERE purchase_id = $1 AND status = 'booked'
        ORDER BY starts_at`,
      [purchase.id]
    );

    res.json({
      buyerName: purchase.buyer_name,
      course: {
        slug: purchase.slug,
        title: purchase.title,
        description: purchase.description,
        sessionsIncluded: purchase.sessions_included,
      },
      pdfAvailable: Boolean(purchase.pdf_path),
      bookings: myBookings,
      sessionsRemaining: Math.max(0, purchase.sessions_included - myBookings.length),
    });
  } catch (err) { next(err); }
});

/* Horarios abiertos (a futuro) del curso comprado. */
router.get('/access/:token/slots', async (req, res, next) => {
  try {
    const purchase = await findPaidPurchase(req.params.token);
    if (!purchase) return res.status(403).json({ error: 'Acceso no válido.' });

    const { rows } = await db.query(
      `SELECT id, starts_at, duration_minutes
         FROM session_slots
        WHERE course_id = $1 AND status = 'open' AND starts_at > now()
        ORDER BY starts_at`,
      [purchase.course_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* Reserva atómica: solo gana quien actualiza la fila mientras sigue 'open'. */
router.post('/access/:token/book', async (req, res, next) => {
  try {
    const purchase = await findPaidPurchase(req.params.token);
    if (!purchase) return res.status(403).json({ error: 'Acceso no válido.' });

    const slotId = Number(req.body && req.body.slotId);
    if (!Number.isInteger(slotId)) return res.status(400).json({ error: 'Horario inválido.' });

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM session_slots WHERE purchase_id = $1 AND status = 'booked'`,
      [purchase.id]
    );
    if (countRows[0].n >= purchase.sessions_included) {
      return res.status(409).json({ error: 'Ya reservaste todas las sesiones incluidas en tu curso.' });
    }

    const { rows: booked } = await db.query(
      `UPDATE session_slots
          SET status = 'booked', purchase_id = $1
        WHERE id = $2 AND course_id = $3 AND status = 'open' AND starts_at > now()
        RETURNING id, starts_at, duration_minutes, meeting_link`,
      [purchase.id, slotId, purchase.course_id]
    );
    if (!booked.length) {
      return res.status(409).json({ error: 'Ese horario acaba de ser tomado por otra persona. Elige otro.' });
    }

    sendBookingEmail({
      to: purchase.buyer_email,
      buyerName: purchase.buyer_name,
      courseTitle: purchase.title,
      slot: booked[0],
    }).catch((e) => console.error('[email]', e));

    res.json({ ok: true, slot: booked[0] });
  } catch (err) { next(err); }
});

module.exports = router;

/* Descarga protegida del PDF — montada fuera de /api para tener URL corta. */
module.exports.downloadHandler = async function downloadHandler(req, res, next) {
  try {
    const purchase = await findPaidPurchase(req.params.token);
    if (!purchase) return res.status(403).send('Acceso no válido.');
    if (!purchase.pdf_path) return res.status(404).send('El material aún no está disponible. Escríbenos si necesitas ayuda.');

    // pdf_path es solo el nombre del archivo dentro del volumen; nunca una ruta del cliente.
    const filePath = path.join(PDF_DIR, path.basename(purchase.pdf_path));
    if (!fs.existsSync(filePath)) return res.status(404).send('El material aún no está disponible.');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${purchase.slug}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
};
