// Feature 5: each person's track record, for the admin deciding a case, and
// the small facts the admin queues show. These are pure functions (no
// database), so they can be unit tested; admin-shared.js loads the data.
const User = require('../models/user-model');

function emptyHistory() {
  return {
    disputesRaised: 0, // disputes they opened on someone else's claim
    disputesRaisedWon: 0, // of those, how many ended with the item going to them
    disputesAgainst: 0, // disputes opened on their claims
    disputesLost: 0, // of those, how many an admin decided against them
    claimsWithdrawn: 0, // claims they gave up after a dispute
    claimsDeclined: 0, // claims the finder declined
    warnings: 0,
    suspensions: 0, // times suspended, including now
    suspendedAt: null, // set while suspended now
    openReports: 0, // reports on their messages or posts still waiting
    actionedReports: 0, // reports an admin acted on (warned, removed or suspended)
  };
}

// The track record of each person in `userIds`, as { [userId]: history }.
// `exclude` leaves out the case being decided, so the numbers are about
// everything else: { disputeId, claimId, reportId }.
//   data.raised       disputes these people raised
//   data.claims       claims these people made
//   data.onClaims     disputes on any of those claims
//   data.actions      account actions on these people (warn, suspend, unsuspend)
//   data.reports      open and actioned reports, each with authorId added
//   data.users        the people themselves (for suspendedAt)
function summariseHistory(userIds, data, exclude = {}) {
  const history = Object.fromEntries(userIds.map((id) => [id, emptyHistory()]));
  const of = (id) => history[id];
  const skipDispute = (dispute) => dispute.id === exclude.disputeId;

  for (const dispute of data.raised || []) {
    if (!of(dispute.raisedBy) || skipDispute(dispute)) continue;
    of(dispute.raisedBy).disputesRaised += 1;
    if (['upheld', 'withdrawn'].includes(dispute.status)) of(dispute.raisedBy).disputesRaisedWon += 1;
  }

  const claimerOf = new Map((data.claims || []).map((claim) => [claim.id, claim.claimerId]));
  for (const claim of data.claims || []) {
    if (!of(claim.claimerId) || claim.id === exclude.claimId) continue;
    if (claim.status === 'withdrawn') of(claim.claimerId).claimsWithdrawn += 1;
    if (claim.status === 'declined') of(claim.claimerId).claimsDeclined += 1;
  }
  for (const dispute of data.onClaims || []) {
    const claimer = of(claimerOf.get(dispute.claimId));
    if (!claimer || skipDispute(dispute)) continue;
    claimer.disputesAgainst += 1;
    if (dispute.status === 'upheld') claimer.disputesLost += 1;
  }

  for (const action of data.actions || []) {
    if (!of(action.userId)) continue;
    if (action.action === 'warn_user') of(action.userId).warnings += 1;
    if (action.action === 'suspend_user') of(action.userId).suspensions += 1;
  }
  for (const user of data.users || []) {
    if (of(user.id) && user.suspendedAt) of(user.id).suspendedAt = user.suspendedAt;
  }

  for (const report of data.reports || []) {
    if (!of(report.authorId) || report.id === exclude.reportId) continue;
    if (report.status === 'open') of(report.authorId).openReports += 1;
    if (report.status === 'actioned') of(report.authorId).actionedReports += 1;
  }
  return history;
}

// Who wrote what each report points at: the message's sender or the post's owner
function withAuthors(reports, messagesById, itemsById) {
  return reports.map((report) => ({
    ...report,
    authorId: report.messageId
      ? messagesById.get(report.messageId)?.senderId || null
      : itemsById.get(report.itemId)?.postedBy || null,
  }));
}

// For the queue: did the handoff on the disputed claim complete before the
// dispute (a returned item reopened)? And after an upheld dispute, has the
// item reached the person who disputed it?
//   handoffsByMatch  Map of matchId -> handoffs on that match
function disputeQueueFacts(dispute, claimsById, handoffsByMatch) {
  const handoffsOf = (claimId) => handoffsByMatch.get(claimsById.get(claimId)?.matchId) || [];
  const itemWasReturned = handoffsOf(dispute.claimId).some(
    (handoff) => handoff.status === 'completed' && handoff.completedAt
      && new Date(handoff.completedAt) <= new Date(dispute.createdAt),
  );
  const returnDone = Boolean(dispute.newClaimId) && handoffsOf(dispute.newClaimId).some(
    (handoff) => ['handed_over', 'completed'].includes(handoff.status),
  );
  return { itemWasReturned, returnDone };
}

// One row of the People list from a person and their account actions (newest first)
function personRow(user, actions) {
  const own = actions.filter((action) => action.userId === user.id);
  const last = own[0] || null;
  return {
    ...User.toContact(user),
    warnings: own.filter((action) => action.action === 'warn_user').length,
    suspensions: own.filter((action) => action.action === 'suspend_user').length,
    lastAction: last ? { action: last.action, reason: last.reason, createdAt: last.createdAt } : null,
  };
}

module.exports = { emptyHistory, summariseHistory, withAuthors, disputeQueueFacts, personRow };
