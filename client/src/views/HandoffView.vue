<script setup>
// Handoff and chat (WS5, Figma section 07: V12.1 to V12.6). One page for both
// people in a claimed match, at /matches/:id/handoff (and /matches/:id, where
// the match emails link):
//   the owner   waits while the finder checks the claim, can change the plan,
//               then confirms "Yes, I have it" (V12.1, V12.3, V12.5)
//   the finder  checks the owner's detail and accepts by planning a meet-up or
//               a drop-off at a collection point, or declines; then marks it
//               handed over or dropped off (V12.2, V12.4)
// Once resolved the chat is read-only (V12.6). A declined claim shows the
// finder's reason to both people. Contact details are never shown, and neither
// person sees the other's name.
//
// Data: GET /api/claims/:matchId (the overview), GET /api/messages/:matchId,
// GET /api/spots, GET /api/handoffs/collection-points. New messages arrive by a
// Realtime ping (realtime.js), and the page also checks every 5 seconds while
// the chat is live. A finished or closed chat, or one that failed to load, is
// not checked again.
//
// In the design system's colours and type (class="ds", assets/system.css):
// the item's header, then one card with the steps above the chat.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import ChatMessage from '@/components/handoff/ChatMessage.vue'
import HandoffPlanForm from '@/components/handoff/HandoffPlanForm.vue'
import PageProblem from '@/components/handoff/PageProblem.vue'
import WalkingRoute from '@/components/handoff/WalkingRoute.vue'
import { onNewMessage } from '@/realtime'
import { useAuthStore } from '@/stores/auth'
import { useHandoffsStore } from '@/stores/handoffs'
import { mainColour } from '@/utils/design'
import { errorText, formatWhen, isConnectionError, mayHaveSent } from '@/utils/safeguards'
import { spotName } from '@/utils/spots'
import {
  autoResolveDate,
  chatIntro,
  closedByDispute,
  closedText,
  disputeForItem,
  groupMessages,
  handoffStage,
  isMine,
  lastSentAt,
  mergeMessages,
  messageMeta,
  methodLabel,
  partnerInitials,
  partnerLine,
  partnerName,
  readReported,
  stageChip,
  stageLine,
  writeReported,
} from '@/utils/handoff'

// One check every 5 seconds while you look at the page (every 20 seconds in a
// background tab). The other person's steps are checked every other round.
const CHECK_EVERY_MS = 5000
const HIDDEN_EVERY_N = 4

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const handoffs = useHandoffsStore()

const matchId = computed(() => route.params.id)
const overview = ref(null)
const messages = ref([])
const spotsById = ref(new Map())
const collectionPoints = ref([])
const loading = ref(true)
const loadError = ref('')
// No answer from FoundIt: the "can't reach" panel, whose Try again runs load() again
const cantReach = ref(false)
const actionError = ref('')
const notice = ref('')
const busy = ref(false)

const stage = computed(() => handoffStage(overview.value))
const role = computed(() => overview.value?.role)
const chip = computed(() => stageChip(stage.value, overview.value?.disputeOpen))
const handoff = computed(() => overview.value?.handoff || null)
const foundItem = computed(() => overview.value?.foundItem || null)
const chatOpen = computed(() =>
  ['checking', 'pending', 'handedOver', 'resolved'].includes(stage.value),
)
const canSend = computed(() => ['checking', 'pending', 'handedOver'].includes(stage.value))
// Worth checking again: a live chat, or a finder waiting for a claim
const live = computed(
  () => canSend.value || (stage.value === 'unclaimed' && role.value === 'finder'),
)

const closed = computed(() => closedText(overview.value?.closed, role.value))
// A claim closed by a dispute: the admin's decision, for the person who
// claimed (GET /api/disputes/on-my-claims; the finder sees it on the item page)
const dispute = ref(null)
async function loadDispute() {
  if (!closedByDispute(overview.value?.closed) || role.value !== 'owner') return
  try {
    const response = await api.get('/disputes/on-my-claims')
    dispute.value = disputeForItem(response.data, foundItem.value?.id)
  } catch {
    // The link to My disputes below still works
  }
}
const chatRows = computed(() => groupMessages(messages.value))
const planSpot = computed(() => spotsById.value.get(handoff.value?.spotId) || null)
const planPlace = computed(() => (planSpot.value ? spotName(planSpot.value) : ''))
const foundSpot = computed(() => spotsById.value.get(foundItem.value?.trail?.[0]?.spotId) || null)
// Walking directions on the campus map (Mapbox), opened from the plan
const showRoute = ref(false)

// ---------------------------------------------------------------- loading
async function loadOverview() {
  const response = await api.get(`/claims/${matchId.value}`)
  overview.value = response.data
}

// Saved messages only: one being sent has no time on the server yet
function saved(list) {
  return list.filter((message) => !message.pending && !message.failed)
}

