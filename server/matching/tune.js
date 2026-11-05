// OWNER: Member 3. Measures the matching engine on the seeded pairs. No database needed.
//
//   node matching/tune.js                      score with the weights in index.js
//   node matching/tune.js --weights 0.3,0.3,0.25,0.15
//   node matching/tune.js --compare                    proposal weights next to the ones in use
//   node matching/tune.js --grid               try every weight mix in steps of 0.05
//   node matching/tune.js --misses             also list the pairs that were not top 3
//   node matching/tune.js --hard               the harder test set in data/hard-pairs.json (add --misses)
//   node matching/tune.js --semantic           add the semantic score, from data/embeddings-cache.json
//                                              (made by matching/embed-cache.js). With --hard it shows
//                                              words only next to words and meaning. Try other
//                                              settings with --floor 0.5 --ceiling 0.85
//   node matching/tune.js --semantic-grid      try floor and ceiling pairs in steps of 0.02
//   node matching/tune.js --wide               stress test: every lost report lists 5 or 10
//                                              buildings, with and without the wide-trail discount
//
// For each of the 40 true pairs it posts the found item against every lost item
// (and the lost item against every found item, as when the owner reports last)
// and checks where the true partner ranks. Decoys are look-alikes with no partner.
const { loadSeed } = require('../data/load');
const { loadHardSet } = require('./hard-set');
const { withCachedEmbeddings } = require('./embed-cache');
const { rankAll, WEIGHTS, PROPOSAL_WEIGHTS, MIN_SCORE, MAX_RESULTS, FULL_CREDIT_BUILDINGS } = require('./index');

const seed = loadSeed();
const context = { spots: seed.spots, categories: seed.categories, colours: seed.colours };
const itemsById = new Map(seed.items.map((item) => [item.id, item]));
const lostItems = seed.items.filter((item) => item.type === 'lost');
const foundItems = seed.items.filter((item) => item.type === 'found');

function evaluate(weights) {
  const withWeights = { ...context, weights };
  const result = { top1: 0, top3: 0, shown: 0, rankTotal: 0, wrongShown: 0, decoyShown: 0, queries: 0, misses: [] };

  for (const pair of seed.pairs) {
    const directions = [
      { posted: itemsById.get(pair.foundItemId), pool: lostItems, partner: pair.lostItemId, label: 'found posted' },
      { posted: itemsById.get(pair.lostItemId), pool: foundItems, partner: pair.foundItemId, label: 'lost posted' },
    ];
    for (const { posted, pool, partner, label } of directions) {
      const ranked = rankAll(posted, pool, withWeights);
      const rank = ranked.findIndex((r) => r.candidateId === partner) + 1;
      const shown = ranked.filter((r) => r.score >= MIN_SCORE).slice(0, MAX_RESULTS);
      result.queries += 1;
      result.rankTotal += rank;
      if (rank === 1) result.top1 += 1;
      if (rank <= 3) result.top3 += 1;
      else result.misses.push({ pairId: pair.pairId, label, rank, note: pair.note, top: ranked.slice(0, 3) });
      if (shown.some((r) => r.candidateId === partner)) result.shown += 1;
      result.wrongShown += shown.filter((r) => r.candidateId !== partner).length;
    }
  }

  // A decoy has no partner, so every match shown for it is a false alarm
  for (const decoyId of seed.decoyItemIds) {
    const decoy = itemsById.get(decoyId);
    const pool = decoy.type === 'lost' ? foundItems : lostItems;
    result.decoyShown += rankAll(decoy, pool, withWeights).filter((r) => r.score >= MIN_SCORE).length;
  }
  return result;
}

// The lost item's trail plus a stop in each of the next buildings on the spot
// list, an hour apart around the first stop, until it covers `size` buildings
// (at most 10 stops). Mimics an owner who isn't sure where they were.
function widenTrail(item, size, spots = seed.spots) {
  const spotsById = new Map(spots.map((spot) => [spot.id, spot]));
  const used = new Set(item.trail.map((point) => spotsById.get(point.spotId).building));
  const start = new Date(item.trail[0].from).getTime();
  const end = new Date(item.trail[0].to).getTime();
  const trail = [...item.trail];
  for (const spot of spots) {
    if (used.size >= size || trail.length >= 10) break;
    if (used.has(spot.building)) continue;
    used.add(spot.building);
    const shift = (trail.length - 5) * 60 * 60 * 1000;
    trail.push({ spotId: spot.id, from: new Date(start + shift).toISOString(), to: new Date(end + shift).toISOString() });
  }
  return { ...item, trail };
}

