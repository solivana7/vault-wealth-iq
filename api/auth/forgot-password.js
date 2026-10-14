import pg from 'pg';
import crypto from 'crypto';
const { Client } = pg;

const FROM_ADDRESS = 'VAULT <noreply@lastwishvault.com>';
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

async function sendResetEmail(toEmail, name, resetUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const html = `<!doctype html><html><head><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:40px 20px">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
      <tr><td style="padding:32px 36px 20px 36px;border-bottom:1px solid #e5e7eb">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:800;letter-spacing:.06em;color:#111827">VAULT</div>
        <div style="color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.14em;margin-top:4px;font-weight:600">Wealth Intelligence Platform</div>
      </td></tr>
      <tr><td style="padding:32px 36px 8px 36px">
        <div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:14px">Reset your password</div>
        <div style="font-size:15px;line-height:1.6;color:#374151;margin-bottom:24px">Hi ${name || 'there'},<br><br>Click the button below to choose a new password. This link expires in 1 hour.</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:#111827">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px">Reset Password</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:24px 36px 32px 36px;border-top:1px solid #e5e7eb;margin-top:24px">
        <div style="font-size:12px;color:#6b7280;line-height:1.6">If the button doesn't work, paste this link into your browser:<br><a href="${resetUrl}" style="color:#2563eb;word-break:break-all">${resetUrl}</a></div>
        <div style="font-size:11px;color:#9ca3af;margin-top:18px;line-height:1.5">If you didn't request this, ignore this email — your password won't change.</div>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#9ca3af;margin-top:16px">VAULT · vaultwealthiq.com</div>
  </td></tr>
</table>
</body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [toEmail],
      subject: 'Reset your VAULT password',
      html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Resend error: ' + res.status + ' ' + txt);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  const normalizedEmail = email.toLowerCase().trim();
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    const userRow = await client.query('SELECT id, email, name FROM users WHERE email = $1', [normalizedEmail]);
    // Always return success to prevent account enumeration
    if (userRow.rows.length === 0) {
      await client.end();
      return res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    const user = userRow.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + TOKEN_TTL_MS;

    await client.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2, updated_at = NOW() WHERE id = $3',
      [token, expires, user.id]
    );
    await client.end();

    const origin = req.headers.origin || ('https://' + (req.headers.host || 'vaultwealthiq.com'));
    const resetUrl = `${origin}/reset?token=${token}`;

    await sendResetEmail(user.email, user.name, resetUrl);

    return res.status(200).json({ success: true, message: 'Reset link sent. Check your inbox.' });
  } catch (err) {
    try { await client.end(); } catch {}
    return res.status(500).json({ error: 'Reset request failed: ' + err.message });
  }
}