// A message marked failed whose answer only came too late: the saved copy (same
// sender and text, saved within two minutes of it) is already in the chat
const LATE_COPY_MS = 2 * 60 * 1000
function wasSaved(failed, done) {
  return done.some(
    (message) =>
      message.senderId === failed.senderId &&
      message.text === failed.text &&
      Math.abs(new Date(message.sentAt) - new Date(failed.sentAt)) < LATE_COPY_MS,
  )
}

// Saved messages in order, then any still being sent (or failed and not saved)
function inOrder(list) {
  const done = saved(list).sort(
    (a, b) => a.sentAt.localeCompare(b.sentAt) || Number(a.id) - Number(b.id),
  )
  const waiting = list.filter(
    (message) => message.pending || (message.failed && !wasSaved(message, done)),
  )
  return [...done, ...waiting]
}

async function loadMessages({ onlyNew = false } = {}) {
  if (!chatOpen.value) return
  const after = onlyNew ? lastSentAt(saved(messages.value)) : undefined
  const response = await api.get(`/messages/${matchId.value}`, {
    params: after ? { after } : {},
  })
  messages.value = onlyNew
    ? inOrder(mergeMessages(messages.value, response.data))
    : inOrder([...response.data, ...messages.value.filter((m) => m.pending || m.failed)])
}

let stopListening = () => {}
// Set when the page closes. The page loads in several steps, so someone can
// leave before it finishes; nothing may start listening or checking after that.
let unmounted = false

async function listen() {
  stopListening()
  if (!canSend.value) return
  try {
    const response = await api.get(`/messages/${matchId.value}/channel`)
    if (unmounted) return
    stopListening = onNewMessage(response.data.channel, () => refresh())
  } catch {
    // The check every few seconds still picks up new messages
  }
}

// One round of checking: new messages, and the overview when asked. A round
// with the overview reloads the whole chat, so a message an admin removed
// loses its text on screen too (a new-only check never sees old messages).
// No alert here: you are reading this chat (App.vue's alerts skip it too).
// While one of your messages is being sent, the check waits: the saved copy
// would otherwise show next to the "Sending…" one for a moment.
const sending = ref(0)
async function refresh({ withOverview = false } = {}) {
  if (!live.value || sending.value > 0) return
  try {
    if (withOverview) {
      const couldSend = canSend.value
      await loadOverview()
      if (canSend.value && !couldSend) await listen()
    }
    await loadMessages({ onlyNew: !withOverview })
  } catch {
    // A missed check is fine; the next one tries again
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [, spotsResponse] = await Promise.all([loadOverview(), api.get('/spots')])
    spotsById.value = new Map(spotsResponse.data.map((spot) => [spot.id, spot]))
    // The owner has not claimed yet: the claim page is where that happens
    if (role.value === 'owner' && stage.value === 'unclaimed') {
      router.replace(`/matches/${matchId.value}/claim`)
      return
    }
    markClosedSeen()
    loadDispute()
    cantReach.value = false
  } catch (error) {
    cantReach.value = isConnectionError(error)
    if (!cantReach.value) loadError.value = errorText(error)
    loading.value = false
    return
  }
  // The messages are a part of the page, not all of it: if they cannot load,
  // the item, its status and why it ended still show
  try {
    await loadMessages()
    await listen()
  } catch (error) {
    actionError.value = errorText(error)
  } finally {
    loading.value = false
  }
}

// The regular check: a plain setInterval, stopped when the page closes, when
// the chat ends and when the page could not load
let timer = null
let rounds = 0

function startChecking() {
  stopChecking()
  if (unmounted) return
  timer = setInterval(() => {
    rounds += 1
    if (document.hidden && rounds % HIDDEN_EVERY_N !== 0) return
    refresh({ withOverview: rounds % 2 === 0 })
  }, CHECK_EVERY_MS)
}

function stopChecking() {
  clearInterval(timer)
  timer = null
}

watch(live, (isLive) => {
  if (isLive && !loadError.value) return
  stopChecking()
  stopListening()
})

// Coming back to the tab checks straight away instead of waiting
function onVisible() {
  if (!document.hidden) refresh()
}

// The page opened with no answer from FoundIt: load again, and start the
// regular check once it works
async function retryLoad() {
  await load()
  if (!unmounted && !cantReach.value && !loadError.value && live.value) startChecking()
}

onMounted(async () => {
  await load()
  if (unmounted) return
  if (!cantReach.value && !loadError.value && live.value) startChecking()
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  unmounted = true
  stopChecking()
  stopListening()
  document.removeEventListener('visibilitychange', onVisible)
})

// A closed chat cannot be opened, so its last news (the finder's reason) counts
// as seen once this page has shown it
function markClosedSeen() {
  const at = overview.value?.closed?.decidedAt
  if (at) handoffs.markSeen(Number(matchId.value), at)
}

