// Day or night theme, set on <html data-theme> and saved in localStorage
const THEME_KEY = 'foundit-theme'

export function currentTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'night' ? 'night' : 'day'
  } catch {
    // Private windows can block storage; day is the default
    return 'day'
  }
}

export function applyTheme(theme) {
  if (theme === 'night') document.documentElement.dataset.theme = 'night'
  else delete document.documentElement.dataset.theme
}

export function setTheme(theme) {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Not remembered, but the page still switches
  }
}
