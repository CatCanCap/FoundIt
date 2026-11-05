<script setup>
// The item page (WS5, Figma section 08: V13, V13a, V13c and V13d), at
// /items/:id/record, which every feed card opens. Anyone can see it, logged in
// or not. It never shows who found or claimed the item.
//
// The photo sits on the left, or the category's drawing in the same space when
// there is no photo. The facts are on the right, then a box that depends on
// where the item is up to:
//   V13a  nobody has claimed it: "Is this yours?"
//   V13   claimed, the handoff is under way: "Matched with someone"
//   V13c  handed over, waiting for the owner: "Handed over on ..."
//   V13d  back with its owner: "Resolved on ...", with the 7-day dispute window
// Under it are the four dots, each with its time. The parts from feature 5
// (Jing Yuan's item record) are kept: "This is my item" opens a dispute, and
// anyone logged in can report a fake post.
//
// Data: GET /api/items/:id/record and GET /api/spots. When logged in, also
// GET /api/claims/mine and GET /api/matches/mine, to link to your own chat or
// your claim. Laid out with Bootstrap's grid, in the design system's colours
// and type (class="ds", assets/system.css).
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import PageProblem from '@/components/handoff/PageProblem.vue'
import ReturnTrack from '@/components/handoff/ReturnTrack.vue'
import { useAuthStore } from '@/stores/auth'
import { ledgerNumber, mainColour } from '@/utils/design'
import { takeCardSeed } from '@/utils/item-morph'
import {
  categoryLine,
  disputeWindow,
  eventAt,
  itemStage,
  myLink,
  decisionWords,
  lastDecision,
  recordTrack,
} from '@/utils/item-page'
import { HIDDEN_PLACE } from '@/utils/feed'
import {
  canDispute,
  errorText,
  formatWhen,
  isConnectionError,
  mayHaveSent,
} from '@/utils/safeguards'
import { spotName } from '@/utils/spots'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// "← Back" returns to the feed as the student left it: its Found or Lost side,
// search and page (Vue Router keeps the previous address in
// history.state.back). From anywhere else it opens the feed.
const back = window.history.state?.back
const feedLink = typeof back === 'string' && /^\/feed(\?|$)/.test(back) ? back : '/feed'

const record = ref(null)
const spotsById = ref(new Map())
const mine = ref(null)
const loading = ref(true)
const errorMessage = ref('')
// No answer from FoundIt: the "can't reach" panel, whose Try again runs load() again
const cantReach = ref(false)

const item = computed(() => record.value?.item || null)
// The picture is there from the start when a feed card opened this page, so the
// card's picture can grow into it (utils/item-morph.js)
const cardSeed = takeCardSeed(route.path)
const picture = computed(() =>
  item.value
    ? {
        title: item.value.title,
        category: item.value.category,
        photoUrl: item.value.photoUrl,
        colour: mainColour(item.value),
      }
    : cardSeed,
)
const stage = computed(() => itemStage(record.value))
const track = computed(() => recordTrack(record.value))
const isFound = computed(() => item.value?.type === 'found')
const isPoster = computed(() => Boolean(auth.user && item.value?.postedBy === auth.user.id))
const place = computed(() => {
  const spot = spotsById.value.get(item.value?.trail?.[0]?.spotId)
  return spot ? spotName(spot) : 'Unknown place'
})
const otherPlaces = computed(() => Math.max(0, (item.value?.trail?.length || 0) - 1))
const claimedAt = computed(() => eventAt(record.value?.timeline, 'claimed'))
const handedAt = computed(() => eventAt(record.value?.timeline, 'handed_over'))
const returnedAt = computed(() => eventAt(record.value?.timeline, 'returned'))
// "Dispute decided: an admin gave it to ...", for the people in the dispute
const decision = computed(() => lastDecision(record.value?.timeline))
const window7 = computed(() => disputeWindow(returnedAt.value))
const showDispute = computed(
  () =>
    canDispute(record.value, auth.user) &&
    !myLinkTo.value &&
    (stage.value !== 'returned' || window7.value.open),
)
const myLinkTo = computed(() => (mine.value?.kind === 'chat' ? mine.value.to : ''))
const canReport = computed(() => auth.isLoggedIn && item.value && !isPoster.value)

