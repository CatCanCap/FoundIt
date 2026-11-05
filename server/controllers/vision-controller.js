// OWNER: Member 2 (WS2). Suggests a found item's details from its photo.
const Category = require('../models/category-model');
const Colour = require('../models/colour-model');
const { httpError } = require('../lib/errors');
const { isVisionEnabled, isCloudinaryPhoto, annotatePhoto } = require('../vision/google');
const { suggestTags } = require('../vision/suggest');

// POST /api/vision/suggest  { photoUrl }
// Answers { category, colour, brand }, each { value, confidence } or null.
// Without a Vision key every answer is null, and the form shows empty fields.
const NO_SUGGESTIONS = { category: null, colour: null, brand: null };

exports.suggest = async (req, res) => {
  const { photoUrl } = req.body || {};
  if (!isCloudinaryPhoto(photoUrl)) {
    throw httpError(400, 'photoUrl must be a photo uploaded through the report form');
  }
  if (!isVisionEnabled()) return res.json(NO_SUGGESTIONS);

  const [annotations, categories, colours] = await Promise.all([
    annotatePhoto(photoUrl),
    Category.findAll(),
    Colour.findAll(),
  ]);
  res.json(suggestTags(annotations, { categories, colours }));
};