// Keep the newest message in view, and count it as seen for the header's badge.
// Someone scrolled up to read older messages stays where they are, unless the
// new message is their own.
const chatList = ref(null)
const FOLLOW_WITHIN_PX = 80
watch(
  () => messages.value.length,
  async () => {
    handoffs.markSeen(Number(matchId.value), lastSentAt(saved(messages.value)))
    // Measured before the new message is drawn
    const list = chatList.value
    const nearBottom =
      !list || list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_WITHIN_PX
    const newest = messages.value[messages.value.length - 1]
    const mineNow = Boolean(newest) && isMine(newest, auth.user?.id)
    await nextTick()
    if (chatList.value && (nearBottom || mineNow)) {
      chatList.value.scrollTop = chatList.value.scrollHeight
    }
  },
)

// ---------------------------------------------------------------- actions
async function act(work) {
  busy.value = true
  actionError.value = ''
  notice.value = ''
  try {
    await work()
    // Whose turn it is may have changed, so update the header's badge
    handoffs.load({ fresh: true })
  } catch (error) {
    actionError.value = errorText(error)
    // No answer, or an answer that says it was already done (a step that went
    // through but answered too late): load the handoff again so the page shows
    // where things stand instead of offering the same step again
    const status = error.response?.status
    const alreadyDone =
      status === 409 || (status === 400 && /already/i.test(error.response?.data?.error || ''))
    if (mayHaveSent(error) || alreadyDone) {
      loadOverview()
        .then(() => handoffs.load({ fresh: true }))
        .catch(() => {})
    }
  } finally {
    busy.value = false
  }
}

// The finder's check (V12.2): accept opens the plan, decline asks first
const accepting = ref(false)
const askingDecline = ref(false)
const declineReason = ref('')
const plan = ref({ method: 'meetup', spotId: '' })

async function loadCollectionPoints() {
  if (collectionPoints.value.length > 0) return
  const near = foundItem.value?.trail?.[0]?.spotId
  const response = await api.get('/handoffs/collection-points', {
    params: near ? { near } : {},
  })
  collectionPoints.value = response.data
}

async function startAccept() {
  await act(async () => {
    await loadCollectionPoints()
    if (!plan.value.spotId && collectionPoints.value[0]) {
      plan.value.spotId = collectionPoints.value[0].id
    }
    accepting.value = true
  })
}

function acceptClaim() {
  return act(async () => {
    await api.post('/handoffs', {
      matchId: Number(matchId.value),
      method: plan.value.method,
      spotId: Number(plan.value.spotId),
    })
    accepting.value = false
    await loadOverview()
  })
}

// The owner reads this reason on the closed chat
function declineClaim() {
  const reason = declineReason.value.trim()
  if (!reason) {
    actionError.value = 'Say why the details do not fit, so the owner knows.'
    return
  }
  return act(async () => {
    const response = await api.post(`/claims/${matchId.value}/decline`, { reason })
    overview.value = response.data
    askingDecline.value = false
    declineReason.value = ''
    markClosedSeen()
  })
}

// Either person changes the plan while it is still pending (V12.3)
const changingPlan = ref(false)

async function startChangePlan() {
  await act(async () => {
    await loadCollectionPoints()
    plan.value = { method: handoff.value.method, spotId: handoff.value.spotId }
    changingPlan.value = true
  })
}

function savePlan() {
  return act(async () => {
    await api.patch(`/handoffs/${handoff.value.id}`, {
      method: plan.value.method,
      spotId: Number(plan.value.spotId),
    })
    changingPlan.value = false
    await loadOverview()
  })
}

// The finder marks it handed over or dropped off (V12.4)
const handedMethod = ref('')
// Follows the plan, so a change the other person made is not undone here
watch(
  () => handoff.value?.method,
  (method) => {
    if (method) handedMethod.value = method
  },
  { immediate: true },
)

// How it went back is sent with the step itself, so a failed step never leaves
// the plan changed
function markHandedOver() {
  return act(async () => {
    const method = handedMethod.value || handoff.value.method
    await api.post(`/handoffs/${handoff.value.id}/handed-over`, { method })
    await loadOverview()
  })
}

// The owner confirms (V12.3, V12.5)
function confirmHaveIt() {
  return act(async () => {
    await api.post(`/handoffs/${handoff.value.id}/confirm`)
    await loadOverview()
    await loadMessages()
  })
}

// "Not yours or not there?" The person who claimed cannot open a dispute on
// their own claim, so this reports the post to an admin instead
const reportingPost = ref(false)
const postReason = ref('')

function reportPost() {
  return act(async () => {
    await api.post('/reports', {
      itemId: foundItem.value.id,
      reason: postReason.value.trim() || 'The owner says the item was not there or is not theirs',
    })
    reportingPost.value = false
    postReason.value = ''
    notice.value = 'Thanks. An admin will look into it and contact you through your SMU email.'
  })
}