// Your own chat or claim for this item, if you have one. Admins have neither.
async function loadMine() {
  if (!auth.isLoggedIn || auth.isAdmin) return
  try {
    const [claims, matches] = await Promise.all([
      api.get('/claims/mine').then((response) => response.data),
      api.get('/matches/mine').then((response) => response.data.reports),
    ])
    mine.value = myLink(item.value.id, { claims, reports: matches })
  } catch {
    // Without it the page still works; it just cannot link to your chat
  }
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [recordResponse, spotsResponse] = await Promise.all([
      api.get(`/items/${route.params.id}/record`),
      api.get('/spots'),
    ])
    record.value = recordResponse.data
    spotsById.value = new Map(spotsResponse.data.map((spot) => [spot.id, spot]))
    await loadMine()
    cantReach.value = false
  } catch (error) {
    cantReach.value = isConnectionError(error)
    if (!cantReach.value) errorMessage.value = errorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openDispute() {
  const path = `/items/${route.params.id}/dispute`
  if (!auth.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: path } })
    return
  }
  router.push(path)
}

// "This is mine" when no match found it: report the item lost first, and the
// matching links the two (claims go through a match)
function startClaim() {
  if (mine.value?.kind === 'claim') {
    router.push(mine.value.to)
    return
  }
  if (!auth.isLoggedIn) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  noMatchHelp.value = true
}
const noMatchHelp = ref(false)

// Report a fake post (feature 5)
const showReport = ref(false)
const reportReason = ref('')
const reportMessage = ref('')
const reportError = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the reason stays typed
const reportNotSent = ref(false)
// The last try got no answer in time, so the report may have been saved
const reportMaybeSent = ref(false)
const isReporting = ref(false)

async function sendReport() {
  reportError.value = ''
  const triedBefore = reportMaybeSent.value
  reportNotSent.value = false
  reportMaybeSent.value = false
  isReporting.value = true
  try {
    await api.post('/reports', { itemId: item.value.id, reason: reportReason.value.trim() })
    reportMessage.value = 'Thanks. An admin will look at this post.'
    showReport.value = false
  } catch (error) {
    if (isConnectionError(error)) {
      reportNotSent.value = true
      reportMaybeSent.value = mayHaveSent(error)
    } else if (triedBefore && error.response?.status === 409) {
      // The first try was saved; its answer just came too late
      reportMessage.value = 'Thanks. An admin will look at this post.'
      showReport.value = false
    } else reportError.value = errorText(error)
  } finally {
    isReporting.value = false
  }
}
</script>

