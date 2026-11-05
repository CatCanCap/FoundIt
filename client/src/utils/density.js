// Comfortable or compact lists, set on <html data-density> and saved in
// localStorage, the same way as the theme (utils/theme.js). Compact rows are
// shorter (assets/system.css, --ds-row-h); comfortable is the default.
const DENSITY_KEY = 'foundit-density'

export function currentDensity() {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'
  } catch {
    // Private windows can block storage; comfortable is the default
    return 'comfortable'
  }
}

export function applyDensity(density) {
  if (density === 'compact') document.documentElement.dataset.density = 'compact'
  else delete document.documentElement.dataset.density
}

export function setDensity(density) {
  applyDensity(density)
  try {
    localStorage.setItem(DENSITY_KEY, density)
  } catch {
    // Not remembered, but the page still switches
  }
}
