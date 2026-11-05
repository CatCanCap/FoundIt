// Runs work the reply does not need (emails, the chat ping) after the reply is
// sent, so a slow email service never makes a request slow.
//
// On Vercel a function may stop once its reply is sent; waitUntil from
// @vercel/functions keeps it running until the work finishes. Outside Vercel
// (npm run dev, the tests) waitUntil does nothing and the work simply finishes
// in the same process.
//
// work: a function that may return a promise. Its errors are logged with
// `label` and never reach the request. Returns the promise, so a test can wait
// for it.
const { waitUntil } = require('@vercel/functions');

function inBackground(label, work) {
  const running = Promise.resolve()
    .then(work)
    .then(() => undefined)
    .catch((error) => console.error(`${label}:`, error));
  waitUntil(running);
  return running;
}

module.exports = { inBackground };
