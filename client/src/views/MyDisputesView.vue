<script setup>
// Feature 5a: the disputes about the user's own claims (Figma v3 V15), where
// they add their side or withdraw the claim, and the disputes they raised.
// Neither side ever sees who the other person is.
//
// Decided disputes and the ones you raised are listed like Your handoffs: the
// item, a chip with the outcome, and "See verdict". The admin's decision and
// reason open under the row, and opening it clears the "New verdict" tag and
// the count in the account menu (stores/disputes.js). ?verdict=12, from the
// "An admin decided" notice, opens that one straight away.
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import { isPhotoUploadEnabled, uploadPhoto } from '@/services/cloudinary'
import {
  DISPUTE_LABELS,
  VERDICT_CHIPS,
  itemCode,
  formatWhen,
  errorText,
  isConnectionError,
} from '@/utils/safeguards'
import { ledgerNumber, mainColour } from '@/utils/design'
import { useDisputesStore } from '@/stores/disputes'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import ProofDrop from '@/components/safeguards/ProofDrop.vue'
import '@/assets/safeguards.css'

const route = useRoute()
const disputes = useDisputesStore()

const raised = ref([])
const onMyClaims = ref([])
const errorMessage = ref('')
const isLoading = ref(true)
// The page's first load got no answer from FoundIt: the "can't reach" panel,
// whose Try again opens the page again. A later reload that fails (after
// sending your side) keeps the list and shows the message above it instead.
const cantReach = ref(false)
const hasLoaded = ref(false)
const justSent = computed(() => route.query.sent === '1')
const photoUpload = isPhotoUploadEnabled()

const openOnMyClaims = computed(() => onMyClaims.value.filter((d) => d.status === 'open'))
const decidedOnMyClaims = computed(() => onMyClaims.value.filter((d) => d.status !== 'open'))

// Per dispute on my claim: { response, proofUrl, proofName, busy, error, notSent,
// confirmWithdraw }
const drafts = ref({})

// Each dispute comes with the item it is about (its name and photo), or null
// once an admin has taken the post down
function itemOf(dispute) {
  return dispute.item || { id: dispute.itemId, title: 'An item that is no longer listed' }
}

async function load() {
  errorMessage.value = ''
  try {
    const [mine, claims] = await Promise.all([
      api.get('/disputes/mine'),
      api.get('/disputes/on-my-claims'),
    ])
    raised.value = mine.data
    onMyClaims.value = claims.data
    // Share them, so the account menu's count agrees with this page
    disputes.raised = mine.data
    disputes.onMyClaims = claims.data
    hasLoaded.value = true
    cantReach.value = false
    for (const dispute of claims.data) {
      drafts.value[dispute.id] ??= {
        response: dispute.claimerResponse || '',
        proofUrl: dispute.claimerProofUrl || '',
        proofName: '',
        busy: false,
        error: '',
        notSent: false,
        confirmWithdraw: false,
      }
    }
  } catch (error) {
    cantReach.value = !hasLoaded.value && isConnectionError(error)
    if (!cantReach.value) errorMessage.value = errorText(error)
  } finally {
    isLoading.value = false
  }
}

// The rows whose verdict is open, by dispute id
const shown = ref(new Set())

function isShown(dispute) {
  return shown.value.has(dispute.id)
}

function toggle(dispute) {
  const next = new Set(shown.value)
  if (next.has(dispute.id)) next.delete(dispute.id)
  else {
    next.add(dispute.id)
    disputes.markRead(dispute.id)
  }
  shown.value = next
}

async function openPage() {
  isLoading.value = true
  await load()
  if (cantReach.value) return
  // Opened from the notice: show that verdict and bring it into view
  const wanted = Number(route.query.verdict)
  const dispute = [...raised.value, ...onMyClaims.value].find((entry) => entry.id === wanted)
  if (!dispute || isShown(dispute)) return
  toggle(dispute)
  await nextTick()
  document.getElementById(`verdict-row-${dispute.id}`)?.scrollIntoView?.({ block: 'center' })
}

onMounted(openPage)

async function chooseProof(dispute, file) {
  const draft = drafts.value[dispute.id]
  draft.error = ''
  draft.busy = true
  try {
    draft.proofUrl = await uploadPhoto(file)
    draft.proofName = file.name
  } catch (error) {
    draft.error = error.message
  } finally {
    draft.busy = false
  }
}

