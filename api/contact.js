const nodemailer = require('nodemailer');

const mailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hits = new Map();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const naam = String(b.naam || '').trim().slice(0, 120);
  const mail = String(b.mail || '').trim().slice(0, 200);
  const bericht = String(b.bericht || '').trim().slice(0, 5000);

  /* verborgen spamveld: bots vullen het in, mensen niet */
  if (b.website) return res.status(200).json({ ok: true });
  if (!naam || !mailRe.test(mail) || !bericht) {
    return res.status(400).json({ ok: false, fout: 'Vul je naam, een geldig e-mailadres en je bericht in.' });
  }

  /* eenvoudige rem: maximaal 5 berichten per uur per IP */
  const ip = String(req.headers['x-forwarded-for'] || 'onbekend').split(',')[0].trim();
  const nu = Date.now();
  const lijst = (hits.get(ip) || []).filter((t) => nu - t < 3600000);
  if (lijst.length >= 5) return res.status(429).json({ ok: false, fout: 'Je hebt al meerdere berichten gestuurd. Probeer het later opnieuw.' });
  lijst.push(nu);
  hits.set(ip, lijst);

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !CONTACT_TO) {
    return res.status(500).json({ ok: false, fout: 'Het formulier is nog niet volledig ingesteld.' });
  }
  const port = Number(SMTP_PORT) || 465;
  try {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({
      from: '"Website" <' + SMTP_USER + '>',
      to: CONTACT_TO,
      replyTo: '"' + naam.replace(/["\r\n]/g, '') + '" <' + mail + '>',
      subject: 'Nieuw bericht via de website van ' + naam.replace(/[\r\n]/g, ' '),
      text: 'Naam: ' + naam + '\nE-mail: ' + mail + '\n\n' + bericht,
      html: '<p><b>Naam:</b> ' + esc(naam) + '<br><b>E-mail:</b> ' + esc(mail) + '</p><p>' + esc(bericht).replace(/\n/g, '<br>') + '</p>',
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Mail versturen mislukt:', e && e.message);
    return res.status(500).json({ ok: false, fout: 'Versturen is niet gelukt. Probeer het later opnieuw.' });
  }
};
