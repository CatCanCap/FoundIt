<script setup>
// The finds for one lost report (WS3, Figma V09 and V10), on their own page at
// /matches/finds/:reportId. The Matches page links here from under the
// report's details.
//
// V09: a heading card ("3 finds look like your water bottle."), the best match
// shown large (BestFind) and the rest as rows under "Other finds" (OtherFind).
// "View" on a row shows that find large instead (?find=<matchId>).
// Under them, the claims the finder declined (DeclinedClaims, Jing Yuan's): the
// report stays open, so the owner sees what happened and can close it.
//
// With no finds left there is no page: the owner goes back to the report on
// the Matches page. After "Not mine" on the last find it adds ?cleared=1, so
// the Matches page says what happened. The one exception is a report with a
// declined claim still showing: the page stays for that, as "No finds left".
//
// "Not mine" flicks the find off the page at once and the next one swings in,
// with an Undo toast for a few seconds; only when the toast goes is the find
// hidden for good. Leaving the page before then saves it straight away.
//
// Data: the report and its finds come from stores/matches.js
// (GET /api/matches/mine), plus GET /api/spots for the places. Finds with no
// photo are drawn in their own colour (itemTone). "Not mine"
// and "I found it myself" are the store's rejectMatch and closeReport. Closing
// is only offered while the report is open, never during a handoff.
//
// A report that is not on the Matches page (resolved, archived) is looked up
// with GET /api/items/:id: if it is your own lost report, the page says it is
// closed and links to its record instead of "isn't one of yours".
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BestFind from '@/components/matches/BestFind.vue'
import DeclinedClaims from '@/components/matches/DeclinedClaims.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import OtherFind from '@/components/matches/OtherFind.vue'
import SlideToast from '@/components/handoff/SlideToast.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { useAuthStore } from '@/stores/auth'
import { statusPill } from '@/utils/design'
import { useMatchesStore } from '@/stores/matches'
import { claimLink, closedReportNote, findsLookLike, itemNoun, itemTone } from '@/utils/matches'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const matchesStore = useMatchesStore()
const { reports, hidden } = storeToRefs(matchesStore)

const spotsById = ref(new Map())
const loading = ref(true)
const errorMessage = ref('')
const busy = ref(false)
// Your own lost report when it is closed, so not on the Matches page
const closedReport = ref(null)

// Only your own open reports (and ones being returned) are in the store
const report = computed(
  () => reports.value.find((one) => one.item.id === Number(route.params.reportId)) || null,
)

// The find just turned down, still waiting out its Undo, and whether the next
// change of the large find is a flick (rather than "View")
const UNDO_MS = 5000
const pending = ref(null)
const flicking = ref(false)
let saving = null

// The report's finds, less the one waiting out its Undo
const finds = computed(() =>
  report.value ? report.value.matches.filter((match) => match.id !== pending.value?.id) : [],
)

onMounted(async () => {
  try {
    const [, spotsResponse] = await Promise.all([matchesStore.load(), api.get('/spots')])
    spotsById.value = new Map(spotsResponse.data.map((spot) => [spot.id, spot]))
    if (!report.value) await findClosedReport()
  } catch (error) {
    errorMessage.value =
      error.response?.data?.error || 'Could not load the finds. Please try again.'
  } finally {
    loading.value = false
  }
})

const closedNote = computed(() =>
  closedReport.value ? closedReportNote(closedReport.value) : null,
)
// "Back with you" rather than the pill's "Back with its owner": it is your report
const closedPill = computed(() =>
  closedReport.value?.status === 'resolved'
    ? 'Back with you'
    : statusPill(closedReport.value?.status).label,
)

// Is it one of yours that has been closed? Anything else (someone else's,
// a found report, or not there at all) stays "isn't one of yours"
async function findClosedReport() {
  try {
    const { data } = await api.get(`/items/${route.params.reportId}`)
    if (data.type === 'lost' && data.postedBy === auth.user?.id) closedReport.value = data
  } catch {
    // Not found: the page says it isn't one of yours
  }
}

