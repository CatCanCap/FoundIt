<script setup>
// Feature 5c, one report: the reported message with the messages around it
// (or the reported post), then dismiss, warn, remove or suspend. There is no
// v3 frame for this page, so it follows the Admin case pages (V17): the case
// card on the left, the work on the right.
//
// Each action has its own step: the admin picks one, reads what it does,
// gives a reason (every action but dismissing needs one, and all go in the
// action log), then confirms. So one shared reason box can never send the
// wrong action. Once a report is decided, what was done is shown first. An
// admin may still take a further action on it (for example remove the
// message, then suspend the sender), but never one already taken, and
// nothing after a dismissal.
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import PhotoViewer from '@/components/safeguards/PhotoViewer.vue'
import { itemDigits, mainColour } from '@/utils/design'
import StatusPill from '@/components/ui/StatusPill.vue'
import LockNote from '@/components/safeguards/LockNote.vue'
import PersonHistory from '@/components/safeguards/PersonHistory.vue'
import {
  ACTION_LABELS,
  formatWhen,
  errorText,
  queuePath,
  reportCode,
  reportActionWords,
} from '@/utils/safeguards'
import '@/assets/safeguards.css'
import '@/assets/admin.css'

const route = useRoute()
const viewer = ref(null)

const detail = ref(null)
const reason = ref('')
const errorMessage = ref('')
const actionError = ref('')
const doneMessage = ref('')
const isLoading = ref(true)
const isSaving = ref(false)
// The action the admin is about to take ('warn', 'remove', ...), or ''
const chosen = ref('')
// On a decided report, the further actions stay folded away until asked for
const showMore = ref(false)
const panel = ref(null)
// Back to the Admin list the admin came from, with its tab, search and page
const queueLink = queuePath(window.history.state?.back, '/admin?tab=reports')

const report = computed(() => detail.value?.report)
const author = computed(() => detail.value?.author)
const isMessage = computed(() => report.value?.kind === 'message')
const thing = computed(() => (isMessage.value ? 'message' : 'post'))
const code = computed(() => reportCode(route.params.id))
// What admins already did about this report, oldest first
const taken = computed(() => detail.value?.actions || [])
const wasTaken = (action) => taken.value.some((entry) => entry.action === action)

// Already removed: no point offering "Remove" again
const isRemoved = computed(
  () =>
    wasTaken('remove_message') ||
    wasTaken('remove_item') ||
    (isMessage.value
      ? Boolean(detail.value?.message?.removedAt)
      : detail.value?.item?.status === 'removed'),
)

// The actions that still make sense, in the order they are offered
const choices = computed(() => {
  if (!report.value || report.value.status === 'dismissed') return []
  const list = []
  if (report.value.status === 'open') list.push('dismiss')
  if (!wasTaken('warn_user')) list.push('warn')
  if (!isRemoved.value) list.push('remove')
  list.push(author.value?.suspendedAt ? 'unsuspend' : 'suspend')
  return list
})
const words = (action) =>
  reportActionWords(action, { name: author.value?.name || 'this person', thing: thing.value })
const DANGER = ['remove', 'suspend']

// The pill on the case card, in the design system's words and colours
const PILLS = {
  open: { state: 'open', label: 'Waiting' },
  actioned: { state: 'claimed', label: 'Action taken' },
  dismissed: { state: 'archived', label: 'Dismissed' },
}

const DONE = {
  dismiss: 'Report dismissed.',
  warn: 'Warning logged.',
  remove: 'Removed.',
  suspend: 'Account suspended.',
  unsuspend: 'Suspension lifted.',
}

async function load() {
  try {
    detail.value = (await api.get(`/admin/reports/${route.params.id}`)).data
  } catch (error) {
    errorMessage.value = errorText(error)
  }
}

onMounted(async () => {
  await load()
  isLoading.value = false
})

// Only the two people in a chat can report it, so the other sender is the
// person who reported it (named on this page already)
function senderName(senderId) {
  if (senderId === author.value?.id) return author.value.name
  if (senderId === detail.value?.reportedBy?.id) return detail.value.reportedBy.name
  return 'The other person'
}

