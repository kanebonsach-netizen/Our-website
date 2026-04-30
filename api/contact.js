const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://covestudiomallorca.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, message, plan, _honey } = req.body || {};

  // Honeypot — bots fill this, real users never see it
  if (_honey) return res.status(200).json({ success: true });

  // Validation
  const n = (name    || '').trim();
  const e = (email   || '').trim();
  const m = (message || '').trim();

  if (!n || !e || !m)       return res.status(400).json({ error: 'Por favor rellena todos los campos requeridos.' });
  if (n.length < 2)         return res.status(400).json({ error: 'El nombre es demasiado corto.' });
  if (!isValidEmail(e))     return res.status(400).json({ error: 'El email no es válido.' });
  if (m.length < 10)        return res.status(400).json({ error: 'El mensaje es demasiado corto (mínimo 10 caracteres).' });

  const planLabel = PLAN_LABELS[plan] || 'No especificado';
  const msgHtml   = escapeHtml(m).replace(/\n/g, '<br>');

  try {
    // Notification to Cove Studio
    await resend.emails.send({
      from:    'Cove Studio Contact <hola@covestudiomallorca.com>',
      to:      ['infocovestudio1@gmail.com'],
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
      from:    'Cove Studio <hola@covestudiomallorca.com>',
      to:      [e],
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