// Every find on this page has now been seen, so the MATCHES badge counts down,
// including any that turn up while the page is open
watch(
  () => (report.value ? report.value.matches.map((match) => match.id) : []),
  (ids) => matchesStore.markSeen(ids),
  { immediate: true },
)

const backLink = computed(() =>
  report.value ? { path: '/matches', query: { report: String(report.value.item.id) } } : '/matches',
)

// The find shown large: ?find=<matchId> if it is one of this report's, else the best
const featured = computed(() => {
  if (!report.value) return null
  const wanted = Number(route.query.find)
  return finds.value.find((match) => match.id === wanted) || finds.value[0] || null
})

// Every other find, keeping its place in the list
const others = computed(() =>
  finds.value
    .map((match, index) => ({ match, rank: index + 1 }))
    .filter(({ match }) => match !== featured.value),
)

// Declined claims for this report, less the ones hidden on this device
const declined = computed(() =>
  (report.value?.declined || []).filter((entry) => !hidden.value.has(entry.matchId)),
)

// "I found it myself" only while the report is open: once a claim is under
// way the report is being returned, and closing it would break the handoff
const reportOpen = computed(() => report.value?.item.status === 'open')

// No finds left and nothing declined to show: back to the report on the
// Matches page, replacing this page in the history so Back skips it
let clearedHere = false
watch(
  () =>
    !loading.value &&
    Boolean(report.value) &&
    report.value.matches.length === 0 &&
    declined.value.length === 0,
  (empty) => {
    if (!empty) return
    const query = { report: String(report.value.item.id) }
    if (clearedHere) query.cleared = '1'
    router.replace({ path: '/matches', query })
  },
  { immediate: true },
)

const featuredRank = computed(() => finds.value.indexOf(featured.value) + 1)

function view(match) {
  router.replace({ query: { ...route.query, find: String(match.id) } })
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
}

// "Not mine": off the page now, saved when the Undo toast goes. Turning
// down another find first saves the one before it.
async function notMine(match) {
  if (pending.value) await saveHidden()
  errorMessage.value = ''
  flicking.value = true
  pending.value = match
  // Show the best of what is left
  if (route.query.find !== undefined) {
    const query = { ...route.query }
    delete query.find
    router.replace({ query })
  }
}

function undo() {
  flicking.value = true
  pending.value = null
}

async function saveHidden() {
  const match = pending.value
  if (!match || saving) return
  saving = match
  busy.value = true
  try {
    // If that was the last find, the page goes back to Matches (the watcher
    // above), which says so
    clearedHere = true
    await matchesStore.rejectMatch(match.id)
    if (report.value?.matches.length) clearedHere = false
  } catch (error) {
    clearedHere = false
    errorMessage.value =
      error.response?.data?.error || 'Could not hide that find. Please try again.'
  } finally {
    // Gone from the store by now, or back on the page if saving failed
    if (pending.value === match) pending.value = null
    saving = null
    busy.value = false
  }
}

// Leaving with an Undo still showing: hide it for good, without waiting
onBeforeUnmount(() => {
  if (pending.value && !saving) matchesStore.rejectMatch(pending.value.id).catch(() => {})
})

