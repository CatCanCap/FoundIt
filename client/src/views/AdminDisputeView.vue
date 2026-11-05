<script setup>
// Feature 5b, one dispute (Figma v3 V17a to V17d), in four steps: who is
// involved (CaseSummary), what each person said (CaseEvidence), the handoff
// chat (CaseChat), and the decision with a reason both people will see
// (CaseDecision). The steps are only hidden, not removed, so switching
// between them keeps what the admin has typed. A decision cannot be undone,
// so CaseDecision asks the admin to confirm it before anything is saved.
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
import { mainColour } from '@/utils/design'
import StatusPill from '@/components/ui/StatusPill.vue'
import CaseSummary from '@/components/safeguards/CaseSummary.vue'
import CaseEvidence from '@/components/safeguards/CaseEvidence.vue'
import CaseChat from '@/components/safeguards/CaseChat.vue'
import CaseDecision from '@/components/safeguards/CaseDecision.vue'
import {
  OUTCOMES,
  detailsInCommon,
  disputeCode,
  disputeFlags,
  formatWhen,
  errorText,
  itemCode,
  queuePath,
  waitingWords,
} from '@/utils/safeguards'
import '@/assets/safeguards.css'
import '@/assets/admin.css'

const route = useRoute()

const caseFile = ref(null)
const spots = ref([])
const errorMessage = ref('')
const doneMessage = ref('')
const isLoading = ref(true)
const step = ref(1)
const heading = ref(null)
const viewer = ref(null)
// Back to the Admin list the admin came from, with its tab, search and page
const queueLink = queuePath(window.history.state?.back)

const dispute = computed(() => caseFile.value?.dispute)
const isOpen = computed(() => dispute.value?.status === 'open')

// One live fact on each tab, so the admin sees what is inside before opening it
const foundFact = computed(() =>
  caseFile.value ? `Found ${formatWhen(caseFile.value.foundItem.createdAt).split(',')[0]}` : '',
)
const sidesFact = computed(() => {
  if (!caseFile.value) return ''
  const { foundItem, claimerLostItem, raiserLostItem } = caseFile.value
  const common = (lost) => detailsInCommon(foundItem, lost, spots.value) ?? 0
  return `${common(claimerLostItem)} of 4 vs ${common(raiserLostItem)} of 4 details`
})
const chatFact = computed(() => {
  const count = caseFile.value?.messages.length ?? 0
  if (!count) return 'No messages'
  return `${count} ${count === 1 ? 'message' : 'messages'}`
})

// The four steps. Once decided, step 4 shows the decision instead of the form.
const steps = computed(() => [
  { title: 'What happened', fact: foundFact.value },
  { title: 'Both sides', fact: sidesFact.value },
  { title: 'Chat', fact: chatFact.value },
  {
    title: isOpen.value ? 'Decide' : 'Decision',
    fact: isOpen.value ? 'Waiting for you' : OUTCOMES[dispute.value?.status]?.short,
  },
])

// The admin contacts both people through their SMU email
const emailBoth = computed(() => {
  const emails = [caseFile.value?.claimer?.email, caseFile.value?.raisedBy?.email].filter(Boolean)
  const subject = encodeURIComponent(`FoundIt dispute ${disputeCode(route.params.id)}`)
  return `mailto:${emails.join(',')}?subject=${subject}`
})

// The pill on the case card, in the design system's words and colours
const PILLS = {
  open: { state: 'disputed', label: 'Disputed' },
  upheld: { state: 'returned', label: 'Returned to disputer' },
  closed: { state: 'claimed', label: 'Claim kept' },
  withdrawn: { state: 'returned', label: 'Claim withdrawn' },
}

async function load() {
  try {
    caseFile.value = (await api.get(`/admin/disputes/${route.params.id}`)).data
  } catch (error) {
    errorMessage.value = errorText(error)
  }
}

onMounted(async () => {
  await load()
  isLoading.value = false
  // Place names are a nice-to-have; the case works without them
  try {
    const response = await api.get('/spots')
    spots.value = Array.isArray(response.data) ? response.data : []
  } catch {
    spots.value = []
  }
})

// How long it has waited, for the tag
const wait = computed(() =>
  dispute.value ? waitingWords(dispute.value.createdAt, new Date()) : null,
)
const isLate = computed(
  () => Boolean(dispute.value) && new Date() - new Date(dispute.value.createdAt) >= 48 * 3600000,
)
const flags = computed(() => (dispute.value ? disputeFlags(dispute.value) : []))

