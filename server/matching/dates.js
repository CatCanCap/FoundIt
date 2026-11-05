// OWNER: Member 3. The D (date proximity) signal.
//
// dateScore(pointA, pointB)
//   pointA, pointB  trail points: { from, to } as ISO strings
// Returns { score, reasons, daysApart }: 100 when the two time windows touch or
// overlap, falling in a straight line to 0 at 14 days apart.
//
// foundBeforeLost(lostPoint, foundPoint)
// True when the item was found before the owner was even there, so the pair is
// impossible (an umbrella handed in on Saturday is not the one lost on Sunday).
// People type their times from memory, so the found time may be up to an hour
// before the lost time before it counts as impossible.

const { reason } = require('./reasons');
const { HOUR, DAY } = require('../lib/time');

const MAX_DAYS = 14;
const GRACE = 1 * HOUR;

// Gap between two time windows in days; 0 if they overlap
function daysBetween(pointA, pointB) {
  const startA = new Date(pointA.from).getTime();
  const endA = new Date(pointA.to).getTime();
  const startB = new Date(pointB.from).getTime();
  const endB = new Date(pointB.to).getTime();
  const gap = Math.max(startA, startB) - Math.min(endA, endB);
  return Math.max(0, gap) / DAY;
}

function describe(days) {
  const whole = Math.round(days);
  if (whole === 0) return 'within a day';
  if (whole === 1) return '1 day apart';
  return `${whole} days apart`;
}

function dateScore(pointA, pointB) {
  const daysApart = daysBetween(pointA, pointB);
  if (Number.isNaN(daysApart)) return { score: 0, reasons: [], daysApart: null };
  const score = Math.max(0, 100 * (1 - daysApart / MAX_DAYS));
  // Only worth mentioning as a reason when the dates are close
  const reasons = daysApart <= 7 ? [reason(describe(daysApart))] : [];
  return { score, reasons, daysApart };
}

function foundBeforeLost(lostPoint, foundPoint) {
  return new Date(foundPoint.to).getTime() + GRACE < new Date(lostPoint.from).getTime();
}

module.exports = { dateScore, daysBetween, foundBeforeLost, MAX_DAYS, GRACE };