async function foundItMyself(item) {
  busy.value = true
  errorMessage.value = ''
  try {
    await matchesStore.closeReport(item.id)
    router.push('/matches')
  } catch (error) {
    errorMessage.value =
      error.response?.data?.error || 'Could not close that report. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="finds-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="finds container d-grid" aria-live="polite">
      <RouterLink :to="backLink" class="finds__back" data-testid="back-to-report">
        <span aria-hidden="true">←</span>
        <span class="finds__back-text">{{ report ? report.item.title : 'Your lost reports' }}</span>
      </RouterLink>

      <section class="finds__head">
        <div>
          <h1 v-if="loading" class="finds__title">Checking for finds…</h1>
          <h1
            v-else-if="report && finds.length"
            class="finds__title"
            data-testid="finds-page-title"
          >
            {{ findsLookLike(finds.length) }}
            <em class="fi-accent">your {{ itemNoun(report.item.category) }}.</em>
          </h1>
          <h1 v-else-if="report" class="finds__title" data-testid="finds-page-title">
            No finds left
          </h1>
          <h1 v-else-if="closedNote" class="finds__title" data-testid="finds-page-title">
            {{ closedNote.lead }} <em class="fi-accent">{{ closedNote.accent }}</em>
          </h1>
        </div>
        <MascotArt class="finds__lion" :size="104" />
      </section>

      <p v-if="errorMessage" class="finds__error" role="alert" data-testid="finds-error">
        {{ errorMessage }}
      </p>

      <template v-if="!loading && report">
        <Transition
          :name="flicking ? 'fi-flick' : 'fi-swap'"
          mode="out-in"
          @after-enter="flicking = false"
        >
          <BestFind
            v-if="featured"
            :key="featured.id"
            :match="featured"
            :lost="report.item"
            :rank="featuredRank"
            :spots-by-id="spotsById"
            :tone="itemTone(featured.item)"
            :claim-to="claimLink(featured)"
            :busy="busy"
            @not-mine="notMine"
          />
        </Transition>

        <template v-if="featured">
          <section v-if="others.length" class="finds__others" aria-labelledby="others-title">
            <h2 id="others-title" class="finds__others-title">
              Other finds <span class="finds__others-count">{{ others.length }}</span>
            </h2>
            <TransitionGroup tag="ol" name="fi-row" class="finds__list">
              <OtherFind
                v-for="other in others"
                :key="other.match.id"
                :match="other.match"
                :rank="other.rank"
                :spots-by-id="spotsById"
                :tone="itemTone(other.match.item)"
                @view="view"
              />
            </TransitionGroup>
          </section>
        </template>

        <DeclinedClaims
          v-if="declined.length"
          :declined="declined"
          :report-open="reportOpen"
          :can-close="reportOpen"
          :busy="busy"
          @hide="matchesStore.hideDeclined"
          @close="foundItMyself(report.item)"
        />

        <SlideToast
          :show="Boolean(pending)"
          :duration="UNDO_MS"
          action="Undo"
          @action="undo"
          @close="saveHidden"
        >
          Hidden
        </SlideToast>
      </template>

      <section
        v-else-if="!loading && !errorMessage && closedNote"
        class="finds__closed"
        data-testid="finds-closed"
      >
        <p class="finds__closed-name">
          <span>{{ closedReport.title }}</span>
          <StatusPill :state="closedReport.status">{{ closedPill }}</StatusPill>
        </p>
        <p class="finds__closed-note">{{ closedNote.note }}</p>
        <div class="finds__closed-actions">
          <BaseButton
            :to="`/items/${closedReport.id}/record`"
            variant="night"
            size="sm"
            data-testid="finds-closed-record"
          >
            See the report <span aria-hidden="true">→</span>
          </BaseButton>
          <RouterLink
            v-if="closedReport.status === 'archived'"
            to="/report/lost"
            class="finds__closed-link"
          >
            Report it lost again
          </RouterLink>
        </div>
      </section>

      <section
        v-else-if="!loading && !errorMessage"
        class="finds__missing"
        data-testid="finds-missing"
      >
        <p>This report isn’t one of your open lost reports.</p>
        <BaseButton to="/matches">See your lost reports</BaseButton>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.finds-page {
  display: flex;
  /* No sideways scroll while a turned-down find flies off */
  overflow-x: clip;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--fi-backdrop);
  color: var(--fi-ink);
  isolation: isolate;
}

.finds {
  gap: 1.5rem;
  align-content: start;
  max-width: 64rem;
  padding: 1rem 1rem 3rem;
  /* Clear of the iPhone's home bar */
  padding-bottom: max(3rem, env(safe-area-inset-bottom));
}

/* Back to the report: a plain text link, still a thumb-sized target; a long
   name is cut short with an ellipsis rather than pushing the page wider */
.finds__back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
  min-height: 2.75rem;
  color: var(--fi-ink);
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
}

.finds__back-text {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
  transition: text-decoration-color 0.15s ease;
}

.finds__back:hover .finds__back-text,
.finds__back:active .finds__back-text {
  text-decoration-color: currentColor;
}

