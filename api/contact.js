const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Rate limiting: 5 requests per hour per IP
const requestTimestamps = new Map();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `ip:${ip}`;

  if (!requestTimestamps.has(key)) {
    requestTimestamps.set(key, []);
  }

  const timestamps = requestTimestamps.get(key);
  const recentRequests = timestamps.filter(t => now - t < RATE_WINDOW_MS);

  requestTimestamps.set(key, recentRequests);

  if (recentRequests.length >= RATE_LIMIT) {
    return false;
  }

  recentRequests.push(now);
  return true;
}

const PLAN_LABELS = {
  basic:        'Básico — €299 + €29/mes',
  professional: 'Profesional — €499 + €49/mes',
  full:         'Full Access — €999 + €59/mes',
  unsure:       'Aún no lo sé',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeInput(str, maxLength = 500) {
  return String(str)
    .trim()
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '');
}

function detectSpam(text) {
  const spamPatterns = [
    /\b(viagra|cialis|casino|bitcoin|crypto|forex|lottery)\b/gi,
    /(http|https):\/\/[^\s]+/g,
    /\b[a-z0-9]{20,}\b/gi,
  ];
  return spamPatterns.some(pattern => pattern.test(text));
}

module.exports = async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', 'https://covestudiomallorca.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Por favor intenta más tarde.' });
  }

  const { name, email, message, plan, _honey } = req.body || {};

  // Honeypot — bots fill this, real users never see it
  if (_honey) return res.status(200).json({ success: true });

  // Validation with sanitization
  const n = sanitizeInput(name || '', 100);
  const e = sanitizeInput(email || '', 254);
  const m = sanitizeInput(message || '', 5000);

  if (!n || !e || !m) return res.status(400).json({ error: 'Por favor rellena todos los campos requeridos.' });
  if (n.length < 2) return res.status(400).json({ error: 'El nombre es demasiado corto.' });
  if (n.length > 100) return res.status(400).json({ error: 'El nombre es demasiado largo.' });
  if (!isValidEmail(e)) return res.status(400).json({ error: 'El email no es válido.' });
  if (m.length < 10) return res.status(400).json({ error: 'El mensaje es demasiado corto (mínimo 10 caracteres).' });
  if (m.length > 5000) return res.status(400).json({ error: 'El mensaje es demasiado largo.' });

  // Spam detection
  if (detectSpam(m)) {
    return res.status(400).json({ error: 'El mensaje contiene contenido no permitido.' });
  }

  const planLabel = PLAN_LABELS[plan] || 'No especificado';
  const msgHtml = escapeHtml(m).replace(/\n/g, '<br>');

  try {
    // Notification to Cove Studio
    await resend.emails.send({
      from: 'Cove Studio Contact <hola@covestudiomallorca.com>',
      to: ['infocovestudio1@gmail.com'],
      replyTo: e,
      subject: `Nuevo contacto: ${n}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;">
          <div style="margin-bottom:28px;">
            <span style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#2E8F8F;">Cove Studio</span>
            <h2 style="margin:8px 0 0;font-size:22px;color:#1B2B45;">Nuevo mensaje de contacto</h2>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:15px;">
            <tr><td style="padding:10px 12px;color:#6b6b6b;font-weight:600;width:110px;vertical-align:top;">Nombre</td><td style="padding:10px 12px;color:#0f0f0f;">${escapeHtml(n)}</td></tr>
            <tr style="background:#f7f4ef;"><td style="padding:10px 12px;color:#6b6b6b;font-weight:600;vertical-align:top;">Email</td><td style="padding:10px 12px;"><a href="mailto:${escapeHtml(e)}" style="color:#2E8F8F;">${escapeHtml(e)}</a></td></tr>
            <tr><td style="padding:10px 12px;color:#6b6b6b;font-weight:600;vertical-align:top;">Plan</td><td style="padding:10px 12px;color:#0f0f0f;">${escapeHtml(planLabel)}</td></tr>
            <tr style="background:#f7f4ef;"><td style="padding:10px 12px;color:#6b6b6b;font-weight:600;vertical-align:top;">Mensaje</td><td style="padding:10px 12px;color:#0f0f0f;line-height:1.6;">${msgHtml}</td></tr>
          </table>
          <p style="margin-top:28px;font-size:12px;color:#a8a49e;">Enviado desde covestudiomallorca.com</p>
        </div>
      `,
    });

    // Auto-reply to the visitor
    await resend.emails.send({
      from: 'Cove Studio <hola@covestudiomallorca.com>',
      to: [e],
      subject: `Hemos recibido tu mensaje, ${n} — Cove Studio`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;">
          <span style="font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#2E8F8F;">Cove Studio</span>
          <h2 style="margin:8px 0 24px;font-size:22px;color:#1B2B45;">¡Gracias, ${escapeHtml(n)}!</h2>
          <p style="color:#6b6b6b;line-height:1.7;font-size:15px;">Hemos recibido tu mensaje y te responderemos en menos de <strong style="color:#0f0f0f;">24 horas</strong>.</p>
          <p style="color:#6b6b6b;line-height:1.7;font-size:15px;">Mientras tanto, puedes explorar nuestros proyectos en <a href="https://covestudiomallorca.com" style="color:#2E8F8F;">covestudiomallorca.com</a>.</p>
          <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2ddd7;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#1B2B45;">El equipo de Cove Studio</p>
            <p style="margin:4px 0 0;font-size:13px;color:#a8a49e;">Mallorca, España · hola@covestudiomallorca.com</p>
            <p style="margin:12px 0 0;font-size:12px;color:#a8a49e;line-height:1.5;">
              Tus datos se utilizan únicamente para responder a tu consulta y se retienen por 12 meses.
            </p>
          </div>
        </div>
      `,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Resend error:', err);
    return res.status(500).json({ error: 'Error al enviar el mensaje. Por favor inténtalo de nuevo.' });
  }
};
