<script setup>
// Feature 5: appealing a suspension (/appeal, decided 2026-11-03). Why the
// account was suspended (the reason an admin logged), one appeal for each
// suspension, then where it is: a tag hanging from a rail shows the three
// steps, like the tags on the Admin rack. The admin's reply shows here.
//
// A half-written appeal is never lost without a warning: going to another
// page asks first, and so does reloading or closing the tab (the browser
// words that one itself).
//
// Data: GET /api/appeals/mine and POST /api/appeals, through stores/appeal.js,
// which the suspended banner shares.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useAppealStore } from '@/stores/appeal'
import { isPhotoUploadEnabled, uploadPhoto } from '@/services/cloudinary'
import {
  appealCode,
  errorText,
  formatWhen,
  isConnectionError,
  mayHaveSent,
} from '@/utils/safeguards'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ProofDrop from '@/components/safeguards/ProofDrop.vue'
import '@/assets/safeguards.css'

const MAX_LENGTH = 1000
const LEAVE_WARNING =
  "Leave this page? Your appeal hasn't been sent, and what you wrote will be lost."

const appeal = useAppealStore()
const photoUpload = isPhotoUploadEnabled()

const loading = ref(true)
const loadError = ref('')
const message = ref('')
const proofUrl = ref('')
const proofName = ref('')
const uploading = ref(false)
const sending = ref(false)
const sendError = ref('')

const mine = computed(() => appeal.mine)
const current = computed(() => mine.value?.appeal || null)

// write: can appeal now. sent: waiting for an admin. decided: accepted or
// declined. none: nothing to appeal.
const view = computed(() => {
  if (!mine.value) return null
  if (mine.value.canAppeal) return 'write'
  if (current.value?.status === 'open') return 'sent'
  if (current.value) return 'decided'
  return 'none'
})

const isDirty = computed(
  () => view.value === 'write' && Boolean(message.value.trim() || proofUrl.value),
)

const day = (iso) => formatWhen(iso).split(', ')[0]

// The tag's three steps: done, now, or still to come
const steps = computed(() => {
  const at = { write: 1, sent: 2, decided: 3 }[view.value] || 1
  return [
    { label: view.value === 'write' ? 'Write it' : `Sent ${formatWhen(current.value?.createdAt)}` },
    { label: view.value === 'sent' ? 'An admin is reviewing it' : 'An admin reviews it' },
    { label: view.value === 'decided' ? 'Decided' : 'You see the decision here' },
  ].map((step, index) => ({
    ...step,
    state: index + 1 < at || view.value === 'decided' ? 'done' : index + 1 === at ? 'now' : '',
  }))
})

const stub = computed(() => {
  if (view.value === 'write') return 'Not sent yet'
  if (view.value === 'sent') return 'Waiting for an admin'
  return current.value?.status === 'accepted' ? 'Accepted' : 'Declined'
})

async function chooseProof(file) {
  sendError.value = ''
  uploading.value = true
  try {
    proofUrl.value = await uploadPhoto(file)
    proofName.value = file.name
  } catch (error) {
    sendError.value = error.message
  } finally {
    uploading.value = false
  }
}

async function send() {
  sendError.value = ''
  sending.value = true
  try {
    await appeal.send({ message: message.value.trim(), proofUrl: proofUrl.value || undefined })
    message.value = ''
    proofUrl.value = ''
    proofName.value = ''
    window.scrollTo?.({ top: 0 })
  } catch (error) {
    // No answer in time, or "already appealed" after such a try: the appeal may
    // have been saved, so look again. If it was, the page shows it as sent.
    if (mayHaveSent(error) || error.response?.status === 409) {
      const saved = await appeal.load({ force: true }).catch(() => null)
      if (saved && view.value === 'sent') {
        message.value = ''
        proofUrl.value = ''
        proofName.value = ''
        return
      }
    }
    sendError.value = isConnectionError(error)
      ? 'No answer from FoundIt. What you wrote is still here; try again.'
      : errorText(error)
  } finally {
    sending.value = false
  }
}

onBeforeRouteLeave(() => (isDirty.value ? window.confirm(LEAVE_WARNING) : true))

