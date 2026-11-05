// When the server says the login token is no longer valid (401), run
// `onUnauthorized` (log out and go to the login page). A 401 from the login
// form itself just means a wrong password, so that one is left alone.
export function installUnauthorizedHandler(api, onUnauthorized) {
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error.response ? error.response.status : null
      const url = error.config && error.config.url ? error.config.url : ''
      if (status === 401 && !url.startsWith('/auth/login')) {
        onUnauthorized()
      }
      return Promise.reject(error)
    },
  )
}

// Every request reads the token from localStorage (api.js), but the page keeps
// the signed-in user in memory. When another tab of the app signs in, signs out
// or signs in as someone else, it changes that saved token, and this tab would
// carry on showing one person while acting as another. The browser fires a
// "storage" event in every OTHER tab when that happens; run `onChange` then
// (main.js reloads the page, so it starts again as whoever is signed in now).
// `key` is null when the whole of localStorage was cleared.
export function watchTokenInOtherTabs(tokenKey, onChange, target = window) {
  target.addEventListener('storage', (event) => {
    if (event.key === tokenKey || event.key === null) onChange()
  })
}