// Each true pair's lost report, posted with a widened trail
function evaluateWide(size, fullCreditBuildings) {
  const wideContext = { ...context, fullCreditBuildings };
  const result = { top1: 0, shown: 0, wrongShown: 0 };
  for (const pair of seed.pairs) {
    const ranked = rankAll(widenTrail(itemsById.get(pair.lostItemId), size), foundItems, wideContext);
    const shown = ranked.filter((r) => r.score >= MIN_SCORE).slice(0, MAX_RESULTS);
    if (ranked[0] && ranked[0].candidateId === pair.foundItemId) result.top1 += 1;
    if (shown.some((r) => r.candidateId === pair.foundItemId)) result.shown += 1;
    result.wrongShown += shown.filter((r) => r.candidateId !== pair.foundItemId).length;
  }
  return result;
}

function format(weights) {
  return `C ${weights.C.toFixed(2)}  A ${weights.A.toFixed(2)}  L ${weights.L.toFixed(2)}  D ${weights.D.toFixed(2)}`;
}

function report(weights, result) {
  const pct = (n) => `${n}/${result.queries} (${Math.round((100 * n) / result.queries)}%)`;
  console.log(format(weights));
  console.log(`  True match ranked 1st:        ${pct(result.top1)}`);
  console.log(`  True match in the top 3:      ${pct(result.top3)}`);
  console.log(`  True match shown (>= ${MIN_SCORE}, top ${MAX_RESULTS}): ${pct(result.shown)}`);
  console.log(`  Average rank of true match:   ${(result.rankTotal / result.queries).toFixed(2)}`);
  console.log(`  Wrong matches shown, per report: ${(result.wrongShown / result.queries).toFixed(2)}`);
  console.log(`  Matches shown for the ${seed.decoyItemIds.length} decoys: ${result.decoyShown}`);
}

// Best first: most true matches in the top 3, then shown, then fewest false alarms
function compare(a, b) {
  return b.result.top3 - a.result.top3
    || b.result.shown - a.result.shown
    || b.result.top1 - a.result.top1
    || (a.result.wrongShown + a.result.decoyShown) - (b.result.wrongShown + b.result.decoyShown);
}

function grid() {
  const runs = [];
  const steps = 20; // 0.05 each
  for (let c = 1; c < steps; c += 1) {
    for (let a = 1; c + a < steps; a += 1) {
      for (let l = 1; c + a + l < steps; l += 1) {
        const d = steps - c - a - l;
        const weights = { C: c / steps, A: a / steps, L: l / steps, D: d / steps };
        runs.push({ weights, result: evaluate(weights) });
      }
    }
  }
  return runs.sort(compare);
}