// Chat. A message shows straight away as "Sending…" and turns into the saved
// one when the server answers, so typing never waits for the network.
const draft = ref('')
// Messages you reported, remembered in this browser so the mark survives a reload
const reportedIds = ref(readReported(auth.user?.id))
let tempCount = 0

async function sendMessage(retry = null) {
  const text = retry ? retry.text : draft.value.trim()
  if (!text) return
  actionError.value = ''
  const temp = {
    id: `temp-${(tempCount += 1)}`,
    senderId: auth.user?.id,
    text,
    sentAt: new Date().toISOString(),
    pending: true,
  }
  messages.value = [...messages.value.filter((message) => message !== retry), temp]
  if (!retry) draft.value = ''
  sending.value += 1
  try {
    const response = await api.post(`/messages/${matchId.value}`, { text })
    const others = messages.value.filter((message) => message.id !== temp.id)
    messages.value = inOrder(mergeMessages(others, [response.data]))
  } catch (error) {
    messages.value = messages.value.map((message) =>
      message.id === temp.id ? { ...message, pending: false, failed: true } : message,
    )
    actionError.value = errorText(error)
    // No answer in time: it may have been saved. Look now; if it was, the
    // failed copy disappears (inOrder). Retry is safe either way: the server
    // answers a repeat with the saved message.
    if (mayHaveSent(error)) {
      loadMessages({ onlyNew: true })
        .then(() => {
          if (!messages.value.some((message) => message.id === temp.id)) actionError.value = ''
        })
        .catch(() => {})
    }
  } finally {
    sending.value -= 1
  }
}

// A second report of the same message answers 409: it was already reported
// (for example before a reload), so show it as reported
function reportMessage(message) {
  return act(async () => {
    try {
      await api.post('/reports', {
        messageId: message.id,
        reason: 'Reported from the handoff chat',
      })
    } catch (error) {
      if (error.response?.status !== 409) throw error
    }
    reportedIds.value = new Set([...reportedIds.value, message.id])
    writeReported(auth.user?.id, reportedIds.value)
  })
}
</script>

