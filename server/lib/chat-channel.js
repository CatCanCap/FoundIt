// The Realtime channel name for a match's chat. Anyone who knows a public
// channel's name can listen to it, so the name includes a code made from the
// server's secret. The API only tells the two people in the match what it is.
require('./config');
const crypto = require('crypto');

function chatChannel(matchId) {
  const code = crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update(`chat:${matchId}`)
    .digest('hex')
    .slice(0, 32);
  return `chat-${matchId}-${code}`;
}

module.exports = { chatChannel };
