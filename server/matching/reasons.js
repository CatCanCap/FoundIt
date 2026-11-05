// OWNER: Member 3. One reason a pair matched, as { lead, detail }:
//   { lead: 'same brand', detail: 'Hydro Flask' }
//   { lead: 'both mention', detail: 'sticker, dent' }
//   { lead: 'within a day', detail: '' }
// The signals build these. The matches table keeps reasons as text, so each is
// saved in one fixed form, "lead: detail" (or just "lead"), and turned back
// into { lead, detail } for the Matches page (my-matches.js). A lead never
// contains ": ", so the two always come apart again; the unit tests check this
// for every reason the seeded pairs produce.

const SEPARATOR = ': ';

function reason(lead, detail = '') {
  return { lead, detail };
}

function formatReason({ lead, detail }) {
  return detail ? `${lead}${SEPARATOR}${detail}` : lead;
}

// A saved reason back as { lead, detail }. Text saved before this form existed
// ("same brand (Sony)") comes back whole as the lead.
function parseReason(text) {
  const value = String(text || '');
  const at = value.indexOf(SEPARATOR);
  if (at === -1) return { lead: value, detail: '' };
  return { lead: value.slice(0, at), detail: value.slice(at + SEPARATOR.length) };
}

module.exports = { reason, formatReason, parseReason, SEPARATOR };
