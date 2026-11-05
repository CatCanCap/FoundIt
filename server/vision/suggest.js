// OWNER: Member 2 (WS2). Turns what Google Cloud Vision reads from a photo
// into suggestions for the found report: a category and a colour from our
// lists, and a brand. No network or database here.

// Words in Vision's labels that point to each category. "Plastic bottle"
// matches "bottle", but "Keyboard" does not match "key".
const CATEGORY_WORDS = {
  'Water Bottle': ['water bottle', 'bottle', 'drinkware', 'flask', 'vacuum flask', 'tumbler'],
  Umbrella: ['umbrella'],
  Laptop: ['laptop', 'netbook', 'personal computer'],
  Tablet: ['tablet computer', 'tablet', 'ipad'],
  Phone: ['mobile phone', 'smartphone', 'telephone', 'iphone', 'feature phone', 'mobile device'],
  Earbuds: ['earbuds', 'earbud', 'earphone', 'earphones', 'airpods'],
  Headphones: ['headphones', 'headphone', 'headset'],
  Keys: ['key', 'keys', 'keychain', 'key chain', 'keyring'],
  Wallet: ['wallet', 'coin purse'],
  Cardholder: ['card holder', 'cardholder'],
  'Student Card': ['identity document', 'id card', 'student card'],
  Bag: ['bag', 'backpack', 'handbag', 'tote bag', 'luggage', 'satchel', 'pouch'],
  Charger: ['charger', 'power adapter', 'ac adapter', 'adapter', 'power bank', 'usb cable', 'cable'],
  Clothing: [
    'clothing',
    'jacket',
    'coat',
    'outerwear',
    'sweater',
    'sweatshirt',
    'hoodie',
    'shirt',
    't-shirt',
    'jersey',
    'cap',
    'hat',
    'scarf',
  ],
  Stationery: [
    'stationery',
    'pen',
    'pencil',
    'pencil case',
    'notebook',
    'writing implement',
    'office supplies',
    'eraser',
    'ruler',
    'calculator',
  ],
};

// Vision scores each guess from 0 to 1. Below these, a guess is left out.
const MIN_CATEGORY_SCORE = 0.5;
const MIN_BRAND_SCORE = 0.3;

// 0.93 becomes 93
const percent = (score) => Math.round(score * 100);

// Letters only, with spaces around, so whole words can be looked for:
// "t-shirt" becomes " t shirt "
const asWords = (text) => ` ${text.replace(/[^a-z]+/g, ' ').trim()} `;

// True when the label contains the word as a whole word
function labelHasWord(label, word) {
  return asWords(label).includes(asWords(word));
}

// Vision's labels and the objects it spotted, as [{ text: 'plastic bottle', score: 0.93 }]
function readLabels(annotations) {
  const labels = (annotations.labelAnnotations || []).map((label) => ({
    text: String(label.description || '').toLowerCase(),
    score: Number(label.score) || 0,
  }));
  const objects = (annotations.localizedObjectAnnotations || []).map((object) => ({
    text: String(object.name || '').toLowerCase(),
    score: Number(object.score) || 0,
  }));
  return [...objects, ...labels];
}

// The category whose label Vision is most sure about
function suggestCategory(annotations, categoryNames) {
  const labels = readLabels(annotations);
  let best = null;
  for (const [category, words] of Object.entries(CATEGORY_WORDS)) {
    if (!categoryNames.includes(category)) continue;
    for (const label of labels) {
      if (label.score < MIN_CATEGORY_SCORE) continue;
      if (!words.some((word) => labelHasWord(label.text, word))) continue;
      if (!best || label.score > best.score) best = { value: category, score: label.score };
    }
  }
  return best && { value: best.value, confidence: percent(best.score) };
}

// "#1f2a5a" becomes { red: 31, green: 42, blue: 90 }
function hexToRgb(hex) {
  return {
    red: parseInt(hex.slice(1, 3), 16),
    green: parseInt(hex.slice(3, 5), 16),
    blue: parseInt(hex.slice(5, 7), 16),
  };
}

// How different two colours look to people (the "redmean" formula)
function colourDistance(a, b) {
  const meanRed = (a.red + b.red) / 2;
  const red = a.red - b.red;
  const green = a.green - b.green;
  const blue = a.blue - b.blue;
  return Math.sqrt(
    (2 + meanRed / 256) * red * red + 4 * green * green + (2 + (255 - meanRed) / 256) * blue * blue,
  );
}

// The colour on our list closest to this one. Clear and Multicolour have no
// hex value, so they are never picked.
function nearestColourName(rgb, colourList) {
  let best = null;
  for (const colour of colourList) {
    if (!colour.hex) continue;
    const distance = colourDistance(rgb, hexToRgb(colour.hex));
    if (!best || distance < best.distance) best = { name: colour.name, distance };
  }
  return best && best.name;
}

// Vision gives the photo's main colours, each with a score. Each one becomes
// the nearest colour on our list, the scores for the same colour are added
// up, and the highest total wins.
function suggestColour(annotations, colourList) {
  const dominant = annotations.imagePropertiesAnnotation?.dominantColors?.colors || [];
  const totals = new Map();
  let all = 0;
  for (const entry of dominant) {
    const score = Number(entry.score) || 0;
    const rgb = {
      red: Number(entry.color?.red) || 0,
      green: Number(entry.color?.green) || 0,
      blue: Number(entry.color?.blue) || 0,
    };
    const name = nearestColourName(rgb, colourList);
    if (!name || score <= 0) continue;
    totals.set(name, (totals.get(name) || 0) + score);
    all += score;
  }
  if (all === 0) return null;
  const [value, score] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  return { value, confidence: percent(score / all) };
}

// The logo Vision is most sure about, cut to 50 characters
function suggestBrand(annotations) {
  const logos = (annotations.logoAnnotations || [])
    .map((logo) => ({ value: String(logo.description || '').trim(), score: Number(logo.score) || 0 }))
    .filter((logo) => logo.value && logo.score >= MIN_BRAND_SCORE)
    .sort((a, b) => b.score - a.score);
  if (logos.length === 0) return null;
  return { value: logos[0].value.slice(0, 50), confidence: percent(logos[0].score) };
}

// annotations is Vision's answer for one photo; categories and colours are
// our lists. Returns { category, colour, brand }, each { value, confidence }
// (confidence from 0 to 100) or null.
function suggestTags(annotations, { categories, colours }) {
  const categoryNames = categories.map((category) => category.name);
  return {
    category: suggestCategory(annotations, categoryNames),
    colour: suggestColour(annotations, colours),
    brand: suggestBrand(annotations),
  };
}

module.exports = { suggestTags, nearestColourName, labelHasWord, CATEGORY_WORDS };
