<script setup>
// Claim a find (WS5, Figma section 08: V13a "Is this yours?" and V13 "Matched
// with someone"), at /matches/:id/claim, where "This is mine" on the Matches
// page goes. The owner sees the found item and tells the finder one detail
// only the owner would know. That opens the handoff chat straight away
// (/matches/:id/handoff), and the claim is logged against their SMU account.
// The form only shows while the find can still be claimed; otherwise the box
// says why (claimed by someone else, returned, or the report closed).
// Built in the design system (class="ds", assets/system.css). On phones the
// claim box comes straight after the name; on wide screens the picture sits
// on the left.
//
// Data: GET /api/claims/:matchId and GET /api/spots. Claiming is
// POST /api/claims/:matchId { detail }.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import PageProblem from '@/components/handoff/PageProblem.vue'
import ReturnTrack from '@/components/handoff/ReturnTrack.vue'
import { ledgerNumber, mainColour } from '@/utils/design'
import { HIDDEN_PLACE } from '@/utils/feed'
import { canClaim, returnTrack, unavailableText } from '@/utils/handoff'
import { errorText, formatWhen, isConnectionError, mayHaveSent } from '@/utils/safeguards'
import { spotName } from '@/utils/spots'

const DETAIL_MAX = 500

const route = useRoute()
const router = useRouter()

const matchId = computed(() => route.params.id)
const overview = ref(null)
const spotsById = ref(new Map())
const loading = ref(true)
const loadError = ref('')
// No answer from FoundIt: the "can't reach" panel, whose Try again runs load() again
const cantReach = ref(false)

const item = computed(() => overview.value?.foundItem || null)
const open = computed(() => canClaim(overview.value))
const unavailable = computed(() => unavailableText(overview.value))
const track = computed(() => returnTrack(overview.value))
const place = computed(() => {
  // The server leaves the place and time out unless your report already said them
  if (item.value?.placeHidden) return HIDDEN_PLACE
  const spot = spotsById.value.get(item.value?.trail?.[0]?.spotId)
  return spot ? spotName(spot) : 'Unknown place'
})
const category = computed(() =>
  [item.value?.category, item.value?.colour].filter(Boolean).join(', '),
)

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
    // Already claimed, or this is the finder: the handoff page is the place
    if (overview.value.role === 'finder' || overview.value.claim) {
      router.replace(`/matches/${matchId.value}/handoff`)
    }
    cantReach.value = false
  } catch (error) {
    cantReach.value = isConnectionError(error)
    if (!cantReach.value) loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Every way here is already a "This is mine" click (Matches or the item page),
// so the form starts open. Cancel folds it back behind the button.
const claiming = ref(true)
const detail = ref('')
const sending = ref(false)
const sendError = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the detail stays typed
const notSent = ref(false)
// No answer in time: the claim may have been saved. Sending again is safe; the
// server answers with the claim that stands.
const maybeSent = ref(false)
const left = computed(() => DETAIL_MAX - detail.value.length)

async function sendClaim() {
  sendError.value = ''
  notSent.value = false
  if (!detail.value.trim()) {
    sendError.value = 'Add one detail only the owner would know.'
    return
  }
  sending.value = true
  try {
    await api.post(`/claims/${matchId.value}`, { detail: detail.value.trim() })
    router.push(`/matches/${matchId.value}/handoff`)
  } catch (error) {
    if (isConnectionError(error)) {
      notSent.value = true
      maybeSent.value = mayHaveSent(error)
    } else sendError.value = errorText(error)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="ds claim-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap claim">
      <RouterLink to="/matches" class="ds-link claim__back" data-testid="claim-back">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back to your matches
      </RouterLink>

      <ConnectionProblem v-if="cantReach" :busy="loading" data-testid="claim-error" @retry="load" />
      <PageSkeleton v-else-if="loading" kind="detail" label="Loading the find…" />
      <PageProblem
        v-else-if="loadError"
        :message="loadError"
        :links="[
          { to: '/matches', label: 'Your matches' },
          { to: '/feed', label: 'The feed' },
        ]"
        data-testid="claim-error"
      />

      <div v-else-if="item" class="claim__layout ds-arrive">
        <div class="claim__picture" :class="{ 'has-photo': item.photoUrl }">
          <img v-if="item.photoUrl" :src="item.photoUrl" :alt="item.title" />
          <ItemIcon v-else :category="item.category" :colour="mainColour(item)" :size="120" />
        </div>

        <header class="claim__head">
          <p class="claim__number ds-num">{{ ledgerNumber(item.id) }}</p>
          <h1 class="ds-h1 claim__title" data-testid="claim-title">{{ item.title }}</h1>
        </header>

        <!-- The one thing to do here; on phones it comes before the facts -->
        <section class="claim__box" aria-labelledby="claim-box-title" data-testid="claim-box">
          <template v-if="open">
            <h2 id="claim-box-title" class="ds-h3 claim__box-title">Is this yours?</h2>
            <p v-if="overview.match.score" class="claim__muted">
              A {{ Math.round(overview.match.score) }}% match with your lost report.
            </p>

            <form v-if="claiming" class="claim__form" novalidate @submit.prevent="sendClaim">
              <div class="claim__field">
                <label for="claim-detail" class="claim__label">
                  One detail only the owner would know
                </label>
                <textarea
                  id="claim-detail"
                  v-model="detail"
                  class="claim__input"
                  rows="3"
                  :maxlength="DETAIL_MAX"
                  placeholder="For example: a small cat sticker near the base, and a dent on the lid"
                  aria-describedby="claim-detail-hint"
                  :aria-invalid="Boolean(sendError)"
                  data-testid="claim-detail"
                ></textarea>
                <p id="claim-detail-hint" class="claim__hint">
                  <span>Only the finder and admins see this.</span>
                  <span class="ds-num">{{ left }} characters left.</span>
                </p>
                <p
                  v-if="sendError"
                  class="claim__error"
                  role="alert"
                  data-testid="claim-send-error"
                >
                  {{ sendError }}
                </p>
              </div>
              <p class="claim__note">
                Claims are logged to your SMU account. A false claim can get your account suspended.
              </p>
              <div class="claim__actions">
                <BaseButton
                  type="submit"
                  :disabled="sending"
                  :aria-busy="sending"
                  data-testid="claim-submit"
                >
                  Claim it and open the chat
                </BaseButton>
                <BaseButton variant="link" @click="claiming = false">Cancel</BaseButton>
              </div>
              <NotSentNote
                v-if="notSent"
                :busy="sending"
                :maybe-sent="maybeSent"
                @retry="sendClaim"
              />
            </form>
            <BaseButton v-else data-testid="claim-start" @click="claiming = true">
              This is mine
            </BaseButton>
          </template>

          <template v-else>
            <h2 id="claim-box-title" class="ds-h3 claim__box-title" data-testid="claim-unavailable">
              {{ unavailable.title }}
            </h2>
            <p class="claim__muted">{{ unavailable.body }}</p>
            <div class="claim__actions">
              <BaseButton to="/matches" variant="secondary">Back to your matches</BaseButton>
              <BaseButton :to="`/items/${item.id}/record`" variant="link">The item page</BaseButton>
            </div>
          </template>
        </section>

        <dl class="claim__facts">
          <div class="claim__fact">
            <dt>Found at</dt>
            <dd>{{ place }}</dd>
          </div>
          <div v-if="!item.placeHidden" class="claim__fact">
            <dt>When</dt>
            <dd>{{ formatWhen(item.trail?.[0]?.from) }}</dd>
          </div>
          <div v-if="category" class="claim__fact">
            <dt>Category</dt>
            <dd>{{ category }}</dd>
          </div>
          <div class="claim__fact">
            <dt>Finder</dt>
            <dd>Hidden for privacy</dd>
          </div>
        </dl>

        <div class="claim__track">
          <ReturnTrack :steps="track" />
        </div>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.claim-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.claim {
  flex: 1;
  padding-top: var(--ds-space-4);
  /* Clear of the iPhone's home bar */
  padding-bottom: max(var(--ds-space-8), env(safe-area-inset-bottom));
}

.claim__back {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  min-height: var(--ds-control-h);
  margin-bottom: var(--ds-space-3);
  font-size: var(--ds-size-small);
}

.claim__back svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Phones: picture, name, the claim box, the facts, the track */
.claim__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'picture'
    'head'
    'box'
    'facts'
    'track';
  gap: var(--ds-space-5);
}

.claim__picture {
  grid-area: picture;
  display: grid;
  place-items: center;
  height: 11rem;
  overflow: hidden;
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-tile);
}

