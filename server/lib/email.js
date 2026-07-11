'use strict';

/* Correos transaccionales vía Resend.
   Si RESEND_API_KEY no está configurada, los correos se registran en consola
   (útil en desarrollo local) en lugar de fallar el flujo de compra. */

const { Resend } = require('resend');
const { buildIcs } = require('./ics');

const FROM = process.env.EMAIL_FROM || 'El Profesor Carlos <onboarding@resend.dev>';

function baseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function layout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#0b132b;border-radius:8px;padding:36px 32px;color:#f8f9fa;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8fa4b5;font-family:Arial,sans-serif;">El Profesor Carlos</p>
      <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#f8f9fa;">${title}</h1>
      <div style="font-size:15px;line-height:1.7;color:#d5dae0;font-family:Arial,sans-serif;">${bodyHtml}</div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9aa1a9;margin-top:16px;font-family:Arial,sans-serif;">© El Profesor Carlos · Comunicación y liderazgo para profesionales</p>
  </div>
</body>
</html>`;
}

function button(href, label) {
  return `<p style="margin:26px 0;"><a href="${href}" style="background:#6b93ad;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:4px;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;display:inline-block;font-family:Arial,sans-serif;">${label}</a></p>`;
}

async function send({ to, subject, html, attachments }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:dev] Para: ${to} | Asunto: ${subject}`);
    return { dev: true };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, attachments });
  if (error) {
    // No romper el flujo de compra por un fallo de correo: se registra y sigue.
    console.error('[email] Error enviando correo:', error);
    return { error };
  }
  return data;
}

/* Compra confirmada → enlace de acceso */
async function sendAccessEmail({ to, buyerName, courseTitle, accessToken }) {
  const link = `${baseUrl()}/acceso.html?token=${accessToken}`;
  const html = layout('Tu acceso está listo', `
    <p>Hola ${buyerName},</p>
    <p>Tu pago del curso <strong style="color:#f8f9fa;">${courseTitle}</strong> fue confirmado. Desde tu portal de acceso puedes descargar el material y agendar tus sesiones en vivo con el profesor.</p>
    ${button(link, 'Entrar a mi curso')}
    <p style="font-size:13px;color:#9aa1a9;">Guarda este correo: el enlace es tu llave de acceso personal. No lo compartas.</p>
  `);
  return send({ to, subject: `Acceso confirmado — ${courseTitle}`, html });
}

/* Pago manual reportado → en revisión */
async function sendPendingReviewEmail({ to, buyerName, courseTitle }) {
  const html = layout('Recibimos tu reporte de pago', `
    <p>Hola ${buyerName},</p>
    <p>Registramos tu pago del curso <strong style="color:#f8f9fa;">${courseTitle}</strong> y está en verificación. En cuanto se confirme (normalmente en pocas horas) recibirás otro correo con tu enlace de acceso.</p>
    <p style="font-size:13px;color:#9aa1a9;">Si pasadas 24 horas no recibes respuesta, responde a este correo.</p>
  `);
  return send({ to, subject: `Pago en verificación — ${courseTitle}`, html });
}

/* Pago manual rechazado */
async function sendRejectedEmail({ to, buyerName, courseTitle }) {
  const html = layout('No pudimos verificar tu pago', `
    <p>Hola ${buyerName},</p>
    <p>No logramos verificar el pago reportado para el curso <strong style="color:#f8f9fa;">${courseTitle}</strong>. Si crees que se trata de un error, responde a este correo adjuntando tu comprobante y lo revisamos de inmediato.</p>
  `);
  return send({ to, subject: `Pago no verificado — ${courseTitle}`, html });
}

/* Sesión reservada → confirmación + .ics */
async function sendBookingEmail({ to, buyerName, courseTitle, slot }) {
  const starts = new Date(slot.starts_at);
  const fecha = starts.toLocaleString('es-PE', {
    timeZone: process.env.TIMEZONE || 'America/Lima',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const ics = buildIcs({
    uid: `slot-${slot.id}`,
    startsAt: slot.starts_at,
    durationMinutes: slot.duration_minutes,
    title: `Sesión en vivo — ${courseTitle}`,
    description: `Sesión en vivo con El Profesor Carlos.${slot.meeting_link ? ' Enlace: ' + slot.meeting_link : ''}`,
    meetingLink: slot.meeting_link,
  });
  const html = layout('Sesión reservada', `
    <p>Hola ${buyerName},</p>
    <p>Tu sesión en vivo del curso <strong style="color:#f8f9fa;">${courseTitle}</strong> quedó reservada para:</p>
    <p style="font-size:17px;color:#f8f9fa;"><strong>${fecha}</strong> <span style="color:#9aa1a9;">(hora de Perú)</span></p>
    ${slot.meeting_link ? button(slot.meeting_link, 'Unirme a la sesión') : '<p style="font-size:13px;color:#9aa1a9;">El enlace de la videollamada te llegará antes de la sesión.</p>'}
    <p style="font-size:13px;color:#9aa1a9;">Adjuntamos la invitación para tu calendario. Duración: ${slot.duration_minutes} minutos.</p>
  `);
  return send({
    to,
    subject: `Sesión reservada — ${courseTitle}`,
    html,
    attachments: [{ filename: 'sesion.ics', content: Buffer.from(ics).toString('base64') }],
  });
}

module.exports = { sendAccessEmail, sendPendingReviewEmail, sendRejectedEmail, sendBookingEmail };