// Step 1: pick an action, then read what it does and give a reason
async function choose(action) {
  chosen.value = action
  reason.value = ''
  actionError.value = ''
  doneMessage.value = ''
  await nextTick()
  panel.value?.focus()
}

function cancel() {
  chosen.value = ''
  actionError.value = ''
}

// Step 2: "Yes, …" saves it
async function confirm() {
  const action = chosen.value
  actionError.value = ''
  if (words(action).needsReason && !reason.value.trim()) {
    actionError.value = 'Give a reason first. It goes in the action log.'
    return
  }
  isSaving.value = true
  try {
    const body = { reason: reason.value.trim() || undefined }
    if (action === 'unsuspend') {
      await api.post(`/admin/users/${author.value.id}/unsuspend`, body)
    } else {
      await api.post(`/admin/reports/${route.params.id}/${action}`, body)
    }
    doneMessage.value = DONE[action]
    chosen.value = ''
    showMore.value = false
    reason.value = ''
    await load()
  } catch (error) {
    actionError.value = errorText(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="ds report-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap report-wrap">
      <div v-if="errorMessage" class="sg-alert" role="alert" data-testid="report-error">
        {{ errorMessage }}
      </div>
      <PageSkeleton v-if="isLoading" kind="detail" label="Loading the report…" />
      <p v-else-if="!detail" class="mb-0">
        <BaseButton :to="queueLink" variant="secondary">Back to the reports</BaseButton>
      </p>

      <div v-if="detail" class="report ds-arrive">
        <!-- Left: what was reported, who wrote it, and who reported it -->
        <aside class="report-side">
          <span class="a-rail" aria-hidden="true"></span>
          <span class="a-pin" aria-hidden="true"></span>
          <span class="a-string report-string" aria-hidden="true"></span>
          <div class="a-tag">
            <span class="a-tag__cap" aria-hidden="true"><span class="a-tag__eyelet"></span></span>
            <div class="a-tag__body">
              <span class="a-tag__pic" aria-hidden="true">
                <img
                  v-if="!isMessage && detail.item?.photoUrl"
                  :src="detail.item.photoUrl"
                  alt=""
                />
                <ItemIcon
                  v-else-if="!isMessage"
                  :category="detail.item?.category"
                  :colour="mainColour(detail.item)"
                  :size="64"
                />
                <svg v-else width="44" height="44" viewBox="0 0 24 24">
                  <path
                    d="M4 5h16v11H9l-5 4z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <span class="a-tag__title">{{ code }}</span>
              <div v-if="isRemoved" class="report-state" data-testid="report-removed">
                {{ isMessage ? 'Message removed' : 'Post removed' }}
              </div>
              <div v-else-if="detail.item?.hiddenAt" class="report-state">
                Hidden after 3 reports
              </div>
            </div>
          </div>

          <div class="a-record report-people" data-testid="report-people">
            <div class="a-record__one">
              <span class="a-who">{{ author?.name }} <small>wrote it</small></span>
              <a :href="`mailto:${author?.email}`" class="a-record__mail">{{ author?.email }}</a>
              <span
                v-if="author?.suspendedAt"
                class="report-suspended"
                data-testid="report-suspended"
                >Suspended</span
              >
              <PersonHistory :history="author?.history" data-testid="history-author" />
            </div>
            <div class="a-record__one">
              <span class="a-who">{{ detail.reportedBy?.name }} <small>reported it</small></span>
              <a :href="`mailto:${detail.reportedBy?.email}`" class="a-record__mail">{{
                detail.reportedBy?.email
              }}</a>
              <PersonHistory :history="detail.reportedBy?.history" data-testid="history-reporter" />
            </div>
          </div>
        </aside>

        <!-- Right: the report itself, then what to do about it -->
        <section class="report-main">
          <nav aria-label="Breadcrumb">
            <ol class="a-crumbs">
              <li><RouterLink to="/admin">Admin</RouterLink></li>
              <li><RouterLink :to="queueLink">Reported posts</RouterLink></li>
              <li>
                <a href="#" aria-current="page" @click.prevent>{{ code }}</a>
              </li>
            </ol>
          </nav>
          <h1 class="ds-h1 report-title" data-testid="report-title">
            {{ isMessage ? 'Chat message' : detail.item?.title }}
          </h1>
          <p class="report-sub">
            <StatusPill :state="PILLS[report.status].state" data-testid="report-status">{{
              PILLS[report.status].label
            }}</StatusPill>
            Reported {{ formatWhen(report.createdAt) }}
          </p>
          <h2 class="visually-hidden">Review the report</h2>

          <div class="report-reason">
            <h3 class="a-h">Reason given</h3>
            <p class="report-quote">“{{ report.reason }}”</p>
          </div>

          <template v-if="isMessage">
            <LockNote>
              Visible because this message was reported. The reported one is outlined.
            </LockNote>
            <div class="report-context" data-testid="report-context">
              <h3 class="a-h">The message, with the ones around it</h3>
              <div class="a-log">
                <template v-for="message in detail.context" :key="message.id">
                  <div class="a-log__who">
                    <span class="a-who">{{ senderName(message.senderId) }}</span>
                  </div>
                  <div class="a-log__time">{{ formatWhen(message.sentAt).split(', ')[1] }}</div>
                  <div
                    class="a-log__text"
                    :class="{
                      'is-removed': message.removedAt,
                      'is-target': message.id === detail.message?.id,
                    }"
                    :data-testid="message.id === detail.message?.id ? 'report-target' : undefined"
                  >
                    <span v-if="message.id === detail.message?.id" class="visually-hidden"
                      >Reported message:
                    </span>
                    {{ message.text }}
                    <template v-if="message.removedAt"> (removed)</template>
                  </div>
                </template>
              </div>
            </div>
          </template>

          <div v-else class="sg-card" data-testid="report-item">
            <div class="sg-item">
              <button
                v-if="detail.item.photoUrl"
                type="button"
                class="report-photo"
                :aria-label="`Open the photo of ${detail.item.title}`"
                data-testid="report-photo"
                @click="viewer.open(detail.item.photoUrl, detail.item.title)"
              >
                <img :src="detail.item.photoUrl" alt="" class="sg-thumb" />
              </button>
              <div class="report-min">
                <div class="ds-small ds-muted">
                  {{ detail.item.type === 'found' ? 'Found item' : 'Lost item' }} ·
                  <span class="ds-num">{{ itemDigits(detail.item.id) }}</span> ·
                  {{ detail.item.status }}
                </div>
                <div class="sg-item-title">{{ detail.item.title }}</div>
                <div class="ds-small ds-muted">{{ detail.item.category }}</div>
                <p class="report-quote mb-0">{{ detail.item.description }}</p>
              </div>
            </div>
          </div>

          <!-- What was done already, for a decided report -->
          <div
            v-if="report.status !== 'open'"
            class="sg-card report-outcome"
            data-testid="report-outcome"
          >
            <h3 class="sg-card-title">
              {{ report.status === 'dismissed' ? 'Dismissed' : 'Action taken' }}
            </h3>
            <ul v-if="taken.length" class="report-taken" data-testid="report-taken">
              <li v-for="entry in taken" :key="`${entry.action}-${entry.createdAt}`">
                <strong>{{ ACTION_LABELS[entry.action] || entry.action }}</strong>
                <span class="ds-small ds-muted">
                  · {{ formatWhen(entry.createdAt) }}
                  <template v-if="entry.admin"> · by {{ entry.admin.name }}</template>
                </span>
                <span v-if="entry.reason" class="d-block report-quote">
                  Reason: {{ entry.reason }}
                </span>
              </li>
            </ul>
            <p v-else class="ds-small ds-muted mb-0">
              {{ formatWhen(report.decidedAt) }}.
              <template v-if="report.status === 'dismissed'"
                >Nothing was wrong with this {{ thing }}.</template
              >
              <template v-else>The Log tab on the Admin page lists what was done.</template>
            </p>
            <div
              v-if="doneMessage"
              class="sg-notice mt-3 mb-0"
              role="status"
              data-testid="report-done"
            >
              {{ doneMessage }}
            </div>
            <p v-if="choices.length && !showMore" class="mt-3 mb-0">
              <BaseButton
                variant="secondary"
                size="sm"
                data-testid="report-more"
                @click="showMore = true"
                >Take another action</BaseButton
              >
            </p>
          </div>

          <!-- What to do: open reports, or a further action on a decided one -->
          <div
            v-if="choices.length && (report.status === 'open' || showMore)"
            class="report-decide"
            data-testid="report-actions"
          >
            <h3 class="report-h3">
              {{ report.status === 'open' ? 'What to do' : 'Another action' }}
            </h3>
            <!-- The author's record on other cases, before choosing warn or suspend -->

            <!-- The author's record on other cases, before choosing warn or suspend -->

            <div class="report-record" data-testid="report-record">
              <span class="sg-label">{{ author?.name }}, on record</span>

              <PersonHistory :history="author?.history" />
            </div>

            <div v-if="!chosen" class="report-buttons" role="group" aria-label="Choose an action">
              <BaseButton
                v-for="action in choices"
                :key="action"
                variant="secondary"
                :class="{ 'report-danger': DANGER.includes(action) }"
                :data-testid="`report-${action}`"
                @click="choose(action)"
              >
                {{ words(action).button }}
              </BaseButton>
            </div>

            <!-- One action at a time: what it does, the reason, then confirm -->
            <div
              v-else
              ref="panel"
              class="sg-card report-panel"
              :class="{ 'is-danger': DANGER.includes(chosen) }"
              role="group"
              :aria-labelledby="'report-panel-title'"
              tabindex="-1"
              data-testid="report-panel"
            >
              <h4 id="report-panel-title" class="sg-card-title">{{ words(chosen).button }}?</h4>
              <p>{{ words(chosen).happens }}</p>
              <label for="report-action-reason" class="sg-field-label">
                Reason · goes in the action log<template v-if="!words(chosen).needsReason">
                  (optional)</template
                >
              </label>
              <textarea
                id="report-action-reason"
                v-model="reason"
                class="sg-input"
                rows="3"
                maxlength="1000"
                data-testid="report-reason"
              ></textarea>
              <div
                v-if="actionError"
                class="sg-alert report-feedback"
                role="alert"
                data-testid="report-action-error"
              >
                {{ actionError }}
              </div>
              <div class="report-buttons">
                <BaseButton variant="secondary" data-testid="report-cancel" @click="cancel">
                  Cancel
                </BaseButton>
                <BaseButton
                  :class="{ 'report-danger-solid': DANGER.includes(chosen) }"
                  :disabled="isSaving"
                  data-testid="report-confirm"
                  @click="confirm"
                >
                  {{ isSaving ? 'Saving…' : words(chosen).confirm }}
                </BaseButton>
              </div>
            </div>

            <div
              v-if="doneMessage && report.status === 'open'"
              class="sg-notice report-feedback"
              role="status"
              data-testid="report-done"
            >
              {{ doneMessage }}
            </div>
          </div>
        </section>
      </div>
    </main>

    <PhotoViewer ref="viewer" />
    <AppFooter />
  </div>
</template>

<style scoped>
.report {
  display: grid;
  gap: 1.5rem;
  align-items: start;
}

@media (min-width: 992px) {
  .report {
    grid-template-columns: 15.5rem minmax(0, 1fr);
    gap: 2.25rem;
    padding-top: 1rem;
  }
}

.report-side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.report-side .sg-card + .sg-card {
  margin-top: 0;
}

.report-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.report-item {
  align-items: center;
  gap: 0.7rem;
}

.report-icon {
  display: inline-grid;
  place-items: center;
  font-size: 1.1rem;
  color: var(--ds-text-muted);
}

.report-min {
  flex: 1;
  min-width: 0;
}

.report-item-title {
  font-weight: 700;
  line-height: 1.25;
}

.report-state {
  margin-top: 0.9rem;
}

.report-people {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-people li {
  display: flex;
  min-width: 0;
  gap: 0.7rem;
  align-items: flex-start;
}

.report-avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--ds-surface-sunken);
  font-size: 0.8rem;
  color: var(--ds-action);
}

.report-mail {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}

.report-mail:hover {
  text-decoration: underline;
}

.report-main {
  min-width: 0;
}

.report-lede {
  margin: 0.4rem 0 1.25rem;
  font-size: 0.95rem;
}

.report-reason {
  margin-bottom: 1rem;
}

.report-quote {
  margin: 0.35rem 0 0;
  overflow-wrap: anywhere;
}

.report-chat-head {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--ds-border);
}