async function sendResponse(dispute) {
  const draft = drafts.value[dispute.id]
  draft.error = ''
  draft.notSent = false
  draft.busy = true
  try {
    await api.post(`/disputes/${dispute.id}/respond`, {
      response: draft.response.trim(),
      proofUrl: draft.proofUrl || undefined,
    })
    await load()
  } catch (error) {
    if (isConnectionError(error)) draft.notSent = true
    else draft.error = errorText(error)
  } finally {
    draft.busy = false
  }
}

async function withdraw(dispute) {
  const draft = drafts.value[dispute.id]
  draft.error = ''
  draft.busy = true
  try {
    await api.post(`/disputes/${dispute.id}/withdraw`)
    await load()
  } catch (error) {
    draft.error = errorText(error)
    // 409: an admin decided it a moment ago, so show the decision
    if (error.response?.status === 409) await load()
  } finally {
    draft.busy = false
  }
}
</script>

<template>
  <div class="ds sg-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap sg-main">
      <PageHeader
        class="mb-4"
        title="My disputes"
        lede="Disputes about items you claimed, and the ones you raised. Nobody is told who the other person is."
      />

      <div v-if="justSent" class="sg-notice" role="status" data-testid="disputes-sent">
        Your dispute was sent. The handoff is paused, and an admin will compare both sides.
      </div>
      <div v-if="errorMessage" class="sg-alert" role="alert" data-testid="disputes-error">
        {{ errorMessage }}
      </div>
      <ConnectionProblem
        v-if="cantReach"
        :busy="isLoading"
        data-testid="disputes-load-error"
        @retry="openPage"
      />
      <PageSkeleton v-else-if="isLoading" />

      <div v-else class="ds-arrive">
        <section data-testid="disputes-on-my-claims">
          <article
            v-for="dispute in openOnMyClaims"
            :key="dispute.id"
            class="mb-5"
            :data-testid="`claim-dispute-${dispute.id}`"
          >
            <div class="sg-head">
              <span class="sg-pill sg-pill-warn mb-2">Disputed</span>
              <h2 class="ds-h2">Someone else says it's theirs</h2>
              <p class="ds-lead ds-muted">
                An admin compares both sides. Honest mistakes aren't penalised.
              </p>
            </div>

            <div class="sg-split">
              <div>
                <blockquote v-if="dispute.claimDetail" class="sg-card mb-3">
                  <div class="sg-label mb-1">What you said when you claimed it</div>
                  “{{ dispute.claimDetail }}”
                </blockquote>

                <form @submit.prevent="sendResponse(dispute)">
                  <label :for="`response-${dispute.id}`" class="sg-field-label"
                    >Add a detail only the owner would know</label
                  >
                  <textarea
                    :id="`response-${dispute.id}`"
                    v-model="drafts[dispute.id].response"
                    class="sg-input"
                    rows="3"
                    maxlength="2000"
                    required
                    placeholder="A scratch, an engraving, what's inside…"
                    data-testid="dispute-response"
                  ></textarea>
                  <p
                    class="sg-hint"
                    :class="{ 'sg-hint-good': drafts[dispute.id].response.trim().length >= 30 }"
                  >
                    Specific details help the admin decide.
                  </p>
                  <ProofDrop
                    v-if="photoUpload"
                    :id="`proof-${dispute.id}`"
                    :busy="drafts[dispute.id].busy"
                    :file-name="drafts[dispute.id].proofName"
                    @file="chooseProof(dispute, $event)"
                  />
                  <div v-if="drafts[dispute.id].error" class="sg-alert">
                    {{ drafts[dispute.id].error }}
                  </div>
                  <p v-if="dispute.respondedAt" class="sg-hint sg-hint-good">
                    Your side was sent {{ formatWhen(dispute.respondedAt) }}. You can update it.
                  </p>

                  <div v-if="!drafts[dispute.id].confirmWithdraw" class="d-flex flex-wrap gap-2">
                    <BaseButton
                      type="submit"
                      :disabled="drafts[dispute.id].busy"
                      data-testid="dispute-respond"
                    >
                      Send my side
                    </BaseButton>
                    <BaseButton
                      variant="secondary"
                      data-testid="dispute-withdraw-open"
                      @click="drafts[dispute.id].confirmWithdraw = true"
                    >
                      Withdraw my claim
                    </BaseButton>
                  </div>
                  <div v-else class="sg-card" role="group" aria-label="Withdraw your claim">
                    <div class="sg-card-title">Withdraw your claim?</div>
                    <p class="ds-small ds-muted">
                      The item goes to the other person, and your own lost report opens again.
                    </p>
                    <div class="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="ds-btn ds-btn--secondary sg-danger"
                        :disabled="drafts[dispute.id].busy"
                        data-testid="dispute-withdraw"
                        @click="withdraw(dispute)"
                      >
                        Withdraw my claim
                      </button>
                      <BaseButton
                        variant="secondary"
                        @click="drafts[dispute.id].confirmWithdraw = false"
                      >
                        Keep it
                      </BaseButton>
                    </div>
                  </div>
                  <NotSentNote
                    v-if="drafts[dispute.id].notSent"
                    :busy="drafts[dispute.id].busy"
                    @retry="sendResponse(dispute)"
                  />
                </form>
              </div>

              <aside>
                <div class="sg-item mb-3">
                  <img
                    v-if="itemOf(dispute)?.photoUrl"
                    :src="itemOf(dispute).photoUrl"
                    alt=""
                    class="sg-thumb sg-thumb-sm"
                  />
                  <span v-else class="sg-thumb sg-thumb-sm" aria-hidden="true">
                    <ItemIcon
                      :category="itemOf(dispute)?.category"
                      :colour="mainColour(itemOf(dispute))"
                      :size="26"
                    />
                  </span>
                  <div>
                    <div class="fw-bold">{{ itemOf(dispute)?.title }}</div>
                    <div class="ds-small ds-muted">
                      <template v-if="dispute.claimedAt">
                        You claimed it {{ formatWhen(dispute.claimedAt) }}
                      </template>
                      <template v-else>Disputed {{ formatWhen(dispute.createdAt) }}</template>
                    </div>
                    <RouterLink
                      :to="`/items/${dispute.itemId}/record`"
                      class="ds-small ds-muted"
                      data-testid="claim-dispute-item"
                      >See the item ({{ itemCode(dispute.itemId) }})</RouterLink
                    >
                  </div>
                </div>
                <div class="sg-card">
                  <div class="sg-card-title">What happens next</div>
                  <ol class="sg-numbers">
                    <li><span class="sg-num">1</span> You send your side</li>
                    <li><span class="sg-num">2</span> An admin compares both</li>
                    <li>
                      <span class="sg-num">3</span> You both see the decision and its reason here
                    </li>
                  </ol>
                </div>
              </aside>
            </div>
          </article>

          <template v-if="onMyClaims.length === 0">
            <h2 class="ds-h3 mb-3">About items you claimed</h2>
            <p class="sg-empty">Nobody has disputed your claims.</p>
          </template>
          <h2 v-if="decidedOnMyClaims.length" class="ds-h3 mb-3">
            Decided disputes about your claims
          </h2>
          <ol v-if="decidedOnMyClaims.length" class="verdicts">
            <li
              v-for="dispute in decidedOnMyClaims"
              :id="`verdict-row-${dispute.id}`"
              :key="dispute.id"
              class="verdicts__row"
              :data-testid="`claim-dispute-${dispute.id}`"
            >
              <button
                type="button"
                class="verdicts__head"
                :aria-expanded="isShown(dispute)"
                :aria-controls="`verdict-${dispute.id}`"
                data-testid="verdict-toggle"
                @click="toggle(dispute)"
              >
                <span class="verdicts__thumb">
                  <img v-if="itemOf(dispute)?.photoUrl" :src="itemOf(dispute).photoUrl" alt="" />
                  <ItemIcon
                    v-else
                    :category="itemOf(dispute)?.category"
                    :colour="mainColour(itemOf(dispute))"
                    :size="32"
                  />
                </span>
                <span class="verdicts__text">
                  <span class="verdicts__title">
                    {{ itemOf(dispute)?.title || 'Item' }}
                    <span
                      v-if="disputes.isUnread(dispute)"
                      class="verdicts__new"
                      data-testid="verdict-new"
                    >
                      <span class="verdicts__dot" aria-hidden="true"></span>New verdict
                    </span>
                  </span>
                  <span class="verdicts__meta">
                    <span class="ds-num">{{ ledgerNumber(dispute.itemId) }}</span> · You claimed
                    this · decided {{ formatWhen(dispute.decidedAt) }}
                  </span>
                </span>
                <span
                  class="sg-pill"
                  :class="`sg-pill-${VERDICT_CHIPS.claimer[dispute.status].tone}`"
                >
                  {{ VERDICT_CHIPS.claimer[dispute.status].label }}
                </span>
                <span class="ds-link verdicts__open">
                  {{ isShown(dispute) ? 'Hide verdict' : 'See verdict' }}
                  <svg
                    class="verdicts__chevron"
                    :class="{ 'is-open': isShown(dispute) }"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
              <div
                v-if="isShown(dispute)"
                :id="`verdict-${dispute.id}`"
                class="verdicts__body"
                data-testid="verdict-body"
              >
                <p class="sg-label mb-1">The admin's decision</p>
                <p class="verdicts__decision">{{ DISPUTE_LABELS.claimer[dispute.status] }}</p>
                <p v-if="dispute.decisionReason" class="mb-2">
                  <strong>Reason:</strong> {{ dispute.decisionReason }}
                </p>
                <!-- returnBy is only set when the item had already reached this person -->
                <p
                  v-if="dispute.returnBy"
                  class="verdicts__due mb-2"
                  data-testid="claim-dispute-return"
                >
                  You have the item, so please bring it to a collection point by
                  <strong>{{ formatWhen(dispute.returnBy) }}</strong
                  >. It then goes to its owner.
                </p>
                <p class="d-flex flex-wrap gap-3 mb-0">
                  <RouterLink :to="`/items/${dispute.itemId}/record`" class="ds-small ds-muted"
                    >See the item record ({{ itemCode(dispute.itemId) }})</RouterLink
                  >
                  <!-- The claim was kept, so the paused handoff goes on -->
                  <RouterLink
                    v-if="dispute.status === 'closed'"
                    to="/returns"
                    class="ds-small ds-muted"
                    >Carry on with the handoff</RouterLink
                  >
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section class="mt-5" data-testid="disputes-raised">
          <h2 class="ds-h3 mb-3">Disputes you raised</h2>
          <p v-if="raised.length === 0" class="sg-empty">You have not disputed any claims.</p>
          <ol v-else class="verdicts">
            <li
              v-for="dispute in raised"
              :id="`verdict-row-${dispute.id}`"
              :key="dispute.id"
              class="verdicts__row"
              :data-testid="`raised-dispute-${dispute.id}`"
            >
              <button
                type="button"
                class="verdicts__head"
                :aria-expanded="isShown(dispute)"
                :aria-controls="`verdict-${dispute.id}`"
                data-testid="verdict-toggle"
                @click="toggle(dispute)"
              >
                <span class="verdicts__thumb">
                  <img v-if="itemOf(dispute)?.photoUrl" :src="itemOf(dispute).photoUrl" alt="" />
                  <ItemIcon
                    v-else
                    :category="itemOf(dispute)?.category"
                    :colour="mainColour(itemOf(dispute))"
                    :size="32"
                  />
                </span>
                <span class="verdicts__text">
                  <span class="verdicts__title">
                    {{ itemOf(dispute)?.title || 'Item' }}
                    <span
                      v-if="disputes.isUnread(dispute)"
                      class="verdicts__new"
                      data-testid="verdict-new"
                    >
                      <span class="verdicts__dot" aria-hidden="true"></span>New verdict
                    </span>
                  </span>
                  <span class="verdicts__meta">
                    <span class="ds-num">{{ ledgerNumber(dispute.itemId) }}</span> · You disputed
                    this · {{ formatWhen(dispute.createdAt) }}
                  </span>
                </span>
                <span
                  class="sg-pill"
                  :class="`sg-pill-${VERDICT_CHIPS.raiser[dispute.status].tone}`"
                >
                  {{ VERDICT_CHIPS.raiser[dispute.status].label }}
                </span>
                <span class="ds-link verdicts__open">
                  <template v-if="isShown(dispute)">Hide</template>
                  <template v-else-if="dispute.status === 'open'">See details</template>
                  <template v-else>See verdict</template>
                  <svg
                    class="verdicts__chevron"
                    :class="{ 'is-open': isShown(dispute) }"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
              <div
                v-if="isShown(dispute)"
                :id="`verdict-${dispute.id}`"
                class="verdicts__body"
                data-testid="verdict-body"
              >
                <template v-if="dispute.status === 'open'">
                  <p class="mb-2">
                    An admin is comparing both sides. The handoff is paused until they decide, and
                    you'll be told here.
                  </p>
                </template>
                <template v-else>
                  <p class="sg-label mb-1">
                    {{ dispute.status === 'withdrawn' ? 'What happened' : "The admin's decision" }}
                  </p>
                  <p class="verdicts__decision">{{ DISPUTE_LABELS.raiser[dispute.status] }}</p>
                  <p v-if="dispute.decisionReason" class="mb-2">
                    <strong>Reason:</strong> {{ dispute.decisionReason }}
                  </p>
                </template>
                <!-- The other person already had it, so they bring it back first -->
                <p
                  v-if="dispute.returnBy && ['upheld', 'withdrawn'].includes(dispute.status)"
                  class="verdicts__due mb-2"
                  data-testid="raised-dispute-return"
                >
                  The person who had it must bring it to a collection point by
                  <strong>{{ formatWhen(dispute.returnBy) }}</strong
                  >. Then you can collect it.
                </p>
                <!-- The claim moved to them, so the handoff starts again with them -->
                <p
                  v-if="['upheld', 'withdrawn'].includes(dispute.status)"
                  class="mb-2"
                  data-testid="raised-dispute-next"
                >
                  <BaseButton to="/returns" size="sm">
                    Arrange the handoff with the finder
                  </BaseButton>
                </p>
                <RouterLink :to="`/items/${dispute.itemId}/record`" class="ds-small ds-muted"
                  >See the item record ({{ itemCode(dispute.itemId) }})</RouterLink
                >
              </div>
            </li>
          </ol>
        </section>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* The rows look like Your handoffs (MyHandoffsView.vue): the item, a chip with
   the outcome and a link, with the verdict opening underneath */
