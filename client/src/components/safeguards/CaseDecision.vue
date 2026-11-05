<script setup>
// Step 4 of a dispute case (Figma v3 V17d). While the dispute is open: who
// gets the item, a penalty only if the claim looked deliberate, and a reason
// both people will see. A decision cannot be undone, so "Review decision"
// first shows what will happen, and nothing is saved until the admin presses
// "Yes, log it". Once decided: the outcome and its reason.
//   caseFile  GET /admin/disputes/:id
// Emits:
//   decided   after the server saved the decision (the page loads the case again)
//   changed   the server refused because the case changed meanwhile (409: another
//             admin decided, or the claimer withdrew); the page loads it again
//   back      the admin wants the previous step
import { ref, computed, watch, nextTick } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import PersonHistory from '@/components/safeguards/PersonHistory.vue'
import { OUTCOMES, errorText, formatWhen, mayHaveSent } from '@/utils/safeguards'

const props = defineProps({
  caseFile: { type: Object, required: true },
})
const emit = defineEmits(['decided', 'changed', 'back'])

const dispute = computed(() => props.caseFile.dispute)
const isOpen = computed(() => dispute.value.status === 'open')
const claimerName = computed(() => props.caseFile.claimer?.name || 'the claimer')
const raiserName = computed(() => props.caseFile.raisedBy?.name || 'the person who disputed')
const finderName = computed(() => props.caseFile.finder?.name || 'the finder')
const firstName = (name) => name.split(' ')[0]

// The item can only move to the disputer while their lost report still exists
const canReturn = computed(() => Boolean(props.caseFile.raiserLostItem))
// If the claimer already has the item, they must bring it back within 3 days
const claimerHasIt = computed(() =>
  (props.caseFile.handoffs || []).some((handoff) =>
    ['handed_over', 'completed'].includes(handoff.status),
  ),
)

const decision = ref(canReturn.value ? 'return' : 'keep')
// 'none' for an honest mistake (most wrong claims are), 'warn' or 'suspend'
// when the claim looked deliberate. The server takes a penalty only when the
// item goes back to the disputer.
const penalty = ref('none')
const reason = ref('')
const isConfirming = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const confirmBox = ref(null)

const PENALTIES = computed(() => [
  { value: 'none', label: 'No penalty', hint: 'An honest mistake. Most wrong claims are.' },
  { value: 'warn', label: `Warn ${firstName(claimerName.value)}`, hint: 'Logged on their record.' },
  {
    value: 'suspend',
    label: `Suspend ${firstName(claimerName.value)}`,
    hint: 'Only for a claim that looked deliberate.',
  },
])

// Changing anything after "Review decision" goes back to editing
watch([decision, penalty, reason], () => {
  isConfirming.value = false
})

async function review() {
  errorMessage.value = ''
  if (!reason.value.trim()) {
    errorMessage.value = 'Give a reason. Both people will see it.'
    return
  }
  isConfirming.value = true
  await nextTick()
  confirmBox.value?.focus()
}

