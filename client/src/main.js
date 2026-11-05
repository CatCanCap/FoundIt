import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import api, { TOKEN_KEY } from './api'
import { useAuthStore } from './stores/auth'
import { installUnauthorizedHandler, watchTokenInOtherTabs } from './unauthorized'
import { applyTheme, currentTheme } from './utils/theme'
import { applyDensity, currentDensity } from './utils/density'

// Bootstrap's styles only: no page uses its JavaScript (dropdowns, collapse)
import 'bootstrap/dist/css/bootstrap.min.css'
import './assets/tokens.css'
// The design system rebuilt pages use (class="ds" on the page)
import './assets/system.css'
import './assets/main.css'

// Use the day or night colours and the row size picked last time, before
// anything is drawn
applyTheme(currentTheme())
applyDensity(currentDensity())

const app = createApp(App)

app.use(createPinia())

const auth = useAuthStore()

// Signed in, out or as someone else in another tab: reload, so this tab shows
// the person it is now acting as (see unauthorized.js)
watchTokenInOtherTabs(TOKEN_KEY, () => window.location.reload())

// Check the saved token BEFORE the router decides which page to show, so an
// expired token lands on the login page instead of a half-working home page.
// Until then index.html shows "Loading FoundIt…". If the server is slow, the
// request gives up after 15 seconds (api.js) and the app starts anyway.
auth.loadUser().finally(() => {
  // From here on, if the token stops being accepted, log out and ask to log in again
  installUnauthorizedHandler(api, () => {
    auth.logout()
    if (router.currentRoute.value.path !== '/login') {
      router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
    }
  })

  app.use(router)
  app.mount('#app')
})
