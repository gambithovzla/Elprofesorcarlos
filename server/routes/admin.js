'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { adminAuth, makeSessionCookie, COOKIE } = require('../middleware/adminAuth');
const { sendAccessEmail, sendRejectedEmail } = require('../lib/email');

const router = express.Router();

const PDF_DIR = process.env.PDF_DIR || path.join(__dirname, '..', '..', 'storage', 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: PDF_DIR,
    filename: (req, file, cb) => cb(null, `course-${req.params.id}.pdf`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo se aceptan archivos PDF'));
  },
});

/* ── Login ── */
router.post('/login', (req, res) => {
  const password = String((req.body && req.body.password) || '');
  const expected = process.env.ADMIN_PASSWORD || '';
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!expected || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  res.cookie(COOKIE, makeSessionCookie(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.use(adminAuth);

router.get('/me', (req, res) => res.json({ ok: true }));

/* ── Resumen general ── */
router.get('/overview', async (req, res, next) => {
  try {
    const [pending, recent, courses, slots] = await Promise.all([
      db.query(
        `SELECT p.id, p.buyer_name, p.buyer_email, p.amount_pen, p.manual_channel,
                p.manual_reference, p.created_at, c.title AS course_title
           FROM purchases p JOIN courses c ON c.id = p.course_id
          WHERE p.status = 'pending_review'
          ORDER BY p.created_at`
      ),
      db.query(
        `SELECT p.id, p.buyer_name, p.buyer_email, p.amount_pen, p.payment_method,
                p.status, p.paid_at, p.created_at, c.title AS course_title
           FROM purchases p JOIN courses c ON c.id = p.course_id
          WHERE p.status IN ('paid', 'rejected')
          ORDER BY p.created_at DESC
          LIMIT 30`
      ),
      db.query(
        `SELECT id, slug, title, price_pen, sessions_included,
                (pdf_path IS NOT NULL) AS has_pdf
           FROM courses WHERE active = TRUE ORDER BY id`
      ),
      db.query(
        `SELECT s.id, s.course_id, s.starts_at, s.duration_minutes, s.status,
                s.meeting_link, c.title AS course_title,
                p.buyer_name, p.buyer_email
           FROM session_slots s
           JOIN courses c ON c.id = s.course_id
           LEFT JOIN purchases p ON p.id = s.purchase_id
          WHERE s.status <> 'cancelled' AND s.starts_at > now() - interval '1 day'
          ORDER BY s.starts_at`
      ),
    ]);
    res.json({
      pendingPayments: pending.rows,
      recentPurchases: recent.rows,
      courses: courses.rows,
      slots: slots.rows,
    });
  } catch (err) { next(err); }
});

/* ── Aprobar / rechazar pagos manuales ── */
router.post('/purchases/:id/approve', async (req, res, next) => {
  try {
    const accessToken = crypto.randomBytes(32).toString('hex');
    const { rows } = await db.query(
      `UPDATE purchases
          SET status = 'paid', access_token = $1, paid_at = now()
        WHERE id = $2 AND status = 'pending_review'
        RETURNING buyer_name, buyer_email, course_id`,
      [accessToken, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pago no encontrado o ya procesado.' });

    const { rows: courses } = await db.query('SELECT title FROM courses WHERE id = $1', [rows[0].course_id]);
    sendAccessEmail({
      to: rows[0].buyer_email,
      buyerName: rows[0].buyer_name,
      courseTitle: courses[0].title,
      accessToken,
    }).catch((e) => console.error('[email]', e));

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/purchases/:id/reject', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE purchases SET status = 'rejected'
        WHERE id = $1 AND status = 'pending_review'
        RETURNING buyer_name, buyer_email, course_id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pago no encontrado o ya procesado.' });

    const { rows: courses } = await db.query('SELECT title FROM courses WHERE id = $1', [rows[0].course_id]);
    sendRejectedEmail({
      to: rows[0].buyer_email,
      buyerName: rows[0].buyer_name,
      courseTitle: courses[0].title,
    }).catch((e) => console.error('[email]', e));

    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── Horarios de sesiones ── */
router.post('/slots', async (req, res, next) => {
  try {
    const { courseId, startsAt, durationMinutes, meetingLink } = req.body || {};
    const starts = new Date(startsAt);
    const duration = Number(durationMinutes) || 60;
    if (Number.isNaN(starts.getTime()) || starts <= new Date()) {
      return res.status(400).json({ error: 'La fecha debe ser futura.' });
    }
    if (duration < 15 || duration > 240) {
      return res.status(400).json({ error: 'Duración inválida (15–240 min).' });
    }
    const { rows } = await db.query(
      `INSERT INTO session_slots (course_id, starts_at, duration_minutes, meeting_link)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [Number(courseId), starts.toISOString(), duration, String(meetingLink || '').trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/slots/:id/cancel', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE session_slots SET status = 'cancelled'
        WHERE id = $1 AND status IN ('open', 'booked') RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Horario no encontrado.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── Cursos: precio y PDF ── */
router.patch('/courses/:id', async (req, res, next) => {
  try {
    const price = Number(req.body && req.body.pricePen);
    if (!(price > 0)) return res.status(400).json({ error: 'Precio inválido.' });
    const { rows } = await db.query(
      'UPDATE courses SET price_pen = $1 WHERE id = $2 RETURNING id',
      [price.toFixed(2), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Curso no encontrado.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/courses/:id/pdf', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Adjunta un archivo PDF.' });
    const { rows } = await db.query(
      'UPDATE courses SET pdf_path = $1 WHERE id = $2 RETURNING id',
      [req.file.filename, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Curso no encontrado.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