// Reloading or closing the tab: the browser shows its own "Leave site?" box
function warnBeforeUnload(event) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  try {
    await appeal.load({ force: true })
  } catch (error) {
    loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))
</script>

<template>
  <div class="ds sg-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap sg-main">
      <header class="sg-head">
        <h1 class="ds-h1" data-testid="appeal-title">
          {{ view === 'write' ? 'Appeal your suspension' : 'Your appeal' }}
        </h1>
        <p v-if="view === 'write'" class="ds-lead ds-muted">
          An admin reads it and replies on this page. You can send one appeal for each suspension.
        </p>
      </header>

      <PageSkeleton v-if="loading" kind="form" :count="3" />
      <div v-else-if="loadError" class="sg-alert" role="alert" data-testid="appeal-error">
        {{ loadError }}
      </div>

      <section v-else-if="view === 'none'" class="sg-empty" data-testid="appeal-none">
        <p>Your account isn't suspended, so there's nothing to appeal.</p>
        <BaseButton to="/feed" variant="secondary">Browse the feed</BaseButton>
      </section>

      <div v-else class="appeal ds-arrive">
        <div class="appeal__main">
          <!-- The admin's reply comes first once there is one -->
          <div
            v-if="view === 'decided'"
            class="appeal__reply"
            :class="`is-${current.status}`"
            data-testid="appeal-reply"
          >
            <span class="appeal__pill">
              {{ current.status === 'accepted' ? 'Accepted' : 'Declined' }}
              {{ day(current.decidedAt) }}
            </span>
            <p>{{ current.reply }}</p>
            <small>From the FoundIt admins</small>
          </div>

          <div v-if="mine.suspension" class="sg-card appeal__why" data-testid="appeal-reason">
            <div class="sg-label">Why you were suspended</div>
            <p>{{ mine.suspension.reason || 'No reason was recorded with this suspension.' }}</p>
            <small class="ds-small ds-muted">
              Suspended {{ formatWhen(mine.suspension.suspendedAt) }}
            </small>
          </div>

          <form v-if="view === 'write'" data-testid="appeal-form" @submit.prevent="send">
            <label for="appeal-message" class="sg-field-label">Tell the admin what happened</label>
            <textarea
              id="appeal-message"
              v-model="message"
              class="sg-input"
              rows="6"
              :maxlength="MAX_LENGTH"
              placeholder="Be specific. Dates, what was said, anything that helps them decide."
              aria-describedby="appeal-count"
              data-testid="appeal-message"
            ></textarea>
            <p id="appeal-count" class="appeal__count ds-num">
              {{ message.length }} / {{ MAX_LENGTH }}
            </p>
            <ProofDrop
              v-if="photoUpload"
              id="appeal-proof"
              testid="appeal-proof"
              :busy="uploading"
              :file-name="proofName"
              @file="chooseProof"
            />
            <div v-if="sendError" class="sg-alert" role="alert" data-testid="appeal-send-error">
              {{ sendError }}
            </div>
            <BaseButton
              type="submit"
              :disabled="sending || uploading || !message.trim()"
              :aria-busy="sending"
              data-testid="appeal-send"
            >
              {{ sending ? 'Sending…' : 'Send appeal' }}
            </BaseButton>
          </form>

          <div v-else class="appeal__sent" data-testid="appeal-sent">
            <div class="sg-label">What you wrote</div>
            <p class="appeal__quote">{{ current.message }}</p>
            <a
              v-if="current.proofUrl"
              :href="current.proofUrl"
              target="_blank"
              rel="noopener"
              class="ds-link ds-small"
              >See the photo you added</a
            >
            <BaseButton
              v-if="view === 'decided' && current.status === 'accepted'"
              to="/feed"
              class="appeal__next"
            >
              Go to the feed
            </BaseButton>
          </div>
        </div>

        <!-- Where the appeal is, on a tag like the ones on the Admin rack -->
        <aside class="appeal__hang" aria-label="Where your appeal is">
          <span class="appeal__rail" aria-hidden="true"></span>
          <span class="appeal__pin" aria-hidden="true"></span>
          <span class="appeal__string" aria-hidden="true"></span>
          <div class="appeal__tag">
            <span class="appeal__cap" aria-hidden="true"><span class="appeal__eyelet"></span></span>
            <div class="appeal__body">
              <div class="sg-label">
                Your appeal<template v-if="current"> · {{ appealCode(current.id) }}</template>
              </div>
              <ol class="appeal__steps" data-testid="appeal-steps">
                <li
                  v-for="(step, index) in steps"
                  :key="index"
                  :class="step.state && `is-${step.state}`"
                >
                  <span class="appeal__num" aria-hidden="true">{{ index + 1 }}</span>
                  {{ step.label }}
                </li>
              </ol>
              <div class="appeal__stub">{{ stub }}</div>
            </div>
          </div>
        </aside>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.appeal {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ds-space-6);
  align-items: start;
}

