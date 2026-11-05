<script setup>
// The initials button and its dropdown: Profile, My disputes (students) and
// Log out. A dot shows when there are unread dispute verdicts.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDisputesStore } from '@/stores/disputes'
import { initials } from '@/utils/design'
import { pageExists } from '@/utils/pages'

const auth = useAuthStore()
const disputes = useDisputesStore()
const route = useRoute()
const router = useRouter()

const open = ref(false)
const menu = ref(null)
const button = ref(null)

const userInitials = computed(() => initials(auth.user?.name))
const hasProfile = computed(() => pageExists(router, '/profile'))
// Disputes are a student's own; admins decide them on the Admin page
const hasDisputes = computed(() => !auth.isAdmin && pageExists(router, '/disputes'))
const verdictCount = computed(() => (hasDisputes.value ? disputes.unreadCount : 0))

// Keyboard opens (event.detail 0) move focus to the first item
async function toggle(event) {
  open.value = !open.value
  if (open.value && event.detail === 0) {
    await nextTick()
    menu.value?.querySelector('.dropdown-item')?.focus()
  }
}

// Escape closes the menu and returns focus to the button. It listens on the
// whole page, because Safari does not focus a button that is clicked, so the
// key press can start on the page body. It listens first (capture) and stops
// the key there, so the same press does not also close the header's Menu.
function closeOnEscape(event) {
  if (event.key !== 'Escape' || !open.value) return
  event.stopPropagation()
  open.value = false
  button.value?.focus()
}

// A click anywhere else closes it
function closeOutside(event) {
  if (menu.value && !menu.value.contains(event.target)) open.value = false
}
onMounted(() => {
  document.addEventListener('click', closeOutside)
  document.addEventListener('keydown', closeOnEscape, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeOutside)
  document.removeEventListener('keydown', closeOnEscape, true)
})

// So does moving to another page
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

function logOut() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div ref="menu" class="dropdown">
    <button
      ref="button"
      type="button"
      class="fi-header__round fi-header__avatar"
      :aria-expanded="open"
      aria-controls="fi-header-account"
      :aria-label="
        verdictCount > 0
          ? `Account: ${auth.user.name}, ${verdictCount} new`
          : `Account: ${auth.user.name}`
      "
      data-testid="header-avatar"
      @click="toggle"
    >
      {{ userInitials }}
      <span
        v-if="verdictCount > 0"
        class="fi-header__avatar-dot"
        aria-hidden="true"
        data-testid="avatar-dot"
      ></span>
    </button>
    <!-- data-bs-popper="static": Bootstrap placement without its JS -->
    <div
      v-show="open"
      id="fi-header-account"
      class="dropdown-menu dropdown-menu-end show fi-header__account-menu"
      data-bs-popper="static"
      data-testid="account-menu"
    >
      <!-- Who is signed in: a heading, so it never reads as one of the links -->
      <div class="dropdown-header">
        <p class="fi-header__account-label mb-0">Signed in as</p>
        <p class="fi-header__account-name text-truncate mb-0" data-testid="account-name">
          {{ auth.user.name }}
        </p>
      </div>
      <RouterLink
        v-if="hasProfile"
        to="/profile"
        class="dropdown-item"
        data-testid="header-profile"
      >
        Profile
      </RouterLink>
      <RouterLink
        v-if="hasDisputes"
        to="/disputes"
        class="dropdown-item d-flex align-items-center justify-content-between gap-2"
        data-testid="header-disputes"
      >
        My disputes
        <span
          v-if="verdictCount > 0"
          class="fi-header__badge"
          :aria-label="`${verdictCount} new`"
          data-testid="badge-disputes"
          >{{ verdictCount }}</span
        >
      </RouterLink>
      <button type="button" class="dropdown-item" data-testid="header-logout" @click="logOut">
        Log out
      </button>
    </div>
  </div>
</template>

<style scoped>
/* The initials on a round button (round: it stands for a person) */
.fi-header__round.fi-header__avatar {
  position: relative;
  display: grid;
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
}

/* Something new in the menu (a verdict on My disputes) */
.fi-header__avatar-dot {
  position: absolute;
  top: -0.1rem;
  right: -0.1rem;
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--ds-canvas);
  border-radius: var(--ds-radius-round);
  background: var(--ds-action);
}

/* A Bootstrap dropdown in the design system's colours: it floats, so it has
   the second elevation */
.fi-header__account-menu {
  --bs-dropdown-bg: var(--ds-surface);
  --bs-dropdown-color: var(--ds-text);
  --bs-dropdown-border-color: var(--ds-border);
  --bs-dropdown-border-radius: var(--ds-radius-surface);
  --bs-dropdown-link-color: var(--ds-text);
  --bs-dropdown-link-hover-color: var(--ds-text);
  --bs-dropdown-link-hover-bg: var(--ds-action-wash);
  --bs-dropdown-link-active-color: var(--ds-text);
  --bs-dropdown-link-active-bg: var(--ds-action-wash);
  --bs-dropdown-header-color: var(--ds-text);
  min-width: 15rem;
  margin-top: var(--ds-space-2) !important;
  padding: var(--ds-space-2);
  box-shadow: var(--ds-elev-2);
  font-family: var(--ds-font-text);
}

.fi-header__account-menu .dropdown-item {
  display: flex;
  align-items: center;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-medium);
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.fi-header__account-menu .dropdown-item:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: -3px;
  box-shadow: none;
}

.fi-header__account-menu .dropdown-header {
  margin-bottom: var(--ds-space-2);
  padding: var(--ds-space-2) var(--ds-space-3) var(--ds-space-3);
  border-bottom: 1px solid var(--ds-border);
}

.fi-header__account-label {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.fi-header__account-name {
  color: var(--ds-text);
  font-size: var(--ds-size-title);
  font-weight: var(--ds-weight-bold);
  line-height: var(--ds-leading-title);
}
</style>