<template>
  <div class="ds handoff-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap handoff">
      <ConnectionProblem
        v-if="cantReach"
        :busy="loading"
        data-testid="handoff-error"
        @retry="retryLoad"
      />
      <PageSkeleton v-else-if="loading" kind="detail" label="Loading the handoff…" />
      <PageProblem
        v-else-if="loadError"
        :message="loadError"
        :links="[
          { to: '/returns', label: 'Your returns' },
          { to: '/matches', label: 'Your matches' },
        ]"
        data-testid="handoff-error"
      />

      <div v-else-if="overview" class="handoff__wrap ds-arrive">
        <nav class="handoff-back" aria-label="Back">
          <RouterLink to="/returns" class="ds-link handoff-back__link" data-testid="handoff-back">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Your returns
          </RouterLink>
          <RouterLink :to="`/items/${foundItem.id}/record`" class="ds-link handoff-back__link">
            The item page
          </RouterLink>
        </nav>

        <!-- The item, who you are talking to, and where it is up to -->
        <header class="handoff-head">
          <div class="handoff-head__picture">
            <img v-if="foundItem.photoUrl" :src="foundItem.photoUrl" :alt="foundItem.title" />
            <ItemIcon
              v-else
              :category="foundItem.category"
              :colour="mainColour(foundItem)"
              :size="32"
            />
          </div>
          <div class="handoff-head__text">
            <h1 id="handoff-title" class="ds-h2 handoff-head__title" data-testid="handoff-title">
              {{ foundItem.title }}, with {{ partnerName(role).toLowerCase() }}
            </h1>
            <p class="handoff-head__line" data-testid="handoff-line">{{ stageLine(overview) }}</p>
          </div>
          <span class="handoff-status" :class="`is-${chip.tone}`" data-testid="handoff-chip">
            {{ chip.label }}
          </span>
        </header>

        <section class="handoff-card" aria-label="Chat">
          <header class="handoff-chat__head">
            <span class="handoff-chat__avatar" aria-hidden="true">
              {{ partnerInitials(role) }}
            </span>
            <div class="handoff-chat__who">
              <p class="handoff-chat__name">{{ partnerName(role) }}</p>
              <p class="handoff-chat__line" data-testid="partner-line">
                {{ partnerLine(role, foundItem.title) }}
              </p>
            </div>
            <p class="handoff-chat__private">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
              </svg>
              Contact details hidden
            </p>
          </header>

          <p
            v-if="actionError"
            class="handoff-note is-danger"
            role="alert"
            data-testid="handoff-action-error"
          >
            {{ actionError }}
          </p>
          <p v-if="notice" class="handoff-note is-warning" role="status">{{ notice }}</p>

          <p
            v-if="overview.disputeOpen && stage !== 'resolved'"
            class="handoff-note is-warning"
            role="status"
            data-testid="handoff-paused"
          >
            Someone has said this item is theirs. The handoff is paused until an admin decides.
          </p>

          <!-- The finder checks the claim (V12.2) -->
          <div
            v-if="stage === 'checking' && role === 'finder'"
            class="handoff-step"
            data-testid="check-claim"
          >
            <h2 class="ds-h3 handoff-step__title">Do their details fit the item?</h2>
            <blockquote class="handoff-quote">
              <p class="handoff-quote__label">The owner’s detail</p>
              <p class="handoff-quote__text">{{ overview.claim.detail }}</p>
            </blockquote>

            <HandoffPlanForm
              v-if="accepting"
              v-model="plan"
              name="plan"
              submit="Accept the claim"
              hint="Nearest to where it was found first."
              :places="collectionPoints"
              :busy="busy"
              @submit="acceptClaim"
              @cancel="accepting = false"
            />

            <form
              v-else-if="askingDecline"
              class="handoff-form"
              data-testid="decline-form"
              @submit.prevent="declineClaim"
            >
              <div class="handoff-field">
                <label for="decline-reason" class="handoff-label">Why don’t the details fit?</label>
                <textarea
                  id="decline-reason"
                  v-model="declineReason"
                  class="handoff-input"
                  rows="2"
                  maxlength="300"
                  required
                  placeholder="For example: there is no sticker on this one"
                  aria-describedby="decline-reason-hint"
                  data-testid="decline-reason"
                ></textarea>
                <p id="decline-reason-hint" class="handoff-hint">
                  The owner sees this. The chat closes and the item goes back on the feed.
                </p>
              </div>
              <div class="handoff-actions">
                <BaseButton
                  type="submit"
                  variant="secondary"
                  :disabled="busy || !declineReason.trim()"
                  data-testid="decline-confirm"
                >
                  Decline the claim
                </BaseButton>
                <BaseButton variant="link" @click="askingDecline = false">Keep it</BaseButton>
              </div>
            </form>

            <div v-else class="handoff-actions">
              <BaseButton
                :disabled="busy || overview.disputeOpen"
                data-testid="accept-claim"
                @click="startAccept"
              >
                Yes, it fits
              </BaseButton>
              <BaseButton
                variant="secondary"
                :disabled="busy || overview.disputeOpen"
                data-testid="decline-claim"
                @click="askingDecline = true"
              >
                Doesn’t fit · decline
              </BaseButton>
            </div>
          </div>

          <!-- The owner waits for the finder's check (V12.1) -->
          <p
            v-if="stage === 'checking' && role === 'owner'"
            class="handoff-note is-warning"
            data-testid="waiting-check"
          >
            The finder is checking your detail: “{{ overview.claim.detail }}”. Say hello below.
          </p>

          <!-- The plan, while it is pending or handed over (V12.3) -->
          <div
            v-if="(stage === 'pending' || stage === 'handedOver') && handoff"
            class="handoff-step is-plain"
            data-testid="handoff-plan"
          >
            <HandoffPlanForm
              v-if="changingPlan"
              v-model="plan"
              name="edit"
              submit="Save the plan"
              :places="collectionPoints"
              :busy="busy"
              @submit="savePlan"
              @cancel="changingPlan = false"
            />
            <template v-else>
              <p class="handoff-plan">
                <strong>{{ methodLabel(handoff.method) }}</strong>
                <template v-if="planPlace"> at {{ planPlace }}</template>
              </p>
              <div class="handoff-links">
                <button
                  v-if="planSpot"
                  type="button"
                  class="ds-link handoff-textbtn"
                  :aria-expanded="showRoute"
                  data-testid="walking-directions"
                  @click="showRoute = !showRoute"
                >
                  {{ showRoute ? 'Hide walking directions' : 'Walking directions' }}
                </button>
                <button
                  v-if="stage === 'pending'"
                  type="button"
                  class="ds-link handoff-textbtn"
                  data-testid="change-plan"
                  @click="startChangePlan"
                >
                  Change the plan
                </button>
              </div>
              <WalkingRoute
                v-if="showRoute && planSpot"
                :from="foundSpot"
                :to="planSpot"
                :spots="[...spotsById.values()]"
              />
            </template>
          </div>

          <!-- The finder marks it handed over (V12.4), but not while a dispute pauses it -->
          <div
            v-if="stage === 'pending' && role === 'finder' && !overview.disputeOpen"
            class="handoff-step"
            data-testid="mark-handed-over"
          >
            <h2 class="ds-h3 handoff-step__title">Handed it over?</h2>
            <p class="handoff-step__text">Let the owner know once it’s out of your hands.</p>
            <fieldset class="handoff-options">
              <legend class="visually-hidden">How did it go back?</legend>
              <label class="handoff-option" for="handed-meetup">
                <input
                  id="handed-meetup"
                  v-model="handedMethod"
                  type="radio"
                  value="meetup"
                  name="handed-method"
                />
                <span>I met up with the owner</span>
              </label>
              <label class="handoff-option" for="handed-drop-off">
                <input
                  id="handed-drop-off"
                  v-model="handedMethod"
                  type="radio"
                  value="drop-off"
                  name="handed-method"
                />
                <span>I dropped it off</span>
              </label>
            </fieldset>
            <BaseButton :disabled="busy" data-testid="handed-over" @click="markHandedOver">
              {{ handedMethod === 'drop-off' ? 'Mark as dropped off' : 'Mark as handed over' }}
            </BaseButton>
          </div>

          <p
            v-if="stage === 'handedOver' && role === 'finder'"
            class="handoff-note is-warning"
            data-testid="waiting-owner"
          >
            Thanks! Waiting for the owner to confirm they have it. If they don’t, it resolves itself
            on {{ autoResolveDate(handoff) }}, unless a dispute is open.
          </p>

          <!-- The owner confirms (V12.3, V12.5) -->
          <div
            v-if="
              (stage === 'pending' || stage === 'handedOver') &&
              role === 'owner' &&
              !overview.disputeOpen
            "
            class="handoff-step"
            data-testid="got-it-back"
          >
            <h2 class="ds-h3 handoff-step__title">Got it back?</h2>
            <p class="handoff-step__text">
              <template v-if="stage === 'handedOver'">
                If you don’t confirm, it resolves itself on {{ autoResolveDate(handoff) }} (in 7
                days), unless a dispute is open.
              </template>
              <template v-else>
                Tap this once it’s in your hands. Once the finder hands it over, it resolves itself
                after 7 days if you don’t confirm.
              </template>
            </p>
            <BaseButton :disabled="busy" data-testid="confirm-have-it" @click="confirmHaveIt">
              Yes, I have it
            </BaseButton>

            <form v-if="reportingPost" class="handoff-form" @submit.prevent="reportPost">
              <div class="handoff-field">
                <label for="post-reason" class="handoff-label">What went wrong?</label>
                <textarea
                  id="post-reason"
                  v-model="postReason"
                  class="handoff-input"
                  rows="2"
                  maxlength="500"
                  placeholder="For example: it was not at the collection point"
                ></textarea>
              </div>
              <div class="handoff-actions">
                <BaseButton type="submit" variant="secondary" size="sm" :disabled="busy">
                  Report to an admin
                </BaseButton>
                <BaseButton variant="link" size="sm" @click="reportingPost = false">
                  Cancel
                </BaseButton>
              </div>
            </form>
            <button
              v-else-if="stage === 'handedOver'"
              type="button"
              class="ds-link handoff-textbtn is-danger"
              data-testid="not-there"
              @click="reportingPost = true"
            >
              Not yours or not there? Tell an admin
            </button>
          </div>

          <!-- The chat itself. Only this list is announced to screen readers. -->
          <ol
            v-if="chatOpen"
            ref="chatList"
            class="handoff-chat__messages"
            aria-live="polite"
            data-testid="chat"
          >
            <li class="handoff-chat__system" data-testid="chat-intro">
              <span>{{ chatIntro(role, foundItem.title) }}</span>
            </li>
            <template v-for="row in chatRows" :key="row.message.id">
              <li v-if="row.day" class="handoff-chat__day" data-testid="chat-day">
                {{ row.day }}
              </li>
              <ChatMessage
                :message="row.message"
                :mine="isMine(row.message, auth.user?.id)"
                :meta="messageMeta(row.message, auth.user?.id, role)"
                :reported="reportedIds.has(row.message.id)"
                :show-meta="row.showMeta"
                :grouped="row.grouped"
                @report="reportMessage(row.message)"
                @retry="sendMessage(row.message)"
              />
            </template>
            <li v-if="stage === 'resolved' && handoff?.completedAt" class="handoff-chat__system">
              <span>Marked as back with its owner · {{ formatWhen(handoff.completedAt) }}</span>
            </li>
          </ol>

          <form v-if="canSend" class="handoff__composer" @submit.prevent="sendMessage()">
            <label for="chat-draft" class="visually-hidden">
              Message {{ partnerName(role).toLowerCase() }}
            </label>
            <input
              id="chat-draft"
              v-model="draft"
              class="handoff__composer-input"
              type="text"
              maxlength="1000"
              autocomplete="off"
              :placeholder="`Message ${partnerName(role).toLowerCase()}`"
              data-testid="chat-input"
            />
            <BaseButton type="submit" :disabled="!draft.trim()" data-testid="chat-send">
              Send
            </BaseButton>
          </form>

          <!-- Resolved (V12.6) -->
          <div
            v-if="stage === 'resolved'"
            class="handoff-step is-success"
            data-testid="handoff-resolved"
          >
            <h2 class="ds-h3 handoff-step__title">This handoff is resolved</h2>
            <p class="handoff-step__text">
              The chat is now read-only. The item page keeps the full history.
            </p>
            <div class="handoff-links">
              <RouterLink :to="`/items/${foundItem.id}/record`" class="ds-link">
                View the item
              </RouterLink>
              <RouterLink
                :to="`/matches/${matchId}/resolved`"
                class="ds-link"
                data-testid="see-summary"
              >
                See how it went
              </RouterLink>
            </div>
          </div>

          <!-- Declined, or moved to someone else: why the chat closed -->
          <div v-if="stage === 'closed'" class="handoff-step" data-testid="handoff-closed">
            <h2 class="ds-h3 handoff-step__title">{{ closed.title }}</h2>
            <blockquote
              v-if="overview.closed?.reason"
              class="handoff-quote"
              data-testid="closed-reason"
            >
              <p class="handoff-quote__label">The finder’s reason</p>
              <p class="handoff-quote__text">{{ overview.closed.reason }}</p>
            </blockquote>
            <blockquote
              v-if="closedByDispute(overview.closed) && dispute?.decisionReason"
              class="handoff-quote"
              data-testid="closed-dispute-reason"
            >
              <p class="handoff-quote__label">The admin’s reason</p>
              <p class="handoff-quote__text">{{ dispute.decisionReason }}</p>
            </blockquote>
            <p
              v-if="closedByDispute(overview.closed) && dispute?.returnBy"
              class="handoff-note is-warning"
              data-testid="closed-return-by"
            >
              Please bring the item to a collection point by
              {{ formatWhen(dispute.returnBy) }}.
            </p>
            <p class="handoff-step__text">{{ closed.body }}</p>
            <div class="handoff-links">
              <RouterLink
                v-if="closedByDispute(overview.closed)"
                :to="role === 'owner' ? '/disputes' : `/items/${foundItem.id}/record`"
                class="ds-link"
                data-testid="closed-see-dispute"
              >
                See the dispute
              </RouterLink>
              <RouterLink v-if="role === 'owner'" to="/matches" class="ds-link">
                See your matches
              </RouterLink>
              <RouterLink v-else :to="`/items/${foundItem.id}/record`" class="ds-link">
                View the item
              </RouterLink>
              <RouterLink to="/returns" class="ds-link">Your returns</RouterLink>
            </div>
          </div>

          <p
            v-if="stage === 'unclaimed' && role === 'finder'"
            class="handoff-note is-warning"
            data-testid="handoff-unclaimed"
          >
            This might be someone’s lost item. The chat opens here once they claim it.
          </p>
        </section>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.handoff-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.handoff {
  flex: 1;
  padding-top: var(--ds-space-4);
  /* Clear of the iPhone's home bar */
  padding-bottom: max(var(--ds-space-8), env(safe-area-inset-bottom));
}

