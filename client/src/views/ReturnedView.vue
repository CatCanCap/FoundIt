<script setup>
// Back with its owner (WS5, Figma section 08: V22 "Resolved, celebration"), at
// /matches/:id/resolved, linked from a resolved handoff. The finder reads "You
// got it home"; the owner reads "It's home". The figures come from
// GET /api/handoffs/match/:matchId/summary. Laid out with Bootstrap's grid, in
// the design system's colours and type (class="ds", assets/system.css).
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import PageProblem from '@/components/handoff/PageProblem.vue'
import { useAuthStore } from '@/stores/auth'
import { blastConfetti } from '@/utils/confetti'
import { ledgerNumber, mainColour, placeName } from '@/utils/design'
import { firstSight } from '@/utils/first-sight'
import { countText, daysText, handoffStage, methodLabel, ordinal } from '@/utils/handoff'
import { SINGAPORE } from '@/utils/time'
import { errorText, isConnectionError } from '@/utils/safeguards'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const matchId = computed(() => route.params.id)
const overview = ref(null)
const summary = ref(null)
const spotsById = ref(new Map())
const loadError = ref('')
// No answer from FoundIt: the "can't reach" panel, whose Try again runs load() again
const cantReach = ref(false)
const loading = ref(false)
const shared = ref('')

const item = computed(() => overview.value?.foundItem || null)
const isFinder = computed(() => overview.value?.role === 'finder')
const firstName = computed(() => (auth.user?.name || '').trim().split(/\s+/)[0] || 'there')
// "the same day it went missing" or "2 days after it went missing"
const whenBack = computed(() => {
  const days = summary.value?.daysToReturn || 0
  return days === 0 ? 'the same day it went missing' : `${daysText(days)} after it went missing`
})
const handoffPlace = computed(() => {
  const spot = spotsById.value.get(summary.value?.spotId)
  return spot ? placeName(spot, { full: true }) : ''
})

function dayMonth(iso, upper = false) {
  if (!iso) return ''
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: SINGAPORE,
    day: 'numeric',
    month: 'short',
    ...(upper ? { year: 'numeric' } : {}),
  }).format(new Date(iso))
  return upper ? text.toUpperCase() : text
}

// The first time this page shows: the tag settles, the stamp presses on, and as
// it lands confetti bursts out from behind the tag. People who ask for less
// motion get no stamp animation, so its end never fires and there is no blast.
const isFirstSight = ref(false)
const stamped = ref(false)
const blastEl = ref(null)

function stampLanded() {
  stamped.value = true
  blastConfetti(blastEl.value)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [overviewResponse, spotsResponse] = await Promise.all([
      api.get(`/claims/${matchId.value}`),
      api.get('/spots'),
    ])
    overview.value = overviewResponse.data
    spotsById.value = new Map(spotsResponse.data.map((spot) => [spot.id, spot]))
    if (handoffStage(overview.value) !== 'resolved') {
      router.replace(`/matches/${matchId.value}/handoff`)
      return
    }
    summary.value = (await api.get(`/handoffs/match/${matchId.value}/summary`)).data
    isFirstSight.value = firstSight(`returned-${matchId.value}`)
    cantReach.value = false
  } catch (error) {
    cantReach.value = isConnectionError(error)
    if (!cantReach.value) loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Share the item record (never who claimed it), or copy its link
async function share() {
  const url = `${window.location.origin}/items/${item.value.id}/record`
  const text = `A ${item.value.title} found on campus is back with its owner, through FoundIt.`
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Back with its owner', text, url })
      return
    }
    await navigator.clipboard.writeText(url)
    shared.value = 'Link copied.'
  } catch {
    shared.value = `Copy this link: ${url}`
  }
}
</script>

