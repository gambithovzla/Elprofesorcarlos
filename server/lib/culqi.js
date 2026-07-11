'use strict';

/* Wrapper mínimo del API de Culqi (https://apidocs.culqi.com).
   Solo usamos Cargos: el frontend tokeniza la tarjeta con Culqi Checkout
   y aquí ejecutamos el cobro con la llave secreta. */

const CULQI_API = 'https://api.culqi.com/v2';

async function createCharge({ tokenId, amountPen, email, description }) {
  const secretKey = process.env.CULQI_SECRET_KEY;
  if (!secretKey) {
    throw new Error('CULQI_SECRET_KEY no está configurada');
  }

  const res = await fetch(`${CULQI_API}/charges`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Culqi cobra en céntimos (S/ 199.00 → 19900)
      amount: Math.round(Number(amountPen) * 100),
      currency_code: 'PEN',
      email,
      source_id: tokenId,
      description: (description || '').slice(0, 80),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.user_message || data.merchant_message || 'El pago fue rechazado');
    err.culqi = data;
    err.status = res.status;
    throw err;
  }

  return data; // { id: 'chr_...', outcome: {...}, ... }
}

module.exports = { createCharge };
