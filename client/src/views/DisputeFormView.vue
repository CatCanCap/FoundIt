<script setup>
// Feature 5a, "This is my item" (Figma v3 V14, in its handoff pending and
// returned versions). The person's own lost report is attached on the server;
// this page shows which one it will be. Proof photos go straight to
// Cloudinary (WS2's service) and only the link is sent. Before showing the
// form, the page checks the item can be disputed at all, so nobody fills it
// in only to be refused.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { isPhotoUploadEnabled, uploadPhoto } from '@/services/cloudinary'
import {
  itemCode,
  lostCode,
  formatWhen,
  errorText,
  isConnectionError,
  mayHaveSent,
  claimedAt,
  disputeBlocker,
  attachedLostReport,
} from '@/utils/safeguards'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import ProofDrop from '@/components/safeguards/ProofDrop.vue'
import '@/assets/safeguards.css'
import { mainColour, placeName } from '@/utils/design'
import { myLink } from '@/utils/item-page'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const record = ref(null)
const lostReports = ref([])
const spots = ref([])
const myOpenDispute = ref(null)
// The person's own chat on this item when they made the claim that stands
// (from GET /api/claims/mine): you cannot dispute your own claim
const myChat = ref('')
const description = ref('')
const proofUrl = ref('')
const proofName = ref('')
const loadError = ref('')
const errorMessage = ref('')
// No answer from FoundIt: the "can't reach" panel (Try again runs load() again),
// or "Not sent" beside the button with the form still filled in
const cantReach = ref(false)
const notSent = ref(false)
// The last try got no answer in time, so the dispute may have been saved
const maybeSent = ref(false)
const isLoading = ref(true)
const isUploading = ref(false)
const isSubmitting = ref(false)

const photoUpload = isPhotoUploadEnabled()

const item = computed(() => record.value?.item || null)
const blocker = computed(
  () =>
    disputeBlocker(record.value, auth.user) ||
    (myChat.value
      ? 'You claimed this item, so you cannot dispute your own claim. If something is wrong, talk to the finder in your chat.'
      : ''),
)
const attachedReport = computed(() =>
  attachedLostReport(lostReports.value, claimedAt(record.value)),
)
const isSpecific = computed(() => description.value.trim().length >= 30)
// A returned item can still be disputed for 7 days; the dispute reopens it
const isReturned = computed(() =>
  (record.value?.timeline || []).some((entry) => entry.event === 'returned'),
)

function spotOf(id) {
  return spots.value.find((spot) => spot.id === id)
}

const foundPlace = computed(() => {
  const spot = spotOf(item.value?.trail?.[0]?.spotId)
  return spot ? `${placeName(spot)}, ${spot.floor}` : ''
})

// "SOE, LKS Library": each building on the lost report's trail, once
const lostTrail = computed(() => {
  const buildings = (attachedReport.value?.trail || [])
    .map((point) => spotOf(point.spotId)?.building)
    .filter(Boolean)
  return [...new Set(buildings)].join(', ')
})

async function load() {
  isLoading.value = true
  loadError.value = ''
  try {
    record.value = (await api.get(`/items/${route.params.id}/record`)).data
    // Only the reports the server can attach: open, and not hidden by
    // reports (a claimed or closed one would show here and then be refused)
    const [lostResponse, mineResponse, claims] = await Promise.all([
      api.get('/items', {
        params: {
          type: 'lost',
          status: 'open',
          postedBy: auth.user?.id,
          category: item.value.category,
        },
      }),
      api.get('/disputes/mine'),
      // Only to spot a claim of their own; the form still works without it,
      // and the server refuses that dispute anyway
      api
        .get('/claims/mine')
        .then((response) => response.data)
        .catch(() => []),
    ])
    const own = myLink(item.value.id, { claims })
    myChat.value = own?.kind === 'chat' ? own.to : ''
    lostReports.value = lostResponse.data.filter((report) => !report.hiddenAt)
    myOpenDispute.value =
      mineResponse.data.find(
        (dispute) => dispute.itemId === item.value.id && dispute.status === 'open',
      ) || null
    cantReach.value = false
  } catch (error) {
    cantReach.value = isConnectionError(error)
    if (!cantReach.value) loadError.value = errorText(error)
  } finally {
    isLoading.value = false
  }
  // Place names are a nice-to-have; the form works without them
  try {
    spots.value = (await api.get('/spots')).data
  } catch {
    spots.value = []
  }
}