<template>
  <div class="ds item-page-root">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap item-page">
      <BaseButton
        variant="secondary"
        :to="feedLink"
        class="mb-3 item-page__back"
        aria-label="Back to the feed"
        data-testid="record-back"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back
      </BaseButton>

      <ConnectionProblem
        v-if="cantReach"
        :busy="loading"
        data-testid="record-error"
        @retry="load"
      />
      <PageProblem
        v-else-if="!loading && errorMessage"
        :message="errorMessage"
        :links="[
          { to: '/feed', label: 'Browse the feed' },
          { to: '/report/lost', label: 'Report a lost item' },
        ]"
        data-testid="record-error"
      />

      <div v-else-if="loading || item" class="row g-4 align-items-start">
        <div class="col-12 col-md-5">
          <div
            class="item-page__picture ratio ratio-4x3"
            :class="{ 'has-photo': picture?.photoUrl }"
            data-morph-target
          >
            <div class="d-grid">
              <img v-if="picture?.photoUrl" :src="picture.photoUrl" :alt="picture.title" />
              <ItemIcon
                v-else-if="picture"
                class="m-auto"
                :category="picture.category"
                :colour="picture.colour"
                :tone="picture.tone"
                :size="140"
                data-testid="record-icon"
              />
              <span v-else class="ds-skeleton"></span>
            </div>
          </div>
        </div>

        <PageSkeleton
          v-if="loading"
          kind="facts"
          :count="4"
          label="Loading the item…"
          class="col-12 col-md-7 ps-md-4"
        />
        <div v-else-if="item" class="col-12 col-md-7 ps-md-4 ds-arrive">
          <p class="item-page__number">
            <span class="ds-num">{{ ledgerNumber(item.id) }}</span>
            · {{ isFound ? 'Found item' : 'Lost item' }}
          </p>
          <h1 class="ds-h1 item-page__title" data-testid="record-title">{{ item.title }}</h1>

          <dl class="item-facts">
            <!-- The server leaves out where and when a find was handed in
                 unless your own lost report already said it -->
            <div v-if="item.placeHidden" class="item-facts__row">
              <dt>Found at</dt>
              <dd data-testid="record-place-hidden">
                {{ HIDDEN_PLACE }}
                <span class="item-facts__note">
                  Where and when it was found only show once your lost report names the same
                  building around that time, so nobody can claim what isn’t theirs.
                </span>
              </dd>
            </div>
            <template v-else>
              <div class="item-facts__row">
                <dt>{{ isFound ? 'Found at' : 'Last seen' }}</dt>
                <dd>
                  {{ place }}<template v-if="otherPlaces > 0"> + {{ otherPlaces }} more</template>
                </dd>
              </div>
              <div class="item-facts__row">
                <dt>When</dt>
                <dd>{{ formatWhen(item.trail?.[0]?.from) }}</dd>
              </div>
            </template>
            <div v-if="categoryLine(item)" class="item-facts__row">
              <dt>Category</dt>
              <dd>{{ categoryLine(item) }}</dd>
            </div>
            <div v-if="item.description" class="item-facts__row">
              <dt>Details</dt>
              <dd class="item-page__plain">{{ item.description }}</dd>
            </div>
            <div v-if="isFound" class="item-facts__row">
              <dt>Finder</dt>
              <dd>Hidden for privacy</dd>
            </div>
          </dl>

          <div class="item-box" data-testid="record-box" :data-stage="stage">
            <!-- V13a: nobody has claimed it -->
            <template v-if="stage === 'waiting' && isFound">
              <template v-if="isPoster">
                <h2 class="ds-h3 item-box__title">You found this</h2>
                <p class="item-box__text">
                  It’s waiting for its owner. You’ll get an email when someone’s lost report matches
                  it.
                </p>
              </template>
              <template v-else-if="auth.isAdmin">
                <h2 class="ds-h3 item-box__title">Waiting for its owner</h2>
              </template>
              <template v-else>
                <h2 class="ds-h3 item-box__title">Is this yours?</h2>
                <p v-if="mine?.kind === 'claim'" class="item-box__text">
                  It matched one of your lost reports.
                </p>
                <div v-if="noMatchHelp" class="item-box__group" data-testid="record-no-match">
                  <p class="item-box__text">
                    Report what you lost first. We match it against this find, and you can claim it
                    from Matches straight away.
                  </p>
                  <BaseButton to="/report/lost" size="sm">Report a lost item</BaseButton>
                </div>
                <BaseButton v-else data-testid="record-claim" @click="startClaim">
                  {{ auth.isLoggedIn ? 'This is mine' : 'Sign in to claim' }}
                </BaseButton>
              </template>
            </template>

            <!-- A lost report still open -->
            <template v-else-if="stage === 'waiting'">
              <h2 class="ds-h3 item-box__title">
                {{ isPoster ? 'Your lost report' : 'Someone lost this' }}
              </h2>
              <p class="item-box__text">
                <template v-if="isPoster">Finds that look like it show up in Matches.</template>
                <template v-else>Seen it? Report it found and we’ll match the two.</template>
              </p>
              <BaseButton v-if="isPoster" to="/matches" variant="secondary" size="sm">
                See your matches
              </BaseButton>
              <BaseButton v-else to="/report/found" size="sm">Report a found item</BaseButton>
            </template>

            <!-- V13: claimed, the handoff is under way -->
            <template v-else-if="stage === 'matched'">
              <h2 class="ds-h3 item-box__title">Matched with someone</h2>
              <p class="item-box__text">
                Matched on {{ formatWhen(claimedAt) }}.<template v-if="showDispute">
                  Think it’s yours? You can still say so.</template
                >
              </p>
            </template>

            <!-- V13c: handed over, waiting for the owner -->
            <template v-else-if="stage === 'handedOver'">
              <h2 class="ds-h3 item-box__title">Handed over on {{ formatWhen(handedAt) }}</h2>
              <p class="item-box__text">
                Waiting for the owner to confirm they have it.<template v-if="showDispute">
                  Think it’s yours? You can open a dispute now. Once it’s resolved, you’ll still
                  have 7 days.</template
                >
              </p>
            </template>

            <!-- V13d: back with its owner -->
            <template v-else-if="stage === 'returned'">
              <h2 class="ds-h3 item-box__title">Resolved on {{ formatWhen(returnedAt) }}</h2>
              <p v-if="window7.open" class="item-window" data-testid="record-window">
                <span class="item-window__label">Dispute window</span>
                <strong class="item-window__left">{{ window7.left }}</strong>
                <span class="item-window__closes">
                  Closes {{ formatWhen(window7.closesAt) }}. That’s 7 days after it was returned.
                </span>
              </p>
              <p v-else class="item-box__text">It’s back with its owner.</p>
            </template>

            <!-- Paused by a dispute -->
            <template v-else-if="stage === 'disputed'">
              <h2 class="ds-h3 item-box__title">Paused</h2>
              <p class="item-box__text" data-testid="record-paused">
                Someone has said this item is theirs. The handoff is paused until an admin decides.
              </p>
            </template>

            <template v-else>
              <h2 class="ds-h3 item-box__title">No longer listed</h2>
              <p class="item-box__text">This report was closed.</p>
            </template>

            <p v-if="decision" class="item-quote" data-testid="record-decision">
              <strong>Dispute decided:</strong>
              {{ decisionWords(decision) }} ·
              {{ formatWhen(decision.at) }}
            </p>

            <div v-if="myLinkTo || showDispute" class="item-box__actions">
              <BaseButton v-if="myLinkTo" :to="myLinkTo" data-testid="record-chat">
                Open the handoff chat
              </BaseButton>
              <BaseButton
                v-if="showDispute"
                variant="secondary"
                data-testid="record-dispute"
                @click="openDispute"
              >
                This is my item. Dispute it
              </BaseButton>
            </div>
          </div>

          <ReturnTrack v-if="isFound" :steps="track" />

          <div class="item-report">
            <p
              v-if="reportMessage"
              class="item-report__done"
              role="status"
              data-testid="record-report-done"
            >
              {{ reportMessage }}
            </p>
            <button
              v-else-if="canReport && !showReport"
              type="button"
              class="ds-link item-report__open"
              data-testid="record-report-open"
              @click="showReport = true"
            >
              Report this post
            </button>
            <form
              v-if="showReport"
              class="item-report__form"
              data-testid="record-report-form"
              @submit.prevent="sendReport"
            >
              <div class="item-report__field">
                <label for="report-reason" class="item-report__label">
                  What is wrong with this post?
                </label>
                <textarea
                  id="report-reason"
                  v-model="reportReason"
                  class="item-report__input"
                  rows="2"
                  maxlength="500"
                  required
                  data-testid="record-report-reason"
                ></textarea>
              </div>
              <p v-if="reportError" class="item-report__error" role="alert">
                {{ reportError }}
              </p>
              <div class="item-box__actions">
                <BaseButton
                  type="submit"
                  variant="secondary"
                  size="sm"
                  :disabled="isReporting"
                  data-testid="record-report-send"
                >
                  Report to an admin
                </BaseButton>
                <BaseButton variant="link" size="sm" @click="showReport = false">
                  Cancel
                </BaseButton>
              </div>
              <NotSentNote
                v-if="reportNotSent"
                :busy="isReporting"
                :maybe-sent="reportMaybeSent"
                @retry="sendReport"
              />
            </form>
          </div>
        </div>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.item-page-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.item-page {
  flex: 1;
  padding-top: var(--ds-space-4);
  /* Clear of the iPhone's home bar */
  padding-bottom: max(var(--ds-space-8), env(safe-area-inset-bottom));
}