<template>
  <div class="ds returned-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap returned">
      <ConnectionProblem
        v-if="cantReach"
        :busy="loading"
        data-testid="returned-error"
        @retry="load"
      />
      <PageProblem
        v-else-if="loadError"
        :message="loadError"
        :links="[
          { to: '/returns', label: 'Your returns' },
          { to: '/feed', label: 'The feed' },
        ]"
        data-testid="returned-error"
      />
      <PageSkeleton v-else-if="!summary" kind="detail" />

      <div v-else-if="item" class="row g-4 gy-5 position-relative ds-arrive">
        <section class="col-12 col-lg-7">
          <p class="returned__pill">
            <span class="returned__dot" aria-hidden="true"></span>
            Resolved · <span class="ds-num">{{ ledgerNumber(item.id) }}</span> ·
            {{ dayMonth(summary.completedAt) }}
          </p>

          <h1 class="returned__title" data-testid="returned-title">
            <template v-if="isFinder">
              You got it <span class="returned__home">home</span>, {{ firstName }}.
            </template>
            <template v-else>
              It’s <span class="returned__home">home</span>, {{ firstName }}.
            </template>
          </h1>

          <p class="returned__lead">
            <template v-if="isFinder">
              The owner has their {{ item.title }} back {{ whenBack }}. That’s your
              {{ ordinal(summary.finderReturns) }} return. Thank you for handing it in.
            </template>
            <template v-else>
              You have your {{ item.title }} back {{ whenBack }}, thanks to a student who handed it
              in.
            </template>
          </p>

          <dl class="returned__stats" data-testid="returned-stats">
            <div v-if="isFinder">
              <dt>{{ ordinal(summary.finderReturns) }}</dt>
              <dd>return so far</dd>
            </div>
            <div>
              <dt>{{ daysText(summary.daysToReturn) }}</dt>
              <dd>to get it home</dd>
            </div>
            <div>
              <dt>{{ countText(summary.totalReturned) }}</dt>
              <dd>things home at SMU, counting this one</dd>
            </div>
          </dl>

          <div class="d-flex flex-wrap align-items-center column-gap-4 row-gap-3">
            <BaseButton :to="isFinder ? '/returns' : '/matches'" data-testid="returned-done">
              Done
            </BaseButton>
            <button
              type="button"
              class="ds-link returned__share"
              data-testid="returned-share"
              @click="share"
            >
              Share the good news
            </button>
          </div>
          <p v-if="shared" class="returned__shared" role="status">{{ shared }}</p>
          <p class="returned__more">
            <RouterLink :to="`/matches/${matchId}/handoff`" class="ds-link"
              >Back to the chat</RouterLink
            >
          </p>
        </section>

        <div
          class="returned__tag-wrap col-12 col-lg-5 d-flex flex-column align-items-center"
          :class="{ 'is-first-sight': isFirstSight, 'is-stamped': stamped }"
        >
          <div ref="blastEl" class="returned__blast" aria-hidden="true"></div>
          <span class="returned__string" aria-hidden="true"></span>
          <article class="returned__tag" aria-label="The item's tag">
            <span class="returned__eyelet" aria-hidden="true"></span>
            <div class="returned__photo">
              <img v-if="item.photoUrl" :src="item.photoUrl" :alt="item.title" />
              <ItemIcon v-else :category="item.category" :colour="mainColour(item)" :size="96" />
            </div>
            <p class="returned__tag-meta">
              <span class="ds-num">{{ ledgerNumber(item.id) }}</span> · found
              {{ dayMonth(item.createdAt) }}
            </p>
            <p class="returned__tag-title">{{ item.title }}</p>
            <p class="returned__tag-place">
              {{ methodLabel(summary.method)
              }}<template v-if="handoffPlace"> at {{ handoffPlace }}</template>
            </p>
            <p class="returned__tag-foot">
              <span>Back with its owner</span>
              <span class="ds-num">{{ ledgerNumber(item.id) }}</span>
            </p>
            <span class="returned__stamp" aria-hidden="true" @animationend="stampLanded">
              <span>Resolved</span>
              <span class="ds-num">{{ dayMonth(summary.completedAt, true) }}</span>
            </span>
          </article>
        </div>
      </div>

      <div
        v-if="item && summary"
        class="returned__mascot position-relative d-flex justify-content-center mt-4"
        aria-hidden="true"
      >
        <MascotArt :size="180" />
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.returned-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

/* Clip, so confetti flying past the edges never adds a scrollbar */
.returned {
  position: relative;
  flex: 1;
  padding-top: var(--ds-space-5);
  padding-bottom: max(var(--ds-space-8), env(safe-area-inset-bottom));
  overflow: clip;
}

.returned__pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  margin: 0 0 var(--ds-space-5);
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-success) 14%, var(--ds-surface));
  color: var(--ds-success);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.returned__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: var(--ds-radius-round);
  background: currentColor;
}

.returned__title {
  margin: 0 0 var(--ds-space-4);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-display);
  line-height: var(--ds-leading-display);
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.03em;
}

.returned__home {
  color: var(--ds-action);
}

.returned__lead {
  max-width: 36rem;
  margin: 0 0 var(--ds-space-5);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-lead);
  line-height: var(--ds-leading-lead);
}

.returned__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: var(--ds-space-4);
  max-width: 38rem;
  margin: 0 0 var(--ds-space-5);
  padding: var(--ds-space-4) 0;
  border-top: 1px solid var(--ds-border);
  border-bottom: 1px solid var(--ds-border);
}