// The harder test set (data/hard-pairs.json): owner and finder use different
// words, and look-alike found items compete. Each group's lost report is
// posted against every found item (seed and hard set, look-alikes included),
// and each found report against every lost item.
function evaluateHard(weights = WEIGHTS, extra = {}, { semantic = false } = {}) {
  const hard = loadHardSet(seed);
  if (semantic) withCachedEmbeddings(hard.items);
  const withWeights = { ...context, weights, ...extra };
  const allLost = [...lostItems, ...hard.items.filter((item) => item.type === 'lost')];
  const allFound = [...foundItems, ...hard.items.filter((item) => item.type === 'found')];
  const byId = new Map(hard.items.map((item) => [item.id, item]));
  const result = { queries: 0, top1: 0, top3: 0, shown: 0, wrongShown: 0, beatenByLookAlike: 0, misses: [] };

  for (const group of hard.groups) {
    const directions = [
      { posted: byId.get(group.lostItemId), pool: allFound, partner: group.foundItemId, label: 'lost posted' },
      { posted: byId.get(group.foundItemId), pool: allLost, partner: group.lostItemId, label: 'found posted' },
    ];
    for (const { posted, pool, partner, label } of directions) {
      const ranked = rankAll(posted, pool, withWeights);
      const rank = ranked.findIndex((r) => r.candidateId === partner) + 1;
      const shown = ranked.filter((r) => r.score >= MIN_SCORE).slice(0, MAX_RESULTS);
      const partnerScore = rank > 0 ? ranked[rank - 1].score : null;
      result.queries += 1;
      if (rank === 1) result.top1 += 1;
      if (rank >= 1 && rank <= 3) result.top3 += 1;
      if (shown.some((r) => r.candidateId === partner)) result.shown += 1;
      else result.misses.push({ groupId: group.groupId, label, rank, partnerScore, note: group.note, top: ranked.slice(0, 3) });
      result.wrongShown += shown.filter((r) => r.candidateId !== partner).length;
      const lookAlikeAbove = ranked.slice(0, rank > 0 ? rank - 1 : ranked.length)
        .some((r) => group.distractorIds.includes(r.candidateId));
      if (lookAlikeAbove) result.beatenByLookAlike += 1;
    }
  }
  return result;
}

// Runs `run` with the items' embeddings taken off, then puts them back
function withoutEmbeddings(items, run) {
  const saved = items.map((item) => item.embedding);
  for (const item of items) delete item.embedding;
  try {
    return run();
  } finally {
    items.forEach((item, index) => {
      if (saved[index]) item.embedding = saved[index];
    });
  }
}

function reportHard(result) {
  const pct = (n) => `${n}/${result.queries} (${Math.round((100 * n) / result.queries)}%)`;
  console.log(`  True match ranked 1st:        ${pct(result.top1)}`);
  console.log(`  True match in the top 3:      ${pct(result.top3)}`);
  console.log(`  True match shown (>= ${MIN_SCORE}, top ${MAX_RESULTS}): ${pct(result.shown)}`);
  console.log(`  Look-alike ranked above it:   ${pct(result.beatenByLookAlike)}`);
  console.log(`  Wrong matches shown, per report: ${(result.wrongShown / result.queries).toFixed(2)}`);
}

// Every floor and ceiling pair in steps of 0.02, on the seeded pairs and the
// harder set together. The seeded pairs must stay at 80/80 shown; then best
// first: most hard-set matches shown, then ranked 1st, then fewest false alarms.
// Gives the seeded reports their embeddings from data/embeddings-cache.json, so
// evaluate() scores meaning too. Returns how many had none.
function useCachedEmbeddings() {
  return withCachedEmbeddings(seed.items);
}

function semanticGrid(weights = WEIGHTS) {
  useCachedEmbeddings();
  const runs = [];
  const steps = (from, to) => Array.from({ length: Math.round((to - from) / 0.02) + 1 }, (_, i) => Math.round((from + i * 0.02) * 100) / 100);
  for (const share of [0.4, 0.5, 0.6, 0.7, 0.8, 1]) for (const floor of steps(0.6, 0.84)) {
    for (const ceiling of steps(floor + 0.06, 0.98)) {
      const semantic = { floor, ceiling, share };
      context.semantic = semantic;
      const seeded = evaluate(weights);
      const hard = evaluateHard(weights, { semantic }, { semantic: true });
      const noise = seeded.wrongShown / seeded.queries + seeded.decoyShown / seed.decoyItemIds.length
        + hard.wrongShown / hard.queries;
      runs.push({ semantic, seeded, hard, noise });
    }
  }
  return runs
    .filter((run) => run.seeded.shown === run.seeded.queries)
    .sort((a, b) => b.hard.shown - a.hard.shown || b.hard.top1 - a.hard.top1 || a.noise - b.noise);
}