/* One column, centred */
.handoff__wrap {
  max-width: 54rem;
  margin-inline: auto;
}

/* ---- Back links ---- */
.handoff-back {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--ds-space-5);
}

.handoff-back__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  min-height: var(--ds-control-h);
  font-size: var(--ds-size-small);
}

.handoff-back__link svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- The item's header: picture, title and stage, status ---- */
.handoff-head {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr);
  grid-template-areas:
    'picture text'
    'picture status';
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-4);
  margin: var(--ds-space-2) 0 var(--ds-space-5);
}

.handoff-head__picture {
  grid-area: picture;
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.handoff-head__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.handoff-head__text {
  grid-area: text;
  min-width: 0;
}

.handoff-head__title {
  margin: 0;
  overflow-wrap: anywhere;
}

.handoff-head__line {
  margin: var(--ds-space-1) 0 0;
  color: var(--ds-text-muted);
}

/* The stage in words: navy while under way, green once done, red while
   paused, muted once closed */
.handoff-status {
  grid-area: status;
  justify-self: start;
  color: var(--ds-action);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
}

.handoff-status.is-green {
  color: var(--ds-success);
}

.handoff-status.is-red {
  color: var(--ds-danger);
}

.handoff-status.is-grey {
  color: var(--ds-text-muted);
}

/* ---- The card: the chat's header, the steps, the chat ---- */
.handoff-card {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.handoff-chat__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2) var(--ds-space-3);
  padding-bottom: var(--ds-space-4);
  border-bottom: 1px solid var(--ds-border);
}