.report-bubble {
  overflow-wrap: anywhere;
}

/* The reported message gets a red outline */
.report-bubble.is-target {
  border: 2px solid var(--ds-danger);
}

.report-decide {
  margin-top: 1.75rem;
}

.report-h3 {
  margin: 0 0 0.9rem;
  font-size: 1.25rem;
  font-weight: 800;
}

.report-title {
  margin-top: 0.5rem;
  font-size: clamp(1.5rem, 5vw, 2.1rem);
  overflow-wrap: anywhere;
}

.report-record {
  margin-bottom: 1rem;
  padding: 0.85rem 1.1rem;
}

/* "R-0007" never breaks across two lines */
.report-code {
  white-space: nowrap;
}

.report-taken {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-panel {
  border-width: 2px;
  border-color: var(--ds-action);
}

.report-panel.is-danger {
  border-color: var(--ds-danger);
}

.report-panel:focus {
  outline: none;
}

.report-feedback {
  margin: 1.25rem 0 0;
}

.report-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

/* Remove and suspend are outlined in red: they affect someone's account */
.report-buttons .report-danger {
  border-color: var(--ds-danger);
  color: var(--ds-danger);
}

.report-buttons .report-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ds-danger) 10%, var(--ds-surface));
}

/* The confirm button for remove and suspend is solid red */
.report-buttons .report-danger-solid {
  border-color: var(--ds-danger);
  background: var(--ds-danger);
  color: var(--ds-canvas);
}