.item-page__back {
  gap: var(--ds-space-1);
}

.item-page__back svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The whole photo shows, never cropped, inside Bootstrap's 4:3 ratio box */
.item-page__picture {
  overflow: hidden;
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-tile);
}

.item-page__picture img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.item-page__number {
  margin: 0 0 var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.item-page__title {
  margin: 0 0 var(--ds-space-4);
  overflow-wrap: anywhere;
}

.item-page__plain {
  white-space: pre-wrap;
}

/* ---- Facts: a label column and a value column ---- */
.item-facts {
  margin: 0 0 var(--ds-space-5);
}

.item-facts__row {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  gap: var(--ds-space-3);
  padding: var(--ds-space-2) 0;
  border-top: 1px solid var(--ds-border);
}

.item-facts__row:last-child {
  border-bottom: 1px solid var(--ds-border);
}

.item-facts dt {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-regular);
}

.item-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.item-facts__note {
  display: block;
  margin-top: var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

/* ---- Where it is up to: a plain bordered panel ---- */
.item-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-5);
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.item-box__title {
  margin: 0;
}

.item-box__text {
  margin: 0;
  color: var(--ds-text-muted);
}

.item-box__group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
}

.item-box__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-3);
}

/* The dispute window: a label, the time left, when it closes */
.item-window {
  display: grid;
  gap: var(--ds-space-1);
  margin: 0;
}

.item-window__label {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.item-window__left {
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h2);
  line-height: var(--ds-leading-h2);
}

.item-window__closes {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

/* An admin's decision, set apart on a sunken panel */
.item-quote {
  align-self: stretch;
  margin: 0;
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
  font-size: var(--ds-size-small);
  overflow-wrap: anywhere;
}

/* ---- Report this post: a quiet link that opens a small form ---- */
.item-report {
  margin-top: var(--ds-space-5);
}

.item-report__open {
  min-height: var(--ds-control-h);
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-regular);
  cursor: pointer;
}

.item-report__done {
  margin: 0;
  color: var(--ds-success);
  font-size: var(--ds-size-small);
}

.item-report__form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
  max-width: 32rem;
}

.item-report__field {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.item-report__label {
  font-weight: var(--ds-weight-medium);
}

.item-report__input {
  width: 100%;
  padding: var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font: inherit;
  resize: vertical;
}

.item-report__input:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 1px;
  border-color: var(--ds-action);
}

.item-report__error {
  margin: 0;
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}
</style>