// Arrow keys move along the tabs, as in any tab list
function onTabKey(event, index) {
  const moves = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    Home: 0,
    End: steps.value.length - 1,
  }
  if (!(event.key in moves)) return
  event.preventDefault()
  goTo(((moves[event.key] + steps.value.length) % steps.value.length) + 1)
}

// Move to a step and put keyboard and screen reader focus on its heading
async function goTo(number) {
  step.value = number
  await nextTick()
  heading.value?.focus()
}

async function onDecided() {
  doneMessage.value = 'Decision logged. Both people can now see your reason.'
  await load()
}
</script>

<template>
  <div class="ds case-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap case-main">
      <div v-if="errorMessage" class="sg-alert" role="alert" data-testid="case-error">
        {{ errorMessage }}
      </div>
      <div v-if="doneMessage" class="sg-notice" role="status" data-testid="case-done">
        {{ doneMessage }}
      </div>
      <PageSkeleton v-if="isLoading" kind="detail" label="Loading the case…" />

      <div v-if="caseFile" class="case ds-arrive">
        <!-- The tag stays hung beside everything you read -->
        <aside class="case-tag">
          <span class="a-rail" aria-hidden="true"></span>
          <span class="a-pin" aria-hidden="true"></span>
          <span class="a-string case-tag__string" aria-hidden="true"></span>
          <div class="a-tag">
            <span class="a-tag__cap" aria-hidden="true"><span class="a-tag__eyelet"></span></span>
            <div class="a-tag__body">
              <button
                v-if="caseFile.foundItem.photoUrl"
                type="button"
                class="a-tag__pic case-tag__photo"
                :aria-label="`Open the finder's photo of ${caseFile.foundItem.title}`"
                data-testid="case-photo"
                @click="viewer.open(caseFile.foundItem.photoUrl, `The finder's photo`)"
              >
                <img :src="caseFile.foundItem.photoUrl" alt="" />
              </button>
              <span v-else class="a-tag__pic" aria-hidden="true">
                <ItemIcon
                  :category="caseFile.foundItem.category"
                  :colour="mainColour(caseFile.foundItem)"
                  :size="64"
                />
              </span>
              <span class="a-tag__title">Item {{ itemCode(caseFile.foundItem.id) }}</span>
              <div class="case-tag__people">
                <span class="a-who is-finder"
                  >{{ caseFile.finder?.name }} <small>finder</small></span
                >
                <span class="a-who is-claimer"
                  >{{ caseFile.claimer?.name }} <small>claimer</small></span
                >
                <span class="a-who is-disputer"
                  >{{ caseFile.raisedBy?.name }} <small>disputer</small></span
                >
              </div>
              <div class="a-tag__stub case-tag__stub">
                <span>{{ isOpen ? 'Waiting' : 'Decided' }}</span>
                <strong v-if="isOpen" :class="{ 'is-late': isLate }">{{ wait.text }}</strong>
                <strong v-else>{{ formatWhen(dispute.decidedAt).split(', ')[0] }}</strong>
              </div>
            </div>
          </div>
          <a :href="emailBoth" class="ds-link ds-link--standalone" data-testid="case-email"
            >Email both people</a
          >
        </aside>

        <section class="case-body">
          <nav aria-label="Breadcrumb">
            <ol class="a-crumbs">
              <li><RouterLink to="/admin">Admin</RouterLink></li>
              <li><RouterLink :to="queueLink" data-testid="case-back">Disputes</RouterLink></li>
              <li>
                <a href="#" aria-current="page" @click.prevent="goTo(1)">{{
                  disputeCode(route.params.id)
                }}</a>
              </li>
            </ol>
          </nav>

          <h1 class="ds-h1 case-title" data-testid="case-title">
            {{ caseFile.foundItem.title }}
          </h1>
          <p class="case-sub">
            <StatusPill :state="PILLS[dispute.status].state" data-testid="case-status">{{
              PILLS[dispute.status].label
            }}</StatusPill>
            <span class="case-sub__wait">Waiting {{ wait?.text }}.</span>
            <strong v-for="flag in flags" :key="flag">{{ flag }}.</strong>
            <span>
              {{
                isOpen
                  ? 'Nothing changes until you log a decision.'
                  : `Decided ${formatWhen(dispute.decidedAt)}.`
              }}
            </span>
          </p>

          <div class="case-tabs" role="tablist" aria-label="This case">
            <button
              v-for="(entry, index) in steps"
              :key="entry.title"
              type="button"
              role="tab"
              :aria-selected="step === index + 1"
              :tabindex="step === index + 1 ? 0 : -1"
              :class="{ 'is-current': step === index + 1 }"
              :data-testid="`case-step-${index + 1}`"
              @click="goTo(index + 1)"
              @keydown="onTabKey($event, index)"
            >
              <span class="case-tabs__num" aria-hidden="true">{{ index + 1 }}</span>
              <strong>{{ entry.title }}</strong>
              <small :class="{ 'is-due': isOpen && index === 3 }">{{ entry.fact }}</small>
            </button>
          </div>

          <h2 ref="heading" class="visually-hidden" tabindex="-1" data-testid="case-step-title">
            {{ steps[step - 1].title }}
          </h2>

          <div class="case-panel" role="tabpanel">
            <CaseSummary v-show="step === 1" :case-file="caseFile" :spots="spots" />
            <CaseEvidence v-show="step === 2" :case-file="caseFile" :spots="spots" />
            <CaseChat v-show="step === 3" :case-file="caseFile" />
            <div v-show="step === 4">
              <CaseDecision
                :case-file="caseFile"
                @decided="onDecided"
                @changed="load"
                @back="goTo(3)"
              />
            </div>

            <div v-if="step < 4" class="case-nav">
              <BaseButton v-if="step > 1" variant="secondary" @click="goTo(step - 1)"
                >Back</BaseButton
              >
              <BaseButton data-testid="case-next" @click="goTo(step + 1)">
                Next: {{ steps[step].title }}
              </BaseButton>
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
.case-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.case-main {
  flex: 1;
  padding-block: var(--ds-space-5) var(--ds-space-7);
}

