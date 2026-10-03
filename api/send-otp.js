// Supabase Auth Hook -> Pingram. Secrets live in Vercel environment variables, never in index.html.
// Supabase dashboard > Authentication > Auth Hooks:
//   Send SMS hook   -> HTTPS URL: https://YOUR-SITE/api/send-otp?channel=sms
//   Send Email hook -> HTTPS URL: https://YOUR-SITE/api/send-otp?channel=email
// Each hook shows a secret (v1,whsec_...). Save them as SEND_SMS_HOOK_SECRET / SEND_EMAIL_HOOK_SECRET.
const { Webhook } = require('standardwebhooks');

const raw = (req) => new Promise((ok, no) => {
  let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)); req.on('error', no);
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const channel = req.query.channel === 'email' ? 'email' : 'sms';
  const secret = process.env[channel === 'sms' ? 'SEND_SMS_HOOK_SECRET' : 'SEND_EMAIL_HOOK_SECRET'];
  const fail = (code, message) => res.status(code).json({ error: { http_code: code, message } });
  if (!secret || !process.env.PINGRAM_API_KEY) return fail(500, 'Server is not configured.');
  try {
    // Verify the call really came from Supabase (needs the unparsed body).
    const data = new Webhook(secret.replace('v1,whsec_', '')).verify(await raw(req), req.headers);
    const { Pingram } = await import('pingram');
    const cfg = { apiKey: process.env.PINGRAM_API_KEY };
    if (process.env.PINGRAM_REGION) cfg.region = process.env.PINGRAM_REGION; // 'us' | 'eu' | 'ca'
    const pingram = new Pingram(cfg);

    if (channel === 'sms') {
      const phone = data.user.phone.startsWith('+') ? data.user.phone : '+' + data.user.phone;
      await pingram.send({
        type: 'otp',
        to: { number: phone },
        sms: { message: `Your Sarkar Seva code is ${data.sms.otp}. Do not share it with anyone.` },
      });
    } else {
      await pingram.send({
        type: 'otp_email',
        to: { email: data.user.email },
        email: {
          subject: 'Your Sarkar Seva login code',
          html: `<p>Your Sarkar Seva login code is</p><p style="font-size:24px;letter-spacing:4px"><b>${data.email_data.token}</b></p><p>If you did not ask for this, ignore this email.</p>`,
        },
      });
    }
    return res.status(200).json({});
  } catch (e) {
    console.error('send-otp hook failed:', e.message);
    return fail(500, 'Could not send the code.');
  }
};