async function logDecision() {
  errorMessage.value = ''
  isSaving.value = true
  try {
    const id = dispute.value.id
    if (decision.value === 'return') {
      await api.post(`/admin/disputes/${id}/uphold`, {
        reason: reason.value.trim(),
        penalty: penalty.value,
      })
    } else {
      await api.post(`/admin/disputes/${id}/close`, { reason: reason.value.trim() })
    }
    emit('decided')
  } catch (error) {
    errorMessage.value = errorText(error)
    isConfirming.value = false
    // Decided already (by another admin, or by this one when the first answer
    // came too late), or no answer in time: load the case again to show where
    // it stands
    const status = error.response?.status
    const alreadyDecided = status === 400 && /already/i.test(error.response?.data?.error || '')
    if (status === 409 || alreadyDecided || mayHaveSent(error)) emit('changed')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <form v-if="isOpen" novalidate data-testid="case-decision" @submit.prevent="review">
    <div class="decide">
      <div class="decide__main">
        <fieldset class="decide-choices">
          <legend class="a-h">Who gets the item?</legend>
          <div class="decide-pair">
            <label
              class="decide-choice is-disputer"
              :class="{ 'is-chosen': decision === 'return', 'is-off': !canReturn }"
            >
              <input
                v-model="decision"
                type="radio"
                name="decision"
                value="return"
                :disabled="!canReturn"
                data-testid="case-return"
              />
              <span>
                <span class="decide-role">Disputer</span>
                <strong>Return to {{ raiserName }}</strong>
                <small>
                  <template v-if="canReturn">The claim moves to them.</template>
                  <template v-else
                    >Not possible: the lost report on this dispute was deleted.</template
                  >
                </small>
              </span>
            </label>
            <label class="decide-choice is-claimer" :class="{ 'is-chosen': decision === 'keep' }">
              <input
                v-model="decision"
                type="radio"
                name="decision"
                value="keep"
                data-testid="case-keep"
              />
              <span>
                <span class="decide-role">Original claimer</span>
                <strong>Keep {{ claimerName }}'s claim</strong>
                <small>The dispute closes.</small>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset v-if="decision === 'return'" class="decide-penalty" data-testid="case-penalty">
          <legend class="a-h">Penalty for {{ claimerName }}</legend>
          <label v-for="option in PENALTIES" :key="option.value" class="decide-pen">
            <input
              v-model="penalty"
              type="radio"
              name="penalty"
              :value="option.value"
              :data-testid="`case-penalty-${option.value}`"
            />
            <span
              ><strong>{{ option.label }}</strong> {{ option.hint }}</span
            >
          </label>
        </fieldset>

        <label for="decision-reason" class="a-h decide-label">Reason both people will see</label>
        <textarea
          id="decision-reason"
          v-model="reason"
          class="decide-reason"
          rows="4"
          maxlength="1000"
          required
          aria-describedby="decision-reason-help"
          data-testid="case-reason"
        ></textarea>
        <p id="decision-reason-help" class="decide-help">
          <span>It cannot be changed later.</span><span>{{ reason.length }} / 1000</span>
        </p>
      </div>

      <aside class="decide__side">
        <div class="decide-happens" aria-live="polite">
          <h3 class="a-h">What happens</h3>
          <template v-if="decision === 'return'">
            <p>
              {{ raiserName }} gets the item, and the handoff restarts with
              {{ firstName(finderName) }}.
            </p>
            <p v-if="claimerHasIt">
              {{ claimerName }} must bring it to a collection point within 3 days.
            </p>
            <p v-else>{{ claimerName }}'s claim ends and their lost report opens again.</p>
            <p v-if="penalty === 'warn'" class="is-bad">
              A warning is logged against {{ claimerName }}.
            </p>
            <p v-if="penalty === 'suspend'" class="is-bad">
              {{ claimerName }}'s account is suspended.
            </p>
          </template>
          <template v-else>
            <p>{{ claimerName }} keeps the claim, and the handoff picks up where it paused.</p>
            <p>{{ raiserName }} sees your reason on their dispute.</p>
          </template>
        </div>

        <!-- Their records on other cases, to tell an honest mistake from a
             deliberate false claim before choosing a penalty -->
        <div class="decide-records" data-testid="case-records">
          <h3 class="a-h">On record, other cases</h3>
          <div>
            <span class="a-who is-claimer">{{ claimerName }} <small>claimer</small></span>
            <PersonHistory :history="caseFile.claimer?.history" />
          </div>
          <div>
            <span class="a-who is-disputer">{{ raiserName }} <small>disputer</small></span>
            <PersonHistory :history="caseFile.raisedBy?.history" />
          </div>
        </div>
      </aside>
    </div>

    <!-- Shown beside the buttons, so it is seen on a phone too -->
    <div v-if="errorMessage" class="sg-alert" role="alert" data-testid="case-decision-error">
      {{ errorMessage }}
    </div>

    <div
      v-if="isConfirming"
      ref="confirmBox"
      class="decide-confirm"
      role="group"
      aria-labelledby="decision-confirm-title"
      tabindex="-1"
      data-testid="case-confirm-box"
    >
      <h3 id="decision-confirm-title">Log this decision?</h3>
      <p>
        <template v-if="decision === 'return'">
          The item goes to {{ raiserName
          }}<template v-if="penalty === 'warn'"> and {{ claimerName }} is warned</template
          ><template v-if="penalty === 'suspend'"> and {{ claimerName }} is suspended</template>.
        </template>
        <template v-else>{{ claimerName }} keeps the claim.</template>
        Both people see your reason. This cannot be undone.
      </p>
      <div class="decide-nav">
        <BaseButton variant="secondary" data-testid="case-cancel" @click="isConfirming = false">
          Go back and edit
        </BaseButton>
        <BaseButton :disabled="isSaving" data-testid="case-confirm" @click="logDecision">
          {{ isSaving ? 'Saving…' : 'Yes, log it' }}
        </BaseButton>
      </div>
    </div>
    <div v-else class="decide-nav">
      <BaseButton variant="secondary" @click="emit('back')">Back</BaseButton>
      <BaseButton type="submit" data-testid="case-submit">Review decision</BaseButton>
    </div>
  </form>

  <div v-else class="decide-done" data-testid="case-outcome">
    <h3>{{ OUTCOMES[dispute.status]?.long }}</h3>
    <p class="is-quiet">{{ formatWhen(dispute.decidedAt) }}</p>
    <p v-if="dispute.decisionReason">Reason: {{ dispute.decisionReason }}</p>
    <p v-if="dispute.returnBy">
      The claimer must bring the item to a collection point by
      {{ formatWhen(dispute.returnBy) }}.
    </p>
    <p v-if="caseFile.decidedBy" class="is-quiet">Decided by {{ caseFile.decidedBy.name }}</p>
  </div>
</template>

<style scoped>
.decide {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  gap: var(--ds-space-7);
  align-items: start;
}

.decide__main,
.decide__side {
  min-width: 0;
}

.decide-choices,
.decide-penalty {
  min-width: 0;
  margin: 0 0 var(--ds-space-5);
  padding: 0;
  border: 0;
}

.decide-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ds-space-4);
}