.handoff-chat__avatar {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-action-wash);
  color: var(--ds-action);
  font-weight: var(--ds-weight-bold);
}

.handoff-chat__who {
  flex: 1;
  min-width: 0;
}

.handoff-chat__name {
  margin: 0;
  font-weight: var(--ds-weight-bold);
}

.handoff-chat__line {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.handoff-chat__private {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  margin: 0;
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
}

/* Phones: under the name, lined up with it, so the name keeps its width */
@media (max-width: 575.98px) {
  .handoff-chat__who {
    flex-basis: calc(100% - 2.75rem - var(--ds-space-3));
  }

  .handoff-chat__private {
    margin-left: calc(2.75rem + var(--ds-space-3));
  }
}

.handoff-chat__private svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linejoin: round;
}

/* A warning, an error or a thank-you, as one line */
.handoff-note {
  margin: 0;
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.handoff-note.is-warning {
  background: color-mix(in srgb, var(--ds-warning) 16%, var(--ds-surface));
}

.handoff-note.is-danger {
  background: color-mix(in srgb, var(--ds-danger) 12%, var(--ds-surface));
  color: var(--ds-danger);
  font-weight: var(--ds-weight-medium);
}

/* A step to take: a bordered panel inside the card */
.handoff-step {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
}

.handoff-step.is-plain {
  border-color: var(--ds-border);
}

.handoff-step.is-success {
  border-color: transparent;
  background: color-mix(in srgb, var(--ds-success) 12%, var(--ds-surface));
}

.handoff-step.is-success .handoff-step__title {
  color: var(--ds-success);
}

.handoff-step__title {
  margin: 0;
}

.handoff-step__text {
  margin: 0;
  color: var(--ds-text-muted);
}

.handoff-plan {
  margin: 0;
}

/* A quote from the other person, set apart by a sunken panel */
.handoff-quote {
  align-self: stretch;
  margin: 0;
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
}

.handoff-quote__label {
  margin: 0 0 var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.handoff-quote__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---- Forms ---- */
.handoff-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
  align-self: stretch;
}

.handoff-field {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.handoff-label {
  font-weight: var(--ds-weight-medium);
}

.handoff-input {
  width: 100%;
  padding: var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font: inherit;
  resize: vertical;
}

.handoff-input::placeholder {
  color: var(--ds-text-muted);
}

.handoff-input:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 1px;
  border-color: var(--ds-action);
}

.handoff-hint {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.handoff-actions,
.handoff-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-3) var(--ds-space-5);
}

