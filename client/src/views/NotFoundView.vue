<script setup>
// WS1 · Shown for any address that is not a page (the catch-all route in
// router/index.js), and at /admins-only when a student opens an admin page
// (router/guard.js), so nobody lands on a blank screen. The trail on its map
// is the last two pages this person really opened (utils/last-places.js).
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CampusTrail from '@/components/not-found/CampusTrail.vue'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'
import { lastPlaces } from '@/utils/last-places'

const props = defineProps({
  // true at /admins-only: the page exists but is for admins
  adminsOnly: { type: Boolean, default: false },
})

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const places = lastPlaces((address) => router.resolve(address), auth)

// Admins have no feed or report pages: both send them to the Admin page
const startName = computed(() => (auth.isAdmin ? 'the Admin page' : 'the feed'))

const end = computed(() =>
  props.adminsOnly
    ? { title: 'Admins only', detail: '' }
    : { title: 'Page not found', detail: route.path },
)
</script>

<template>
  <div class="ds missing-page">
    <AppHeader />

    <main class="missing" data-testid="not-found">
      <div class="ds-wrap missing__words">
        <h1 class="ds-display missing__title">
          {{ adminsOnly ? 'That page is for admins.' : 'The trail stops here.' }}
        </h1>
        <p v-if="adminsOnly" class="ds-lead missing__lede">
          Disputes and reported posts are decided by the FoundIt admins. You can follow your own
          disputes on My disputes.
        </p>
        <p v-else class="ds-lead missing__lede">
          Nothing lives at <strong class="missing__path">{{ route.fullPath }}</strong
          >. The link may be old or mistyped.
          {{
            places.length
              ? `Go back to your last stop, or start again from ${startName}.`
              : `Start again from ${startName}.`
          }}
        </p>

        <div class="missing__actions">
          <BaseButton v-if="auth.isAdmin" to="/admin" data-testid="not-found-admin">
            Go to Admin
          </BaseButton>
          <template v-else>
            <BaseButton to="/feed" data-testid="not-found-feed">Browse the feed</BaseButton>
            <BaseButton v-if="adminsOnly" to="/disputes" variant="secondary"
              >My disputes</BaseButton
            >
            <BaseButton v-else to="/report" variant="secondary">Report an item</BaseButton>
          </template>
        </div>
      </div>
    </main>

    <AppFooter />

    <CampusTrail view="wide" :places="places" :end="end" />
    <CampusTrail view="tall" :places="places" :end="end" />
  </div>
</template>

<style scoped>
/* One navy surface from the top of the window to the bottom: the map runs
   behind the header and footer, which sit straight on it. They take all their
   colours from these tokens, so nothing else needs to know about this page. */
.missing-page {
  --ds-canvas: transparent;
  --ds-surface: color-mix(in srgb, var(--ds-on-band) 12%, var(--ds-band));
  --ds-surface-sunken: color-mix(in srgb, var(--ds-on-band) 20%, var(--ds-band));
  --ds-text: var(--ds-on-band);
  --ds-text-muted: var(--ds-on-band-muted);
  --ds-border: color-mix(in srgb, var(--ds-on-band) 24%, var(--ds-band));
  --ds-border-control: var(--ds-on-band-muted);
  --ds-action: var(--ds-on-band);
  --ds-action-hover: var(--ds-on-band-muted);
  --ds-action-pressed: var(--ds-on-band-muted);
  --ds-action-wash: color-mix(in srgb, var(--ds-on-band) 12%, transparent);
  --ds-on-action: var(--ds-band);
  --ds-focus: var(--ds-on-band);
  --ds-signal-text: var(--ds-signal);
  /* The logo still reads the older tokens */
  --fi-ink: var(--ds-on-band);
  --fi-brass-strong: var(--ds-signal);
  /* How much of the map the footer sits on */
  --footer-height: 4.75rem;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow: clip;
  background: var(--ds-band);
  color: var(--ds-on-band);
}

/* Header and footer lie flat on the map, with no line between them and it.
   The header stays at the top of the page, as the map has no bar to scroll under. */
.missing-page :deep(.fi-header) {
  position: relative;
  border-bottom: 0;
}

.missing-page :deep(.fi-footer) {
  position: relative;
  z-index: 2;
  border-top: 0;
}

.missing {
  --ds-surface: transparent;
  position: relative;
  z-index: 1;
  flex: 1;
  /* Room for the map, less the part behind the footer */
  padding-bottom: calc(max(100vw, 60rem) * 9 / 16 - var(--footer-height));
  pointer-events: none;
}

.missing__words > * {
  pointer-events: auto;
}

.missing__words {
  padding-block: var(--ds-space-6) var(--ds-space-5);
}

.missing__title {
  max-width: 11ch;
  margin-bottom: var(--ds-space-4);
  font-size: calc(var(--ds-size-display) * 1.5);
}

.missing__lede {
  max-width: 32rem;
  margin-bottom: var(--ds-space-5);
  color: var(--ds-on-band-muted);
}

.missing__path {
  color: var(--ds-on-band);
  overflow-wrap: anywhere;
}

.missing__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-3);
}

/* On a phone the footer stacks beside the lion, and its map is taller */
@media (max-width: 639.98px) {
  .missing-page {
    --footer-height: 7.25rem;
  }

  .missing {
    padding-bottom: calc(100vw * 602 / 375 - var(--footer-height));
  }

  /* Side by side, so the map starts on the first screen */
  .missing__actions :deep(.fi-button) {
    flex: 1;
    padding-inline: var(--ds-space-3);
  }

  .missing-page :deep(.fi-footer__inner) {
    flex-direction: column;
    max-width: 11rem;
    margin-inline: 0;
  }
}

/* On a big screen the map fills the window and the words sit over the park */
@media (min-width: 1200px) {
  .missing {
    padding-bottom: 0;
  }

  .missing__words {
    padding-top: var(--ds-space-8);
  }

  .missing__words > * {
    width: fit-content;
  }
}
</style>