.finds__back:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* The heading sits straight on the page over a heavy rule (Figma "06 ·
   Matches directions", B), the same as the lost reports page. The lion stands
   on the rule at the right, over the heading's own space, so the page is no
   taller; smaller on a phone */
.finds__head {
  position: relative;
  padding-bottom: 1.25rem;
  padding-right: 5.5rem;
  border-bottom: 2px solid var(--fi-ink);
}

.finds__lion {
  position: absolute;
  right: 0;
  bottom: -1px;
  pointer-events: none;
}

.finds__lion :deep(img) {
  width: auto;
  height: 76px;
}

@media (min-width: 576px) {
  .finds {
    padding-inline: 1.5rem;
  }

  .finds__head {
    padding-bottom: 1.5rem;
    padding-right: 7.5rem;
  }

  .finds__lion :deep(img) {
    height: 104px;
  }
}

.finds__title {
  margin: 0;
  font-size: clamp(1.9rem, 6vw, 2.6rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

/* "2 finds look like your water bottle." runs on as one sentence and wraps
   where the row ends; "your water bottle." is in the serif accent */

.finds__error {
  margin: 0;
  padding: 0.75rem 1rem;
  border-left: 4px solid var(--fi-danger);
  border-radius: 6px;
  /* From the colour tokens, so it reads in night mode too */
  background: var(--fi-danger-soft);
  color: var(--fi-ink);
}

.finds__others {
  margin-top: 2rem;
}

.finds__others-title {
  margin: 0;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--fi-ink);
  color: var(--fi-ink);
  font-size: 1.15rem;
  font-weight: 700;
}

.finds__others-count {
  margin-left: 0.35rem;
  color: var(--fi-mist);
  font-family: var(--fi-font-mono);
  font-size: 0.9rem;
  font-weight: 500;
}

.finds__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* A closed report: its name and status over a ruled line, like a find's
   reasons, then the way to its page */
.finds__closed {
  display: grid;
  justify-items: start;
  gap: 0.75rem;
  max-width: 34rem;
}

.finds__closed-name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 1rem;
  width: 100%;
  margin: 0;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--fi-line);
  font-size: 1.15rem;
  font-weight: 700;
}

.finds__closed-note {
  margin: 0;
  color: var(--fi-mist);
}

.finds__closed-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  margin-top: 0.25rem;
}

.finds__closed-link {
  color: var(--fi-mist);
  font-size: 0.9rem;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.finds__closed-link:hover {
  color: var(--fi-ink);
}

.finds__closed-link:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

.finds__missing {
  display: grid;
  justify-items: start;
  gap: 1rem;
  color: var(--fi-mist);
}

/* The large find fades when "View" swaps it for another */
.fi-swap-enter-active,
.fi-swap-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.fi-swap-enter-from,
.fi-swap-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* "Not mine": the find is flung off its hook, and the next one swings in on
   it, like the tags on the Matches page; Undo swings it back */
.fi-flick-leave-active {
  transform-origin: 50% 0;
  transition:
    transform 0.36s cubic-bezier(0.55, 0, 0.8, 0.35),
    opacity 0.36s ease-in;
}

.fi-flick-leave-to {
  opacity: 0;
  transform: translate(-28%, 3rem) rotate(-9deg);
}

.fi-flick-enter-active {
  transform-origin: 50% 0;
  animation: fi-swing-in 0.62s cubic-bezier(0.3, 1.2, 0.5, 1) both;
}

@keyframes fi-swing-in {
  0% {
    opacity: 0;
    transform: translateY(-1.5rem) rotate(4deg);
  }
  45% {
    opacity: 1;
    transform: rotate(-2deg);
  }
  75% {
    transform: rotate(0.8deg);
  }
  100% {
    transform: none;
  }
}

@keyframes fi-fade-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fi-flick-leave-active {
    transition: opacity 0.2s ease;
  }

  .fi-flick-leave-to {
    transform: none;
  }

  .fi-flick-enter-active {
    animation: fi-fade-in 0.2s ease both;
  }
}

/* A hidden find slides away; the rest close the gap */
.fi-row-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fi-row-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

.fi-row-move {
  transition: transform 0.3s ease;
}

@media (min-width: 992px) {
  .finds {
    padding-top: 1.75rem;
  }
}
</style>