.handoff-links .ds-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--ds-control-h);
}

/* A link that does something on this page: looks like a link, is a button */
.handoff-textbtn {
  min-height: var(--ds-control-h);
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  cursor: pointer;
}

.handoff-textbtn.is-danger {
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
}

/* Met up or dropped off: two radio boxes side by side */
.handoff-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--ds-space-2);
  align-self: stretch;
  margin: 0;
  padding: 0;
  border: 0;
}

.handoff-option {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  cursor: pointer;
  transition:
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.handoff-option:hover {
  background: var(--ds-surface-sunken);
}

.handoff-option:has(input:checked) {
  border-color: var(--ds-action);
  background: var(--ds-action-wash);
  font-weight: var(--ds-weight-medium);
}

.handoff-option:has(input:focus-visible) {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
}

.handoff-option input {
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
}

/* ---- The chat ---- */
.handoff-chat__messages {
  max-height: 28rem;
  margin: 0;
  padding: 0 var(--ds-space-1) 0 0;
  overflow-y: auto;
  list-style: none;
}

.handoff-chat__system {
  display: flex;
  justify-content: center;
  margin-bottom: var(--ds-space-4);
}

.handoff-chat__system span {
  max-width: 32rem;
  padding: var(--ds-space-2) var(--ds-space-4);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  text-align: center;
}

/* "Today", with a rule either side */
.handoff-chat__day {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  margin: var(--ds-space-4) 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}

.handoff-chat__day::before,
.handoff-chat__day::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--ds-border);
}

/* The send box: a sunken bar with the input and Send */
.handoff__composer {
  display: flex;
  gap: var(--ds-space-2);
  padding: var(--ds-space-2);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
}

.handoff__composer-input {
  flex: 1;
  min-width: 0;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-3);
  border: 0;
  border-radius: var(--ds-radius-control);
  background: transparent;
  color: var(--ds-text);
  font: inherit;
}

.handoff__composer-input::placeholder {
  color: var(--ds-text-muted);
}

.handoff__composer-input:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 0;
}

@media (min-width: 768px) {
  .handoff-head {
    grid-template-columns: 4rem minmax(0, 1fr) auto;
    grid-template-areas: 'picture text status';
    gap: var(--ds-space-5);
  }

  .handoff-head__picture {
    width: 4rem;
    height: 4rem;
  }

  .handoff-card {
    padding: var(--ds-space-5);
  }
}
</style>