// Run from the command line; the unit tests require this file for widenTrail
function main() {
  const args = process.argv.slice(2);
  const weightsArg = args.indexOf('--weights');
  let weights = WEIGHTS;
  if (weightsArg !== -1) {
    const [C, A, L, D] = args[weightsArg + 1].split(',').map(Number);
    weights = { C, A, L, D };
  }

  const semantic = args.includes('--semantic');
  const settings = {};
  for (const name of ['floor', 'ceiling', 'share']) {
    const at = args.indexOf(`--${name}`);
    if (at !== -1) settings[name] = Number(args[at + 1]);
  }
  const extra = { semantic: settings };
  if (semantic) {
    const missing = useCachedEmbeddings();
    if (missing > 0) console.log(`${missing} seeded reports have no cached embedding; run node matching/embed-cache.js\n`);
    context.semantic = settings;
  }

  if (args.includes('--semantic-grid')) {
    console.log('Best 10 floor and ceiling pairs (seeded: wrong shown per report, decoy matches; hard: shown, 1st, wrong per report):');
    for (const run of semanticGrid(weights).slice(0, 10)) {
      const { seeded, hard } = run;
      console.log(`  share ${run.semantic.share} floor ${run.semantic.floor.toFixed(2)} ceiling ${run.semantic.ceiling.toFixed(2)}`
        + `  seeded wrong ${(seeded.wrongShown / seeded.queries).toFixed(2)} decoys ${seeded.decoyShown}`
        + `  hard shown ${hard.shown}/${hard.queries} 1st ${hard.top1} wrong ${(hard.wrongShown / hard.queries).toFixed(2)}`
        + `  noise ${run.noise.toFixed(2)}`);
    }
  } else if (args.includes('--hard')) {
    if (semantic) {
      console.log(`Harder test set, words only, ${format(weights)}:`);
      reportHard(withoutEmbeddings(seed.items, () => evaluateHard(weights)));
      console.log('\nWords and meaning:');
    } else {
      console.log(`Harder test set, ${format(weights)}:`);
    }
    const result = evaluateHard(weights, extra, { semantic });
    reportHard(result);
    if (args.includes('--misses')) {
      console.log('\nTrue match not shown:');
      for (const miss of result.misses) {
        const top = miss.top.map((r) => `#${r.candidateId} ${r.score}`).join(', ');
        const found = miss.rank > 0 ? `rank ${miss.rank}, score ${miss.partnerScore}` : 'not matchable';
        console.log(`  group ${miss.groupId} (${miss.label}): ${found}. ${miss.note}. Top: ${top}`);
      }
    }
  } else if (args.includes('--wide')) {
    const n = seed.pairs.length;
    for (const size of [5, 10]) {
      console.log(`Every lost report lists ${size} buildings:`);
      for (const [label, full] of [['no discount', Infinity], [`discount above ${FULL_CREDIT_BUILDINGS}`, FULL_CREDIT_BUILDINGS]]) {
        const r = evaluateWide(size, full);
        console.log(`  ${label.padEnd(20)} true match 1st ${r.top1}/${n}  shown ${r.shown}/${n}  wrong shown per report ${(r.wrongShown / n).toFixed(2)}`);
      }
    }
  } else if (args.includes('--compare')) {
    console.log('Proposal weights:');
    report(PROPOSAL_WEIGHTS, evaluate(PROPOSAL_WEIGHTS));
    console.log('\nTuned weights (the ones in use):');
    report(WEIGHTS, evaluate(WEIGHTS));
  } else if (args.includes('--grid')) {
    console.log('Current weights:');
    report(weights, evaluate(weights));
    console.log('\nBest 10 weight mixes:');
    for (const run of grid().slice(0, 10)) {
      const r = run.result;
      console.log(`  ${format(run.weights)}  top1 ${r.top1}  top3 ${r.top3}  shown ${r.shown}  wrong ${r.wrongShown}  decoys ${r.decoyShown}`);
    }
  } else {
    const result = evaluate(weights);
    report(weights, result);
    if (args.includes('--misses')) {
      console.log('\nNot in the top 3:');
      for (const miss of result.misses) {
        const top = miss.top.map((r) => `#${r.candidateId} ${r.score}`).join(', ');
        console.log(`  pair ${miss.pairId} (${miss.label}): rank ${miss.rank}. ${miss.note}. Top: ${top}`);
      }
    }
  }
}

module.exports = { evaluate, evaluateHard, evaluateWide, widenTrail, semanticGrid, useCachedEmbeddings };
if (require.main === module) main();