/* On a phone the buttons stack, full width */
@media (max-width: 575.98px) {
  .report-buttons {
    flex-direction: column;
    align-items: stretch;
  }
}

.report-outcome {
  margin-top: 1.75rem;
}

.report-outcome + .report-decide {
  margin-top: 1.25rem;
}

/* The rebuilt page: the same layout as a dispute case */
.report-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.report-wrap {
  flex: 1;
  padding-block: var(--ds-space-5) var(--ds-space-7);
}

.report {
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: var(--ds-space-7);
  padding-top: 0;
}

.report-side {
  align-items: center;
  gap: 0;
}

.report-string {
  height: 1.5rem;
}

.report-side .a-tag__pic {
  height: 8rem;
  color: var(--ds-text-muted);
}

.report-photo {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}

.report-state,
.report-suspended {
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.report-people {
  width: 100%;
  margin-top: var(--ds-space-5);
}

.report-main {
  min-width: 0;
}

.report-title {
  margin-top: var(--ds-space-3);
  overflow-wrap: anywhere;
}

.report-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2);
  margin-block: var(--ds-space-2) var(--ds-space-5);
  padding-bottom: var(--ds-space-4);
  border-bottom: 1px solid var(--ds-border);
  color: var(--ds-text-muted);
}

.report-reason {
  margin-bottom: var(--ds-space-5);
}

