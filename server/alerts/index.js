// Alert emails for new matches and claims. Only sent to people with alertsOn;
// a failed email never stops the post or claim.
require('../lib/config');
const Item = require('../models/item-model');
const User = require('../models/user-model');
const emailjs = require('./emailjs');
const { newMatchEmails, newClaimEmail } = require('./emails');
const { foundPlacesFor } = require('../lib/found-places');

function appUrl() {
  return process.env.APP_URL || 'https://foundit-chi-amber.vercel.app';
}

// Looks up the two items and the two people of one match, then writes its emails
async function emailsForMatch(match) {
  const [lostItem, foundItem] = await Promise.all([
    Item.findById(match.lostItemId),
    Item.findById(match.foundItemId),
  ]);
  const [owner, finder] = await Promise.all([
    User.findById(lostItem.postedBy),
    User.findById(foundItem.postedBy),
  ]);
  // What of the find the owner may see, as on the Matches page. If that cannot
  // be looked up, the email leaves the place and time out.
  const ownerFinds = await foundPlacesFor(owner).catch(() => new Set());
  return newMatchEmails({ match, lostItem, foundItem, owner, finder, appUrl: appUrl(), ownerFinds });
}

// Emails both people of each new match, in parallel
exports.notifyNewMatches = async function (matches) {
  const emailLists = await Promise.all(matches.map(emailsForMatch));
  const emails = emailLists.flat();
  const results = await Promise.allSettled(emails.map((email) => emailjs.sendEmail(email)));
  for (const result of results) {
    if (result.status === 'rejected') console.error('An alert email failed:', result.reason);
  }
};

// Emails the finder of a newly claimed match. Never throws.
exports.notifyNewClaim = async function (match) {
  try {
    const foundItem = await Item.findById(match.foundItemId);
    const finder = foundItem && await User.findById(foundItem.postedBy);
    const email = finder && newClaimEmail({ match, foundItem, finder, appUrl: appUrl() });
    if (email) await emailjs.sendEmail(email);
  } catch (error) {
    console.error(`The claim alert for match ${match.id} failed:`, error);
  }
};