.returned__stats dt {
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h2);
  line-height: var(--ds-leading-h2);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.returned__stats dd {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.returned__share {
  min-height: var(--ds-control-h);
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  cursor: pointer;
}

.returned__shared,
.returned__more {
  margin: var(--ds-space-3) 0 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  overflow-wrap: anywhere;
}

.returned__more .ds-link {
  color: var(--ds-text-muted);
}

/* The hanging tag with its ink stamp */
.returned__tag-wrap {
  position: relative;
}

.returned__string {
  width: 2px;
  height: 3rem;
  background: var(--ds-text);
}

/* Confetti starts from here, the middle of the tag, and stays behind it */
.returned__blast {
  position: absolute;
  top: 50%;
  left: 50%;
  pointer-events: none;
}

.returned__blast :deep(i) {
  position: absolute;
  width: 0.7rem;
  height: 0.375rem;
  border-radius: 1px;
}

/* The tag, tilted a little, with a thick edge and a solid shadow in the
   text colour, so it reads in both day and night */
.returned__tag {
  position: relative;
  z-index: 1;
  width: min(calc(100% - 1.5rem), 22rem);
  padding: var(--ds-space-7) var(--ds-space-5) var(--ds-space-5);
  border: 3px solid var(--ds-text);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  color: var(--ds-text);
  box-shadow: var(--ds-space-2) var(--ds-space-2) 0 var(--ds-text);
  transform: rotate(-3deg);
  transform-origin: 50% 0;
}

/* The tag swings to rest from its eyelet, the stamp lands just as it stops, and
   the blast knocks the tag a little */
@media (prefers-reduced-motion: no-preference) {
  .is-first-sight .returned__tag {
    animation: returned-settle calc(var(--ds-dur-slow) * 2) ease-in-out;
  }

  .is-first-sight .returned__stamp {
    animation: returned-press var(--ds-dur-base) var(--ds-ease-press) backwards;
    animation-delay: calc(var(--ds-dur-slow) * 1.8);
  }

  .is-stamped .returned__tag {
    animation: returned-nudge var(--ds-dur-slow) var(--ds-ease-out);
  }
}

@keyframes returned-settle {
  from {
    rotate: 3deg;
  }

  45% {
    rotate: -1.5deg;
  }

  75% {
    rotate: 0.5deg;
  }
}

@keyframes returned-press {
  from {
    opacity: 0;
    scale: 1.7;
  }
}

@keyframes returned-nudge {
  40% {
    rotate: 0.8deg;
  }
}

.returned__eyelet {
  position: absolute;
  top: var(--ds-space-3);
  left: 50%;
  width: 1.4rem;
  height: 1.4rem;
  border: 4px solid var(--ds-action);
  border-radius: var(--ds-radius-round);
  background: var(--ds-canvas);
  transform: translateX(-50%);
}

.returned__photo {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  margin-bottom: var(--ds-space-4);
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.returned__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.returned__tag-meta {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.returned__tag-title {
  margin: var(--ds-space-1) 0;
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  line-height: var(--ds-leading-h3);
  font-weight: var(--ds-weight-bold);
  overflow-wrap: anywhere;
}

.returned__tag-place {
  margin: 0 0 var(--ds-space-3);
  color: var(--ds-text-muted);
}

/* The perforated stub */
.returned__tag-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding-top: var(--ds-space-3);
  border-top: 2px dashed var(--ds-border-control);
  color: var(--ds-success);
  font-weight: var(--ds-weight-bold);
}

.returned__tag-foot .ds-num {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-title);
}

.returned__stamp {
  position: absolute;
  top: var(--ds-space-7);
  right: calc(-1 * var(--ds-space-4));
  display: grid;
  place-items: center;
  width: 7rem;
  height: 7rem;
  border: 3px solid var(--ds-success);
  border-radius: var(--ds-radius-round);
  color: var(--ds-success);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0.08em;
  line-height: 1.1;
  text-align: center;
  text-transform: uppercase;
  opacity: 0.9;
  transform: rotate(14deg);
}

.returned__stamp .ds-num {
  font-size: var(--ds-size-caption);
  letter-spacing: 0.04em;
}

/* Phones: keep the stamp inside the tag so it is not cut off */
@media (max-width: 480px) {
  .returned__stamp {
    right: var(--ds-space-1);
    width: 5.5rem;
    height: 5.5rem;
    font-size: var(--ds-size-caption);
  }
}

/* Keeps the row's own gap, so the string hangs from just under the header */
@media (min-width: 992px) {
  .returned__tag-wrap {
    margin-top: calc(var(--bs-gutter-y) - var(--ds-space-5));
  }
}
</style>
