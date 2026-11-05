<script setup>
// The top bar: links, search, "+ Report an item", night mode and the account
// menu. Below lg the links and search fold behind the Menu button. Admins have
// one place to go, so they get "FoundIt | Admin" beside the logo instead of
// links, and no Menu; signed-out visitors see Feed, Map and Sign in. It uses
// the design system (class="ds", assets/system.css) on every page, rebuilt or not.
//   matchCount  a fixed Matches badge number (design kit page only)
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AccountMenu from './AccountMenu.vue'
import BrandLogo from './BrandLogo.vue'
import BaseButton from './BaseButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useHandoffsStore } from '@/stores/handoffs'
import { useMatchesStore } from '@/stores/matches'
import { pageExists } from '@/utils/pages'
import { currentTheme, setTheme } from '@/utils/theme'

const props = defineProps({
  matchCount: { type: Number, default: null },
})

const auth = useAuthStore()
const handoffs = useHandoffsStore()
const matches = useMatchesStore()
const route = useRoute()
const router = useRouter()

// studentOnly: hidden from admins. adminOnly: admins only. signedIn: hidden when signed out.
const ALL_LINKS = [
  { to: '/feed', label: 'Feed', studentOnly: true },
  { to: '/matches', label: 'Matches', badge: true, studentOnly: true, signedIn: true },
  { to: '/map', label: 'Map', studentOnly: true },
  {
    to: '/returns',
    label: 'Returns',
    badge: 'handoffs',
    studentOnly: true,
    signedIn: true,
  },
  { to: '/admin', label: 'Admin', adminOnly: true },
]

const links = computed(() =>
  ALL_LINKS.filter((link) => {
    if (link.studentOnly && auth.isAdmin) return false
    if (link.adminOnly && !auth.isAdmin) return false
    if (link.signedIn && !auth.isLoggedIn) return false
    // A link only shows once its page is in router/index.js
    return pageExists(router, link.to)
  }),
)

// The number on a link's badge (0 hides it)
function badgeCount(link) {
  if (link.badge === 'handoffs') return handoffs.count
  if (!link.badge) return 0
  return props.matchCount ?? matches.count
}
const menuBadge = computed(() => links.value.reduce((total, link) => total + badgeCount(link), 0))

// Refresh the Matches badge on open and every 30 seconds
const MATCHES_EVERY_MS = 30000
let matchesTimer = null
onMounted(() => {
  matches.refresh()
  matchesTimer = setInterval(() => matches.refresh(), MATCHES_EVERY_MS)
})
onBeforeUnmount(() => clearInterval(matchesTimer))

const search = ref('')
const theme = ref(currentTheme())

// The phone menu (Bootstrap collapse)
const menuOpen = ref(false)
const menuButton = ref(null)

// Close it after moving to another page
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

// "Skip to content" moves focus to the page's <main>
function skipToContent() {
  const main = document.querySelector('main')
  if (!main) return
  main.setAttribute('tabindex', '-1')
  main.focus()
}