.decide-choices legend,
.decide-penalty legend {
  padding: 0;
}

.decide-choice {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  gap: var(--ds-space-3);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  overflow-wrap: anywhere;
  cursor: pointer;
  transition:
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    box-shadow var(--ds-dur-fast) var(--ds-ease-out);
}

/* Who each choice is about, in that person's colour, so the two can't be mixed up */
.decide-role {
  display: inline-block;
  margin-bottom: var(--ds-space-1);
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--role) 14%, var(--ds-surface));
  color: var(--role);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
}

.decide-choice:hover {
  border-color: var(--role);
}

.decide-choice:has(:focus-visible) {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.decide-choice.is-chosen {
  border-color: var(--role);
  box-shadow: inset 0 0 0 1px var(--role);
}

.decide-choice.is-off {
  opacity: 0.6;
  cursor: not-allowed;
}

.decide-choice input {
  margin-top: 0.25rem;
  accent-color: var(--role);
}

.decide-choice strong {
  display: block;
  color: var(--role);
}

.decide-choice small {
  display: block;
  margin-top: var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.decide-pen {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-2);
  border-bottom: 1px solid var(--ds-border);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  cursor: pointer;
}

.decide-pen input {
  margin-top: 0.15rem;
}

.decide-pen strong {
  margin-right: var(--ds-space-2);
  color: var(--ds-text);
}

.decide-label {
  display: block;
}

.decide-reason {
  display: block;
  width: 100%;
  min-height: 6rem;
  /* Pulls down only, and stops here; a longer reason scrolls inside the box */
  max-height: 16rem;
  resize: vertical;
  padding: var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
}

.decide-help {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-3);
  margin-top: var(--ds-space-2);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-variant-numeric: tabular-nums;
}

.decide-happens {
  margin-bottom: var(--ds-space-5);
  padding: var(--ds-space-4);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  font-size: var(--ds-size-small);
}

.decide-happens p + p {
  margin-top: var(--ds-space-2);
}

.decide-happens p.is-bad {
  color: var(--ds-danger);
  font-weight: var(--ds-weight-medium);
}

.decide-records {
  display: grid;
  gap: var(--ds-space-3);
}

.decide-records .a-h {
  margin-bottom: 0;
}

.decide-confirm {
  margin-top: var(--ds-space-5);
  padding: var(--ds-space-5);
  border: 1.5px solid var(--ds-action);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.decide-confirm:focus {
  outline: none;
}

.decide-confirm h3,
.decide-done h3 {
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-title);
  line-height: var(--ds-leading-title);
  letter-spacing: -0.01em;
}

.decide-confirm p {
  margin-top: var(--ds-space-1);
}

.decide-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ds-space-3);
  margin-top: var(--ds-space-5);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-border);
}

.decide-confirm .decide-nav {
  padding-top: 0;
  border-top: 0;
}

.decide-done {
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.decide-done p {
  margin-top: var(--ds-space-2);
}

.decide-done .is-quiet {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

@media (max-width: 1023.98px) {
  .decide {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ds-space-5);
  }
}

@media (max-width: 767.98px) {
  .decide-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