.claim__picture img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.claim__head {
  grid-area: head;
}

.claim__number {
  margin: 0 0 var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.claim__title {
  margin: 0;
  overflow-wrap: anywhere;
}

/* ---- The claim box: a plain panel, the page's one filled button ---- */
.claim__box {
  grid-area: box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.claim__box-title {
  margin: 0;
}

.claim__muted {
  margin: 0;
  color: var(--ds-text-muted);
}

.claim__form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
  align-self: stretch;
}

.claim__field {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.claim__label {
  color: var(--ds-text);
  font-weight: var(--ds-weight-medium);
}

.claim__input {
  width: 100%;
  min-height: calc(var(--ds-control-h) * 2);
  padding: var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font: inherit;
  resize: vertical;
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.claim__input::placeholder {
  color: var(--ds-text-muted);
}

.claim__input:hover {
  border-color: var(--ds-text-muted);
}

.claim__input:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 1px;
  border-color: var(--ds-action);
}

.claim__input[aria-invalid='true'] {
  border-color: var(--ds-danger);
}

.claim__hint {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ds-space-1) var(--ds-space-3);
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.claim__error {
  margin: 0;
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.claim__note {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.claim__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-3) var(--ds-space-5);
}

/* ---- Facts: a label column and a value column ---- */
.claim__facts {
  grid-area: facts;
  margin: 0;
}

.claim__fact {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  gap: var(--ds-space-3);
  padding: var(--ds-space-2) 0;
  border-top: 1px solid var(--ds-border);
}

.claim__fact:last-child {
  border-bottom: 1px solid var(--ds-border);
}

.claim__fact dt {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-regular);
}

.claim__fact dd {
  margin: 0;
  color: var(--ds-text);
  overflow-wrap: anywhere;
}

.claim__track {
  grid-area: track;
}

/* Wide screens: the picture on the left, everything else beside it, with the
   facts before the claim box */
@media (min-width: 768px) {
  .claim__layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas:
      'picture head'
      'picture facts'
      'picture box'
      'picture track';
    column-gap: var(--ds-space-7);
    align-items: start;
  }

  .claim__picture {
    height: auto;
    aspect-ratio: 4 / 3;
  }

  .claim__picture.has-photo img {
    object-fit: cover;
  }
}
</style>
