// OWNER: Member 3. Puts together the owner's Matches page (Figma V09 and V10)
// from what the models return. Pure: no database calls, so it is unit tested
// without the shared test database.
//
// buildMyMatches({ reports, matchesByReport, foundItems, declinedByReport })
//   reports           the owner's lost items (Item.findAll), newest first
//   matchesByReport   Map: lost item id -> Match.findLiveByItem(id)
//   foundItems        the found items those matches point to (Item.findByIds)
//   declinedByReport  Map: lost item id -> [{ matchId, foundItemId, declinedAt }],
//                     the owner's claims the finder declined (optional)
// Returns [{ item, matches: [{ ...match, reasonParts, item: foundItem }],
//            declined: [{ matchId, declinedAt, item: foundItem }] }]:
//   - only reports still waiting (open) or being returned (matched)
//   - each report's matches best first, leaving out any whose found item was
//     removed by an admin or hidden by reports, each with its reasons as
//     reasonParts: [{ lead, detail }] (see reasons.js), so the page never
//     has to pick the reason text apart
//   - each report's declined claims newest first, leaving out removed or hidden finds
//   - reports with matches first (best match first), then the rest newest first

const { parseReason } = require('./reasons');

const SHOWN_STATUSES = new Set(['open', 'matched']);

function isVisible(item) {
  return Boolean(item) && item.status !== 'removed' && !item.hiddenAt;
}

function bestScore(report) {
  return report.matches.length > 0 ? report.matches[0].score : -1;
}

function buildMyMatches({ reports, matchesByReport, foundItems, declinedByReport = new Map() }) {
  const foundById = new Map(foundItems.map((item) => [Number(item.id), item]));

  const result = reports
    .filter((report) => report.type === 'lost' && SHOWN_STATUSES.has(report.status))
    .map((report) => {
      const matches = (matchesByReport.get(Number(report.id)) || [])
        .map((match) => ({
          ...match,
          reasonParts: (match.reasons || []).map(parseReason),
          item: foundById.get(Number(match.foundItemId)),
        }))
        .filter((match) => isVisible(match.item))
        .sort((a, b) => b.score - a.score);
      const declined = (declinedByReport.get(Number(report.id)) || [])
        .map(({ matchId, foundItemId, declinedAt }) => ({
          matchId, declinedAt, item: foundById.get(Number(foundItemId)),
        }))
        .filter((entry) => isVisible(entry.item))
        .sort((a, b) => String(b.declinedAt).localeCompare(String(a.declinedAt)));
      return { item: report, matches, declined };
    });

  // Array.prototype.sort is stable, so reports without matches stay newest first
  return result.sort((a, b) => bestScore(b) - bestScore(a));
}

module.exports = { buildMyMatches };
