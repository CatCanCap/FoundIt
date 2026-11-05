// Sends one email through the EmailJS REST API. The template uses {{to_email}},
// {{to_name}}, {{subject}}, {{message}} and {{link}}.
require('../lib/config');

const SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';

// Returns true if sent. Sends nothing without the settings or during tests.
async function sendEmail({ toEmail, toName, subject, message, link }) {
  const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = process.env;
  if (process.env.VITEST) return false;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.warn('EmailJS settings are missing, so no alert was sent');
    return false;
  }

  const response = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: { to_email: toEmail, to_name: toName, subject, message, link },
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`EmailJS refused the email: ${response.status} ${await response.text()}`);
  }
  return true;
}

module.exports = { sendEmail };
