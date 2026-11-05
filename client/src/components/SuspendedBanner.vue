<script setup>
// WS1 · A strip across the top of every page while the account is suspended,
// so a suspended student knows before filling in a form, not after. The
// server refuses their changes anyway (middleware/auth.js).
//
// It also follows their appeal (stores/appeal.js): the way to appeal, then
// "Appeal sent", "declined", and once, after an appeal is accepted, a green
// line saying the account is active again. On /appeal itself it drops its
// button, since that is where the button leads.
//
// It stays on screen while the page scrolls. Its height goes in --ds-sticky-top,
// so the header and the feed's search stop just under it, however many lines
// the words wrap to on a phone.
//
// It stays off the sign-in pages (authBand, and the email code page): a saved
// suspended session must not greet someone at the door, and signing in must
// not flash it before the first page opens.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAppealStore } from '@/stores/appeal'
import { formatWhen } from '@/utils/safeguards'

const auth = useAuthStore()
const appeal = useAppealStore()
const route = useRoute()
const strip = ref(null)
let watcher = null

// Which line to show: suspended, sent, declined, accepted, or nothing
const state = computed(() => {
  if (auth.isSuspended) {
    const mine = appeal.mine
    if (mine && !mine.canAppeal && mine.appeal?.status === 'open') return 'sent'
    if (mine && !mine.canAppeal && mine.appeal?.status === 'declined') return 'declined'
    return 'suspended'
  }
  return appeal.acceptedUnseen ? 'accepted' : null
})

const showing = computed(
  () => Boolean(state.value) && !route.meta.authBand && route.path !== '/verify-email',
)
const onAppealPage = computed(() => route.path === '/appeal')
const sentDay = computed(() => formatWhen(appeal.mine?.appeal?.createdAt).split(', ')[0])

// Load the appeal for a suspended account, or for one whose appeal was
// waiting in this browser (it may have been accepted since)
watch(
  () => [auth.user?.id, auth.isSuspended],
  ([id, suspended]) => {
    if (id && (suspended || appeal.hasWaiting())) appeal.load().catch(() => {})
  },
  { immediate: true },
)

function clear() {
  watcher?.disconnect()
  watcher = null
  document.documentElement.style.removeProperty('--ds-sticky-top')
}

function measure() {
  if (!strip.value) return
  document.documentElement.style.setProperty('--ds-sticky-top', `${strip.value.offsetHeight}px`)
}

watch(
  strip,
  (element) => {
    clear()
    if (!element) return
    measure()
    if (window.ResizeObserver) {
      watcher = new ResizeObserver(measure)
      watcher.observe(element)
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(clear)
</script>

<template>
  <div
    v-if="showing"
    ref="strip"
    class="suspended"
    :class="`is-${state}`"
    role="status"
    data-testid="suspended-banner"
  >
    <span v-if="state === 'suspended'">
      <strong>Your account is suspended.</strong>
      You can still browse, but you can't post, claim, chat, report or dispute.
    </span>
    <span v-else-if="state === 'sent'">
      <strong>Appeal sent {{ sentDay }}.</strong>
      Your account stays suspended while an admin reviews it.
    </span>
    <span v-else-if="state === 'declined'">
      <strong>Your appeal was declined.</strong>
      Your account stays suspended.
    </span>
    <span v-else>
      <strong>Your appeal was accepted.</strong>
      Your account is active again.
    </span>

    <button
      v-if="state === 'accepted'"
      type="button"
      class="suspended__btn"
      data-testid="banner-close"
      @click="appeal.closeAccepted()"
    >
      Close
    </button>
    <RouterLink
      v-else-if="!onAppealPage"
      to="/appeal"
      class="suspended__btn"
      data-testid="banner-appeal"
    >
      {{ { suspended: 'Appeal', sent: 'See appeal', declined: 'See why' }[state] }}
    </RouterLink>
  </div>
</template>

<style scoped>
/* A pale red, so the red words stay readable in day and night mode */
.suspended {
  position: sticky;
  top: 0;
  z-index: 1040;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-1) var(--ds-space-4);
  padding: var(--ds-space-2) var(--ds-space-4);
  background: color-mix(in srgb, var(--ds-danger) 14%, var(--ds-surface));
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  text-align: center;
}

.suspended strong {
  color: var(--ds-danger);
  font-weight: var(--ds-weight-bold);
}

.suspended.is-sent {
  background: var(--ds-surface-sunken);
}

.suspended.is-sent strong {
  color: var(--ds-text);
}

.suspended.is-accepted {
  background: color-mix(in srgb, var(--ds-success) 16%, var(--ds-surface));
}

.suspended.is-accepted strong {
  color: var(--ds-success);
}

/* A small outlined button that fits the strip */
.suspended__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 var(--ds-space-3);
  border: 1.5px solid var(--ds-action);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-action);
  font: inherit;
  font-weight: var(--ds-weight-medium);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.suspended__btn:hover {
  background: var(--ds-action-wash);
  color: var(--ds-action);
}

/* A 44px tap target around the smaller button */
.suspended__btn::after {
  content: '';
  position: absolute;
  inset: -0.375rem -0.25rem;
}

.suspended__btn:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .suspended__btn {
    transition: none;
  }
}
</style>
