// Builds the alert emails (no database or network access)
const { matchForViewer } = require('../lib/item-privacy');

function matchLink(appUrl, matchId) {
  return `${appUrl}/matches/${matchId}`;
}

// One email for each person in a new match who has alerts turned on
// ownerFinds: the finds whose place and time the owner may see
// (lib/found-places.js); without it, only this match is looked at
function newMatchEmails({ match, lostItem, foundItem, owner, finder, appUrl, ownerFinds }) {
  const score = Math.round(match.score);
  const reasonsLine = (reasons) => (reasons.length > 0 ? ` (${reasons.join(' · ')})` : '');
  const why = reasonsLine(match.reasons);
  // The owner's email leaves out the place and time reasons unless their
  // report already said them, like the Matches page (lib/item-privacy.js)
  const ownerWhy = reasonsLine(matchForViewer(match, ownerFinds).reasons);
  const link = matchLink(appUrl, match.id);
  const emails = [];

  if (owner.alertsOn) {
    emails.push({
      toEmail: owner.email,
      toName: owner.name,
      subject: `Possible match for your ${lostItem.title}`,
      message: `Someone found "${foundItem.title}". It is a ${score}% match${ownerWhy}.`,
      link,
    });
  }
  if (finder.alertsOn) {
    emails.push({
      toEmail: finder.email,
      toName: finder.name,
      subject: `The owner of the ${foundItem.title} may have reported it`,
      message: `"${lostItem.title}" is a ${score}% match${why}. If the owner claims it, `
        + 'you will see a detail only the owner would know and can chat to arrange the handoff.',
      link,
    });
  }
  return emails;
}

// Tells the finder their find was claimed, without saying who claimed it
function newClaimEmail({ match, foundItem, finder, appUrl }) {
  if (!finder.alertsOn) return null;
  return {
    toEmail: finder.email,
    toName: finder.name,
    subject: `Someone claimed the ${foundItem.title} you found`,
    message: 'The owner added a detail only they would know. Check it in the chat, then plan '
      + 'the handoff or decline the claim.',
    link: `${appUrl}/matches/${match.id}/handoff`,
  };
}

module.exports = { newMatchEmails, newClaimEmail };