onMounted(load)

async function chooseProof(file) {
  errorMessage.value = ''
  isUploading.value = true
  try {
    proofUrl.value = await uploadPhoto(file)
    proofName.value = file.name
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isUploading.value = false
  }
}

async function submit() {
  errorMessage.value = ''
  const triedBefore = maybeSent.value
  notSent.value = false
  maybeSent.value = false
  isSubmitting.value = true
  try {
    await api.post('/disputes', {
      itemId: item.value.id,
      description: description.value.trim(),
      proofUrl: proofUrl.value || undefined,
    })
    router.push({ path: '/disputes', query: { sent: '1' } })
  } catch (error) {
    if (isConnectionError(error)) {
      notSent.value = true
      maybeSent.value = mayHaveSent(error)
    } else if (triedBefore && error.response?.status === 409) {
      // The first try was saved; its answer just came too late
      router.push({ path: '/disputes', query: { sent: '1' } })
    } else errorMessage.value = errorText(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="ds sg-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap sg-main">
      <header class="sg-head">
        <h1 class="ds-h1">Dispute this claim</h1>
        <p v-if="item" class="ds-small ds-muted dispute-item" data-testid="dispute-item-title">
          <span class="ds-num">{{ itemCode(item.id) }}</span> · {{ item.title }}
        </p>
        <p class="ds-lead ds-muted">Tell us why it's yours. An admin compares both sides.</p>
      </header>

      <ConnectionProblem
        v-if="cantReach"
        :busy="isLoading"
        data-testid="dispute-error"
        @retry="load"
      />
      <PageSkeleton v-else-if="isLoading" kind="form" :count="3" />

      <div v-else-if="loadError" class="sg-alert" role="alert" data-testid="dispute-error">
        {{ loadError }}
      </div>

      <!-- The item cannot be disputed by this person; say why -->
      <div v-else-if="blocker" class="sg-card dispute-stop" data-testid="dispute-blocked">
        <div class="sg-card-title">
          {{ auth.isAdmin ? 'Admins decide disputes' : "You can't dispute this item" }}
        </div>
        <p class="ds-small ds-muted">{{ blocker }}</p>
        <div class="d-flex flex-wrap gap-2">
          <BaseButton
            v-if="auth.user?.suspendedAt"
            to="/appeal"
            size="sm"
            data-testid="dispute-appeal"
          >
            Appeal the suspension
          </BaseButton>
          <BaseButton
            v-else-if="myChat && !disputeBlocker(record, auth.user)"
            :to="myChat"
            size="sm"
            data-testid="dispute-own-chat"
          >
            Open your chat
          </BaseButton>
          <BaseButton :to="`/items/${item.id}/record`" variant="secondary" size="sm">
            Back to the item
          </BaseButton>
        </div>
      </div>

      <!-- They already have a dispute waiting about this item -->
      <div v-else-if="myOpenDispute" class="sg-card dispute-stop" data-testid="dispute-already">
        <div class="sg-card-title">You already disputed this claim</div>
        <p class="ds-small ds-muted">
          Sent {{ formatWhen(myOpenDispute.createdAt) }}. An admin is comparing both sides, and
          you'll see the decision and its reason on My disputes.
        </p>
        <BaseButton to="/disputes" size="sm">See my disputes</BaseButton>
      </div>

      <div v-else class="ds-arrive">
        <p class="sg-banner" role="status" data-testid="dispute-banner">
          {{ isReturned ? 'Case reopens.' : 'The handoff pauses while this is open.' }}
        </p>

        <div v-if="errorMessage" class="sg-alert" role="alert" data-testid="dispute-error">
          {{ errorMessage }}
        </div>

        <div class="sg-split">
          <div>
            <form v-if="attachedReport" data-testid="dispute-form" @submit.prevent="submit">
              <label for="dispute-description" class="sg-field-label"
                >What only the owner would know</label
              >
              <textarea
                id="dispute-description"
                v-model="description"
                class="sg-input"
                rows="4"
                maxlength="2000"
                required
                placeholder="Marks, engravings, stickers, what was inside…"
                aria-describedby="dispute-description-hint"
                data-testid="dispute-description"
              ></textarea>
              <p
                id="dispute-description-hint"
                class="sg-hint"
                :class="{ 'sg-hint-good': isSpecific }"
              >
                {{
                  isSpecific
                    ? 'Good. Specific details help the admin decide.'
                    : 'Specific details help the admin decide.'
                }}
              </p>

              <ProofDrop
                v-if="photoUpload"
                id="dispute-proof"
                testid="dispute-proof"
                :busy="isUploading"
                :file-name="proofName"
                @file="chooseProof"
              />

              <BaseButton
                type="submit"
                :disabled="isSubmitting || isUploading"
                data-testid="dispute-submit"
              >
                {{ isSubmitting ? 'Sending…' : 'Submit dispute' }}
              </BaseButton>
              <NotSentNote
                v-if="notSent"
                :busy="isSubmitting"
                :maybe-sent="maybeSent"
                @retry="submit"
              />
            </form>

            <div v-else class="sg-card" data-testid="dispute-no-report">
              <div class="sg-card-title">First, report your item as lost</div>
              <p class="ds-small ds-muted">
                A dispute needs your own lost report in the same category ({{ item.category }}). Its
                time shows the admin when you lost it. Report it, then come back to this page.
              </p>
              <!-- The lost report brings the person back here once it is posted -->
              <BaseButton
                :to="{ path: '/report/lost', query: { redirect: `/items/${item.id}/dispute` } }"
                size="sm"
                data-testid="dispute-report-lost"
                >Report it as lost</BaseButton
              >
            </div>
          </div>

          <aside>
            <h2 class="sg-field-label dispute-aside-title">Attached for you</h2>
            <div class="sg-card dispute-attached">
              <div class="sg-item">
                <img v-if="item.photoUrl" :src="item.photoUrl" alt="" class="sg-thumb" />
                <span v-else class="sg-thumb" aria-hidden="true">
                  <ItemIcon :category="item.category" :colour="mainColour(item)" :size="32" />
                </span>
                <div>
                  <div class="ds-small ds-muted">
                    Found item · <span class="ds-num">{{ itemCode(item.id) }}</span>
                  </div>
                  <div class="sg-item-title">{{ item.title }}</div>
                  <div class="ds-small ds-muted">
                    <strong v-if="foundPlace" class="dispute-strong">{{ foundPlace }}.</strong>
                    Claimed by someone else.
                  </div>
                </div>
              </div>
              <div v-if="attachedReport" class="dispute-lost" data-testid="dispute-attached">
                <div class="ds-small ds-muted">
                  Your report · <span class="ds-num">{{ lostCode(attachedReport.id) }}</span>
                </div>
                <div class="dispute-lost-title">{{ attachedReport.title }}</div>
                <div class="ds-small ds-muted">
                  Lost {{ formatWhen(attachedReport.trail?.[0]?.from) || 'recently' }}.
                  <template v-if="lostTrail">
                    Trail: <strong class="dispute-strong">{{ lostTrail }}</strong
                    >.</template
                  >
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.dispute-item {
  margin-top: var(--ds-space-2);
}

.dispute-stop {
  max-width: 36rem;
}

.dispute-stop .ds-small ds-muted {
  margin-bottom: var(--ds-space-4);
}

.dispute-aside-title {
  margin: 0 0 var(--ds-space-2);
  font-family: var(--ds-font-text);
  color: var(--ds-text-muted);
}

.dispute-attached {
  padding: 0;
}

.dispute-attached .sg-item,
.dispute-lost {
  padding: 1.25rem;
}

.dispute-lost {
  border-top: 1px solid var(--ds-border);
}

.dispute-lost-title {
  margin: 0.15rem 0;
  font-weight: var(--ds-weight-bold);
}

.dispute-strong {
  font-weight: var(--ds-weight-medium);
  color: var(--ds-text);
}
</style>
