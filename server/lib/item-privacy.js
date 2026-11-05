// What of an item each viewer may see. No database here: the controllers
// look up the viewer's matches and pass them in.
//
// Where and when a found item was handed in is private. It is the test of a
// real owner: if anyone could read it off the feed, someone could write a lost
// report with that place and time and claim a thing that is not theirs. So
// only the finder, admins, and people whose own lost report already named the
// same building around the same time see it (see knowsWhereAndWhen). Matching
// still uses it, on the server.

// The place and time scores of a match (breakdown.L and .D, 0 to 100, from
// matching/location.js and matching/dates.js) that count as "your report
// already said it": the same building or closer, and within about a week
const PLACE_KNOWN = 60;
const TIME_KNOWN = 50;

// The leads of the matching reasons that give away a place or a time
// (matching/location.js, matching/index.js and matching/dates.js). The other
// reasons (category, colour, brand, words) only repeat the found item's own
// details, which everyone sees.
const PLACE_LEADS = ['same room', 'same area', 'same place', 'same floor', 'same building', 'nearby buildings'];
const PLACE_OR_TIME_REASON = /^(trail covers \d+ buildings|within a day|\d+ days? apart)$/;

// The poster and admins see everything about an item
function seesAll(item, viewer) {
  return Boolean(viewer && (viewer.id === item.postedBy || viewer.role === 'admin'));
}

// True when the lost report of this match already named the found item's
// building, around the time it was found
function knowsWhereAndWhen(match) {
  const breakdown = (match && match.breakdown) || {};
  return Number(breakdown.L) >= PLACE_KNOWN && Number(breakdown.D) >= TIME_KNOWN;
}

// The found item ids one person may see the place and time of, from all the
// matches of their lost reports: a find counts only when every one of their
// matches on it passes knowsWhereAndWhen. So one report that guessed the
// wrong building or time is final, and posting more reports with other
// guesses never reveals it.
function knownFinds(matches) {
  const verdict = new Map();
  for (const match of matches) {
    const id = Number(match.foundItemId);
    verdict.set(id, (verdict.get(id) ?? true) && knowsWhereAndWhen(match));
  }
  return new Set([...verdict].filter(([, known]) => known).map(([id]) => id));
}

// A found item without its place and time: every trail point loses its spot,
// room and times, and placeHidden tells the page to say so
function hidePlace(item) {
  return {
    ...item,
    placeHidden: true,
    trail: (item.trail || []).map((point) => ({ ...point, spotId: null, roomId: null, from: null, to: null })),
  };
}

// The item as this viewer may see it.
// - The photo of a lost item is private: the lost report promises "Only you
//   and admins see it", so everyone else gets it without its photoUrl. Its
//   places stay, so finders know where to look.
// - A found item keeps its photo, which helps the owner recognise it, but
//   loses its place and time unless its id is in finds (see knownFinds).
function forViewer(item, viewer, finds = new Set()) {
  if (!item || seesAll(item, viewer)) return item;
  if (item.type === 'lost') return item.photoUrl ? { ...item, photoUrl: null } : item;
  if (finds.has(Number(item.id))) return item;
  return hidePlace(item);
}

function isPlaceOrTimeReason(text) {
  const lead = String(text).split(': ')[0];
  return PLACE_LEADS.includes(lead) || PLACE_OR_TIME_REASON.test(lead);
}

// A match as the owner of its lost report may see it. Unless they may see
// the find's place and time, it loses the reasons and the place and time
// scores, which hint at them ("nearby buildings: SOE and SCIS 1", "3 days
// apart"). The total score stays.
// finds: the owner's knownFinds (see lib/found-places.js). Without it, only
// this match is looked at.
function matchForViewer(match, finds) {
  if (!match) return match;
  const known = finds ? finds.has(Number(match.foundItemId)) : knowsWhereAndWhen(match);
  if (known) return match;
  return {
    ...match,
    breakdown: { ...match.breakdown, L: null, D: null },
    reasons: (match.reasons || []).filter((text) => !isPlaceOrTimeReason(text)),
  };
}

module.exports = {
  PLACE_KNOWN, TIME_KNOWN, knowsWhereAndWhen, knownFinds, hidePlace, forViewer, isPlaceOrTimeReason, matchForViewer,
};
