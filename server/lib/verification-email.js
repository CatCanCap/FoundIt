// Sends a 6-digit email code through EmailJS, using its own branded template
// (server/email-templates/verify-email.html), separate from the alert template
// in alerts/ (Member 6). The same template serves two purposes, because the
// free EmailJS plan allows only two templates:
//   'verify'  confirm the SMU email after registering
//   'reset'   reset a forgotten password
// The sentences that differ are sent as template values (WORDING below).
//
// Set up once in the EmailJS dashboard (see "Email verification" in the README):
// a template whose HTML is verify-email.html, with "To Email" {{to_email}} and
// subject {{subject}}. Its id goes in EMAILJS_VERIFY_TEMPLATE_ID; the service
// and the two keys are the same EMAILJS_ settings the alerts use.
require('./config');

const SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';

// The sentences that change with the purpose. Plain text: EmailJS escapes
// {{ }} values, so no HTML entities here.
const WORDING = {
  verify: {
    subject: (code) => `Your FoundIt code is ${code}`,
    heading: 'Confirm your SMU email',
    intro: 'Enter this code in FoundIt to confirm your SMU email.',
    ignore_note: 'Didn’t sign up for FoundIt? You can ignore this email. Nobody can use this address on FoundIt without the code.',
    sent_because: 'someone signed up for FoundIt with this address',
  },
  reset: {
    subject: (code) => `Your FoundIt password reset code is ${code}`,
    heading: 'Reset your password',
    intro: 'Enter this code in FoundIt to reset your password.',
    ignore_note: 'Didn’t ask to reset your password? You can ignore this email; your password stays the same.',
    sent_because: 'someone asked to reset the FoundIt password for this address',
  },
};

// The values the template fills in. No network here, so it is easy to test.
// purpose: 'verify' (the default) or 'reset'
function verificationParams({ user, code, minutes, purpose = 'verify' }) {
  const wording = WORDING[purpose];
  if (!wording) throw new Error(`Unknown email code purpose: ${purpose}`);
  return {
    to_email: user.email,
    to_name: user.name,
    subject: wording.subject(code),
    heading: wording.heading,
    intro: wording.intro,
    ignore_note: wording.ignore_note,
    sent_because: wording.sent_because,
    otp_code: code,
    minutes: String(minutes),
  };
}

// Returns true if EmailJS accepted the email. Sends nothing (and returns
// false) without the settings, or while Vitest is running.
async function send({ user, code, minutes, purpose = 'verify' }) {
  const {
    EMAILJS_SERVICE_ID, EMAILJS_VERIFY_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY,
  } = process.env;
  if (process.env.VITEST) return false;
  if (!EMAILJS_SERVICE_ID || !EMAILJS_VERIFY_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.warn('EmailJS verification settings are missing, so no code was emailed');
    return false;
  }

  const response = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_VERIFY_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: verificationParams({ user, code, minutes, purpose }),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`EmailJS refused the email: ${response.status} ${await response.text()}`);
  }
  return true;
}

module.exports = { verificationParams, send };
