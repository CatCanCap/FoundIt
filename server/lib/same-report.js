// Spots the same report sent twice. When posting is slow, the page can give up
// waiting while the server still saves the report; the person presses Try
// again (often after nudging a time) and a copy is saved. POST /api/items asks
// isSameReport about the person's reports from the last few minutes and, on a
// match, answers with the earlier one instead of saving another.
//
// Two reports are the same when they have the same type, title, description,
// category, brand, colours and places (in order). Exact times and the photo
// link are not compared: on 2026-11-04 a student posted one lost tablet four
// times in three minutes, two of them with time windows moved by 15 minutes.

// The window in which a repeat counts as a retry: 10 minutes, or
// REPEAT_WINDOW_SECONDS. The test run sets it to 0 (vitest.config.mjs), because
// the API tests post the same made-up report many times on purpose.
function repeatWindowMs() {
  const text = String(process.env.REPEAT_WINDOW_SECONDS ?? '').trim();
  const seconds = Number(text);
  return text !== '' && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 10 * 60 * 1000;
}

function normalText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function placesKey(trail) {
  return (trail || []).map((point) => `${Number(point.spotId)}:${point.roomId == null ? '' : Number(point.roomId)}`).join('|');
}

// item: a saved item; report: the new report about to be saved
function isSameReport(item, report) {
  return item.type === report.type
    && normalText(item.title) === normalText(report.title)
    && normalText(item.description) === normalText(report.description)
    && item.category === report.category
    && normalText(item.brand) === normalText(report.brand)
    && (item.colours || []).join('|') === (report.colours || []).join('|')
    && placesKey(item.trail) === placesKey(report.trail);
}

module.exports = { isSameReport, repeatWindowMs };