// Escape closes the Menu and returns focus to its button. It listens on the
// whole page, not just the header: Safari does not focus a button that is
// clicked, so after opening the Menu with the mouse the key press starts on
// the page body and would never reach the header.
function closeOnEscape(event) {
  if (event.key !== 'Escape' || !menuOpen.value) return
  menuOpen.value = false
  menuButton.value?.focus()
}
onMounted(() => document.addEventListener('keydown', closeOnEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', closeOnEscape))

// The feed has its own search box
const onFeed = computed(() => route.path === '/feed')

// No "+ Report an item" while already on a report page
const onReport = computed(() => route.path === '/report' || route.path.startsWith('/report/'))

function submitSearch() {
  const q = search.value.trim()
  router.push({ path: '/feed', query: q ? { q } : {} })
}

function toggleTheme() {
  theme.value = theme.value === 'night' ? 'day' : 'night'
  setTheme(theme.value)
}
</script>

<template>
  <header class="ds fi-header" data-testid="app-header">
    <!-- Hidden until it gets the keyboard focus (Bootstrap's visually-hidden-focusable) -->
    <a
      href="#"
      class="visually-hidden-focusable fi-header__skip"
      data-testid="skip-link"
      @click.prevent="skipToContent"
      >Skip to content</a
    >
    <!-- Links fold into the Menu below lg -->
    <nav class="navbar navbar-expand-lg gap-2 gap-lg-3 fi-header__bar" aria-label="Main">
      <BrandLogo />
      <RouterLink
        v-if="auth.isAdmin"
        to="/admin"
        class="fi-header__admin"
        data-testid="header-admin"
      >
        <span class="fi-header__admin-word">Admin</span>
      </RouterLink>

      <!-- Report, night mode and the initials: always in the bar, last from lg -->
      <div class="d-flex align-items-center gap-2 ms-auto order-lg-last">
        <BaseButton
          v-if="auth.isLoggedIn && !auth.isAdmin && !onReport"
          to="/report"
          size="sm"
          class="fi-header__report"
          data-testid="header-report"
        >
          <span aria-hidden="true">+</span>
          <span class="fi-header__report-word">Report an item</span>
        </BaseButton>

        <button
          type="button"
          class="fi-header__round"
          :class="auth.isAdmin ? 'd-grid' : 'd-none d-lg-grid'"
          aria-label="Night mode"
          :aria-pressed="theme === 'night'"
          data-testid="theme-toggle"
          @click="toggleTheme"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              v-if="theme === 'night'"
              d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path
              v-else
              d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <!-- The initials and the account menu (AccountMenu.vue) -->
        <AccountMenu v-if="auth.user" />
        <RouterLink v-else to="/login" class="fi-header__signin">Sign in</RouterLink>
      </div>

      <!-- The phone's Menu button (Bootstrap hides it from md up) -->
      <button
        v-if="!auth.isAdmin"
        ref="menuButton"
        type="button"
        class="navbar-toggler fi-header__menu"
        :aria-expanded="menuOpen"
        aria-controls="fi-header-nav"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? 'Close' : 'Menu' }}
        <span
          v-if="!menuOpen && menuBadge > 0"
          class="fi-header__badge fi-header__menu-badge"
          :aria-label="`${menuBadge} new`"
          data-testid="menu-badge"
          >{{ menuBadge }}</span
        >
      </button>

      <div
        v-if="!auth.isAdmin"
        id="fi-header-nav"
        class="collapse navbar-collapse gap-3"
        :class="{ show: menuOpen }"
      >
        <ul class="navbar-nav gap-lg-4">
          <li v-for="link in links" :key="link.to" class="nav-item">
            <RouterLink
              :to="link.to"
              class="nav-link fi-header__link d-inline-flex align-items-center gap-1"
              active-class="active is-active"
            >
              {{ link.label }}
              <span
                v-if="badgeCount(link) > 0"
                class="fi-header__badge"
                :aria-label="`${badgeCount(link)} new`"
                :data-testid="`badge-${link.label.toLowerCase()}`"
                >{{ badgeCount(link) }}</span
              >
            </RouterLink>
          </li>
        </ul>

        <form
          v-if="!auth.isAdmin && !onFeed"
          class="ms-lg-auto"
          role="search"
          @submit.prevent="submitSearch"
        >
          <label for="fi-header-search" class="visually-hidden">Search finds</label>
          <input
            id="fi-header-search"
            v-model="search"
            type="search"
            class="form-control form-control-sm fi-header__search"
            placeholder="Search finds…"
            data-testid="header-search"
          />
        </form>

        <!-- Below lg the night mode switch lives here, in the menu -->
        <div class="form-check form-switch d-lg-none my-2">
          <input
            id="fi-header-night"
            class="form-check-input"
            type="checkbox"
            role="switch"
            :checked="theme === 'night'"
            @change="toggleTheme"
          />
          <label class="form-check-label" for="fi-header-night">Night mode</label>
        </div>
      </div>
    </nav>
  </header>
</template>

<style scoped>
/* One flat bar the width of the page, with a hairline under it */
.fi-header {
  position: sticky;
  top: var(--ds-sticky-top, 0px);
  z-index: 20;
  border-bottom: 1px solid var(--ds-border);
  background: var(--ds-canvas);
}

/* Bootstrap's navbar in our colours */
.fi-header__bar {
  --bs-navbar-color: var(--ds-text-muted);
  --bs-navbar-hover-color: var(--ds-text);
  --bs-navbar-active-color: var(--ds-text);
  --bs-navbar-nav-link-padding-x: 0;
  --bs-navbar-padding-y: 0;
  --bs-nav-link-padding-y: 0;
  max-width: calc(var(--ds-page-max) + 2 * var(--ds-gutter));
  min-height: 4rem;
  margin: 0 auto;
  padding: 0 var(--ds-gutter);
}

/* An admin's one place: the logo's second half, after a thin line */
.fi-header__admin {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-3);
  color: var(--ds-text);
  font-family: var(--ds-font-display);
  font-size: 1.35rem;
  font-weight: var(--ds-weight-medium);
  letter-spacing: -0.02em;
  line-height: 1;
  text-decoration: none;
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

.fi-header__admin::before {
  content: '';
  width: 1px;
  height: 1.4rem;
  background: var(--ds-border-control);
}

.fi-header__admin:hover {
  color: var(--ds-action);
}

/* Sits on the same baseline as the logo's word, level with the lion */
.fi-header__admin-word {
  translate: 0 0.125rem;
}

/* The page links: the one you are on is darker, with a bar under it */
.fi-header__link {
  min-height: var(--ds-control-h);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-medium);
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

:deep(.fi-header__badge) {
  display: inline-grid;
  place-items: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 var(--ds-space-1);
  border-radius: var(--ds-radius-round);
  background: var(--ds-action);
  color: var(--ds-on-action);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.fi-header__search {
  min-height: var(--ds-control-h);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background-color: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
}

.fi-header__search::placeholder {
  color: var(--ds-text-muted);
}

.fi-header__search:hover {
  border-color: var(--ds-text-muted);
}

.fi-header__search:focus {
  border-color: var(--ds-action);
  box-shadow: none;
  outline: 3px solid var(--ds-focus);
  outline-offset: 1px;
}

/* Square icon buttons (night mode); the account menu makes its own round */
:deep(.fi-header__round) {
  place-items: center;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  padding: 0;
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    transform var(--ds-dur-fast) var(--ds-ease-press);
}

:deep(.fi-header__round:hover) {
  border-color: var(--ds-border-control);
  background: var(--ds-surface-sunken);
}

:deep(.fi-header__round:active) {
  transform: scale(0.96);
}

/* Signed out: an outlined button, second to nothing else in the bar */
.fi-header__signin {
  display: inline-flex;
  align-items: center;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-5);
  border: 1.5px solid var(--ds-action);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-action);
  font-weight: var(--ds-weight-medium);
  text-decoration: none;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.fi-header__signin:hover {
  background: var(--ds-action-wash);
  color: var(--ds-action);
}

/* The Menu button below lg: Bootstrap's navbar-toggler with words */
.fi-header__menu {
  position: relative;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

/* The badges hidden inside the menu show on the button's corner */
.fi-header__menu-badge {
  position: absolute;
  top: -0.5rem;
  right: -0.5rem;
}

.form-switch .form-check-input:checked {
  border-color: var(--ds-action);
  background-color: var(--ds-action);
}

:deep(.fi-header__round:focus-visible),
.fi-header__menu:focus-visible,
.fi-header__link:focus-visible,
.fi-header__signin:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
  box-shadow: none;
}

/* The skip link, once it has the focus, sits over the bar */
.fi-header__skip {
  position: absolute;
  top: var(--ds-space-2);
  left: var(--ds-gutter);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: var(--ds-action);
  color: var(--ds-on-action);
  font-weight: var(--ds-weight-bold);
}

/* From lg: the links in a row, each as tall as the bar */
@media (min-width: 992px) {
  .fi-header__link {
    min-height: 4rem;
    border-bottom: 2px solid transparent;
  }

  .fi-header__link.is-active {
    border-bottom-color: var(--ds-action);
  }

  .fi-header__search {
    width: 13rem;
  }
}

/* Below lg: the menu opens under the bar, one full-width row per link */
@media (max-width: 991.98px) {
  .fi-header__bar {
    padding-block: var(--ds-space-2);
  }

  #fi-header-nav.show {
    padding-block: var(--ds-space-2) var(--ds-space-4);
  }

  .fi-header__link {
    width: 100%;
    min-height: var(--ds-control-h-lg);
    padding-inline: var(--ds-space-3) !important;
    border-radius: var(--ds-radius-control);
  }

  .fi-header__link.is-active {
    background: var(--ds-action-wash);
    color: var(--ds-action);
  }

  .fi-header__search {
    width: 100%;
    margin-top: var(--ds-space-2);
  }
}

/* Phones: just "+" on the Report button (the words stay for screen readers) */
@media (max-width: 767.98px) {
  .fi-header__report-word {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .fi-header__report {
    width: var(--ds-control-h);
    padding: 0;
    font-size: var(--ds-size-title);
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.fi-header__round:active) {
    transform: none;
  }
}
</style>