.report-quote {
  font-size: var(--ds-size-title);
  line-height: var(--ds-leading-title);
  overflow-wrap: anywhere;
}

.report-context {
  margin-block: var(--ds-space-4) var(--ds-space-5);
}

.report .sg-card {
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  box-shadow: none;
}

.report :deep(.sg-label) {
  letter-spacing: 0;
  text-transform: none;
  font-family: var(--ds-font-text);
}

.report :deep(.ds-num) {
  font-family: inherit;
}

.report-h3 {
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0;
}

.report-buttons {
  justify-content: flex-start;
}

.report-buttons :deep(.ds-btn.report-danger) {
  border-color: var(--ds-danger);
  background: transparent;
  color: var(--ds-danger);
}

.report-buttons :deep(.ds-btn.report-danger:hover) {
  background: color-mix(in srgb, var(--ds-danger) 10%, transparent);
}

.report-buttons :deep(.ds-btn.report-danger-solid) {
  border-color: var(--ds-danger);
  background: var(--ds-danger);
  color: var(--ds-on-role);
}

@media (max-width: 899.98px) {
  .report {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ds-space-5);
  }

  .report-main {
    order: -1;
  }

  .report-side > .a-rail,
  .report-side > .a-string,
  .report-side > .a-tag {
    display: none;
  }

  .report-people {
    margin-top: 0;
  }
}

.report-record {
  margin-bottom: var(--ds-space-4);
}
</style>