.case {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: var(--ds-space-7);
  align-items: start;
}

.case-tag {
  position: sticky;
  top: var(--ds-space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.case-tag__string {
  height: 1.5rem;
}

.case-tag .a-tag__pic {
  height: 8rem;
}

.case-tag__photo {
  width: 100%;
  padding: 0;
  border: 0;
  cursor: zoom-in;
}

.case-tag__people {
  display: grid;
  gap: var(--ds-space-1);
  padding-top: var(--ds-space-2);
  border-top: 1px solid var(--ds-border);
  font-size: var(--ds-size-small);
}

.case-tag__stub {
  display: block;
  white-space: normal;
}

.case-tag__stub > span {
  display: block;
}

.case-tag__stub strong {
  display: block;
  color: var(--ds-text);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  line-height: 1.1;
}

.case-tag__stub strong.is-late {
  color: var(--ds-warning);
}

.case-body {
  min-width: 0;
}

.case-title {
  margin-top: var(--ds-space-3);
}

.case-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-2);
  margin-top: var(--ds-space-2);
  color: var(--ds-text-muted);
}

.case-sub strong {
  color: var(--ds-warning);
}

.case-sub__wait {
  display: none;
}

/* Folder tabs on the case file below them */
.case-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ds-space-1);
  margin-top: var(--ds-space-5);
  padding-inline: var(--ds-space-1);
}

/* The number stays beside both lines, so the order reads across the row */
.case-tabs button {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--ds-space-3);
  align-items: center;
  min-width: 0;
  padding: var(--ds-space-2) var(--ds-space-3);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--ds-radius-control) var(--ds-radius-control) 0 0;
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.case-tabs button:hover {
  background: var(--ds-action-wash);
  color: var(--ds-text);
}

.case-tabs__num {
  display: grid;
  grid-row: span 2;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--ds-text-muted) 20%, transparent);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: 1;
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.case-tabs button.is-current .case-tabs__num {
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.case-tabs strong {
  display: block;
  grid-column: 2;
  font-weight: var(--ds-weight-medium);
  line-height: 1.3;
}

.case-tabs small {
  display: block;
  grid-column: 2;
  overflow: hidden;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.case-tabs small.is-due {
  color: var(--ds-warning);
  font-weight: var(--ds-weight-bold);
}

.case-tabs button.is-current {
  z-index: 1;
  margin-bottom: -1px;
  border-color: var(--ds-border);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.case-tabs button.is-current strong {
  font-weight: var(--ds-weight-bold);
}

.case-panel {
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.case-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ds-space-3);
  margin-top: var(--ds-space-6);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-border);
}

/* On a phone the case itself comes first; its facts move into the top line */
@media (max-width: 899.98px) {
  .case {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .case-tag {
    display: none;
  }

  .case-sub__wait {
    display: inline;
  }

  /* No room beside the words, so each number sits above its word */
  .case-tabs button {
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--ds-space-1);
    justify-items: center;
    align-content: start;
    padding-inline: var(--ds-space-1);
    text-align: center;
  }

  .case-tabs__num {
    grid-row: auto;
  }

  .case-tabs strong {
    grid-column: 1;
    font-size: var(--ds-size-small);
  }

  .case-tabs small {
    display: none;
  }

  .case-panel {
    padding: var(--ds-space-4);
  }
}
</style>