.verdicts {
  margin: 0 0 var(--ds-space-4);
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--ds-border);
}

.verdicts__row {
  border-bottom: 1px solid var(--ds-border);
}

.verdicts__head {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  grid-template-areas:
    'thumb text'
    'thumb chip'
    'thumb open';
  align-items: center;
  gap: 0.35rem var(--ds-space-4);
  width: 100%;
  padding: var(--ds-space-4) 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.verdicts__head:hover .verdicts__open {
  text-decoration: underline;
}

.verdicts__thumb {
  grid-area: thumb;
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.verdicts__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.verdicts__text {
  grid-area: text;
  display: block;
  min-width: 0;
}

.verdicts__title {
  display: block;
  font-weight: var(--ds-weight-bold);
  overflow-wrap: anywhere;
}

/* "New verdict": a navy dot and the words, like "New message" on Returns */
.verdicts__new {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  margin-left: var(--ds-space-2);
  color: var(--ds-action);
  font-size: var(--ds-size-small);
  white-space: nowrap;
}

.verdicts__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--ds-radius-round);
  background: currentColor;
}

.verdicts__meta {
  display: block;
  margin-top: 0.15rem;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.verdicts__head .sg-pill {
  align-self: center;
  grid-area: chip;
  justify-self: start;
}

.verdicts__open {
  grid-area: open;
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  justify-self: start;
  font-size: var(--ds-size-small);
}

.verdicts__chevron {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: rotate var(--ds-dur-base) var(--ds-ease-out);
}

.verdicts__chevron.is-open {
  rotate: -90deg;
}

.verdicts__body {
  margin: 0 0 var(--ds-space-4);
  padding: var(--ds-space-4) 1.25rem;
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
}

.verdicts__decision {
  margin-bottom: var(--ds-space-2);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
}

.verdicts__due {
  font-weight: var(--ds-weight-medium);
  color: var(--ds-danger);
}

@media (min-width: 768px) {
  .verdicts__head {
    grid-template-columns: 4rem 1fr auto auto;
    grid-template-areas: 'thumb text chip open';
    gap: 1.25rem;
  }

  .verdicts__body {
    margin-left: 5.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .verdicts__chevron {
    transition: none;
  }
}
</style>