@media (min-width: 992px) {
  .appeal {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    gap: var(--ds-space-7);
  }
}

.appeal__main {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-5);
  min-width: 0;
}

.appeal__why p {
  margin: var(--ds-space-1) 0;
}

.appeal__count {
  margin: var(--ds-space-1) 0 var(--ds-space-3);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  text-align: right;
}

.appeal__quote {
  margin: var(--ds-space-1) 0 var(--ds-space-2);
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.appeal__next {
  margin-top: var(--ds-space-3);
}

/* The reply: green when accepted, red when declined */
.appeal__reply {
  padding: var(--ds-space-4);
  border-radius: var(--ds-radius-surface);
  background: color-mix(in srgb, var(--ds-danger) 12%, var(--ds-surface));
  overflow-wrap: anywhere;
}

.appeal__reply.is-accepted {
  background: color-mix(in srgb, var(--ds-success) 14%, var(--ds-surface));
}

.appeal__reply p {
  margin: var(--ds-space-2) 0 var(--ds-space-1);
  white-space: pre-line;
}

.appeal__reply small {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}

.appeal__pill {
  display: inline-block;
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  color: var(--ds-danger);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
}

.appeal__reply.is-accepted .appeal__pill {
  color: var(--ds-success);
}

/* ---- The tag on its rail, as on Matches and the Admin rack ---- */
.appeal__hang {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.appeal__rail {
  align-self: stretch;
  height: 3px;
  border-radius: var(--ds-radius-round);
  background: var(--ds-text-muted);
}

.appeal__pin {
  width: 0.5rem;
  height: 0.5rem;
  margin-top: -0.3rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-border-control);
}

.appeal__string {
  width: 1.5px;
  height: var(--ds-space-6);
  margin-top: -0.25rem;
  background: var(--ds-border-control);
}

.appeal__tag {
  width: 100%;
  max-width: 16rem;
}

.appeal__cap {
  position: relative;
  display: block;
  height: 1.5rem;
  background: var(--ds-border-control);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
}

.appeal__cap::before {
  content: '';
  position: absolute;
  inset: 1px 1px 0;
  background: var(--ds-surface);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
}

.appeal__eyelet {
  position: absolute;
  top: 0.35rem;
  left: 50%;
  z-index: 1;
  width: 0.875rem;
  height: 0.875rem;
  margin-left: -0.4375rem;
  border: 3px solid var(--ds-text-muted);
  border-radius: var(--ds-radius-round);
  background: var(--ds-canvas);
}

.appeal__body {
  padding: var(--ds-space-2) var(--ds-space-4) var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-top: 0;
  border-radius: 0 0 var(--ds-radius-surface) var(--ds-radius-surface);
  background: var(--ds-surface);
}

.appeal__steps {
  display: grid;
  gap: var(--ds-space-2);
  margin: var(--ds-space-2) 0 0;
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.appeal__steps li {
  display: flex;
  gap: var(--ds-space-2);
  align-items: center;
  color: var(--ds-text-muted);
}

.appeal__steps li.is-now,
.appeal__steps li.is-done {
  color: var(--ds-text);
}

.appeal__num {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-text-muted) 20%, transparent);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.is-now .appeal__num {
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.is-done .appeal__num {
  background: var(--ds-success);
  color: var(--ds-canvas);
}

.appeal__stub {
  margin-top: var(--ds-space-3);
  padding-top: var(--ds-space-2);
  border-top: 1px dashed var(--ds-border-control);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}
</style>
