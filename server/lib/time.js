// Time constants shared across the server, so every file counts the same way
const HOUR = 60 * 60 * 1000;
// One day in milliseconds, for working out "N days ago" and "within N days"
const DAY = 24 * HOUR;
// Singapore is UTC+8 all year (no daylight saving), so a Singapore clock time
// is the UTC time plus 8 hours
const SINGAPORE_OFFSET_HOURS = 8;

module.exports = { HOUR, DAY, SINGAPORE_OFFSET_HOURS };
