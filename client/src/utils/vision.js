// Helpers for the details the photo suggests on the found report. The server
// asks Google Cloud Vision (POST /api/vision/suggest) and these turn its answer
// into filled-in fields.

export const TAG_FIELDS = [
  { field: 'category', label: 'Category' },
  { field: 'colour', label: 'Colour' },
  { field: 'brand', label: 'Brand' },
]

// Fills in only the fields the finder has left empty, so a late answer never
// replaces what they typed. Returns the new values and a tag for each one.
export function applySuggestions(form, suggestions) {
  const values = {}
  const tags = []
  for (const { field, label } of TAG_FIELDS) {
    const suggestion = suggestions?.[field]
    const alreadyFilled = String(form[field] || '').trim() !== ''
    if (!suggestion?.value || alreadyFilled) continue
    values[field] = suggestion.value
    tags.push({ field, label, value: suggestion.value, confidence: suggestion.confidence })
  }
  return { values, tags }
}

// The label beside a filled-in field: "From photo" when Vision was sure
// enough, "Unsure" otherwise
export const SURE_ENOUGH = 70

export function suggestionBadge(confidence) {
  return confidence >= SURE_ENOUGH ? 'From photo' : 'Unsure'
}
