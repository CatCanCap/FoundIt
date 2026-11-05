<script setup>
// The tag you picked on the rack, opened out as a ticket underneath it: how
// long it has waited, both sides in their own words, and the way into the case.
// The queue only carries these details; the lost reports are on the case.
//   dispute   a row from GET /admin/disputes, or
//   report    a row from GET /admin/reports, or
//   appeal    a row from GET /admin/appeals (decided on the ticket itself)
//   now       the time to measure waits against
//   aim       where the picked tag is along the rack (px), or null
import { computed } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import AppealDecision from '@/components/safeguards/AppealDecision.vue'
import {
  appealCode,
  disputeCode,
  disputeFlags,
  itemCode,
  reportCode,
  waitingWords,
} from '@/utils/safeguards'

const props = defineProps({
  dispute: { type: Object, default: null },
  report: { type: Object, default: null },
  appeal: { type: Object, default: null },
  now: { type: Date, default: () => new Date() },
  aim: { type: Number, default: null },
})

const emit = defineEmits(['decided'])

const row = computed(() => props.dispute || props.report || props.appeal)
const wait = computed(() => waitingWords(row.value.createdAt, props.now))
const isLate = computed(() => props.now - new Date(row.value.createdAt) >= 48 * 3600000)
const code = computed(() => {
  if (props.dispute) return disputeCode(props.dispute.id)
  return props.report ? reportCode(props.report.id) : appealCode(props.appeal.id)
})
const flags = computed(() => (props.dispute ? disputeFlags(props.dispute, props.now) : []))

const title = computed(() => {
  if (props.dispute) return props.dispute.item?.title || 'Item'
  if (props.appeal) return props.appeal.person?.name || 'Someone'
  return props.report.kind === 'message' ? 'Chat message' : props.report.item?.title || 'Post'
})
const quoted = computed(() =>
  props.report?.kind === 'message' ? props.report.message?.text : props.report?.reason,
)
const link = computed(() =>
  props.dispute ? `/admin/disputes/${props.dispute.id}` : `/admin/reports/${props.report?.id}`,
)
</script>

<template>
  <section
    class="ticket"
    :class="{ 'is-away': aim === null }"
    :style="{ '--aim': `${aim ?? 0}px` }"
    :aria-label="`${code}, ${title}`"
    data-testid="admin-ticket"
  >
    <div class="ticket__stub">
      <span>Waiting</span>
      <strong :class="{ 'is-late': isLate }">{{ wait.text }}</strong>
      <span>{{ code }}</span>
    </div>

    <div class="ticket__main">
      <h2 class="ticket__title">{{ title }}</h2>

      <template v-if="dispute">
        <p class="ticket__line">
          Item {{ itemCode(dispute.itemId) }}.
          <template v-if="dispute.people?.finder">
            {{ dispute.people.finder.name }} handed it in.
          </template>
          <template v-for="flag in flags" :key="flag"> {{ flag }}.</template>
        </p>
        <div class="ticket__sides">
          <div>
            <span class="a-who is-claimer">
              {{ dispute.people?.claimer?.name || 'The claimer' }} <small>claimer</small>
            </span>
            <p v-if="dispute.claimerResponse">“{{ dispute.claimerResponse }}”</p>
            <p v-else class="is-quiet">Hasn’t replied yet.</p>
            <small>{{ dispute.claimerProofUrl ? '1 photo attached' : 'No proof attached' }}</small>
          </div>
          <div>
            <span class="a-who is-disputer">
              {{ dispute.people?.raisedBy?.name || 'The disputer' }} <small>disputer</small>
            </span>
            <p>“{{ dispute.description }}”</p>
            <small>{{ dispute.proofUrl ? '1 photo attached' : 'No proof attached' }}</small>
          </div>
        </div>
      </template>

      <AppealDecision v-else-if="appeal" :appeal="appeal" @decided="emit('decided', $event)" />

      <template v-else>
        <p class="ticket__line">A post hides itself after 3 open reports.</p>
        <div class="ticket__sides">
          <div>
            <span class="a-who">
              {{ report.people?.reporter?.name || 'Someone' }} <small>reported it</small>
            </span>
            <p>“{{ report.reason }}”</p>
          </div>
          <div>
            <span class="a-who">
              {{ report.people?.author?.name || 'Someone' }} <small>wrote it</small>
            </span>
            <p v-if="quoted">“{{ quoted }}”</p>
          </div>
        </div>
      </template>
    </div>

    <div v-if="!appeal" class="ticket__do">
      <BaseButton :to="link" data-testid="admin-open-case">
        {{ dispute ? 'Open case' : 'Open report' }}
      </BaseButton>
    </div>
  </section>
</template>

<style scoped>
.ticket {
  position: relative;
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr) auto;
  border: 1px solid var(--ds-action);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

/* Points up at the tag it opened */
.ticket::before {
  content: '';
  position: absolute;
  top: -0.55rem;
  left: var(--aim);
  width: 1rem;
  height: 1rem;
  margin-left: -0.5rem;
  border-top: 1px solid var(--ds-action);
  border-left: 1px solid var(--ds-action);
  background: var(--ds-surface);
  rotate: 45deg;
  transition:
    left var(--ds-dur-base) var(--ds-ease-out),
    opacity var(--ds-dur-fast) linear;
}

.ticket.is-away::before {
  opacity: 0;
}

.ticket__stub {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--ds-space-1);
  padding: var(--ds-space-5) var(--ds-space-4);
  border-right: 1px dashed var(--ds-border-control);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-variant-numeric: tabular-nums;
}

/* The two bites out of the edge where the stub tears off */
.ticket__stub::before,
.ticket__stub::after {
  content: '';
  position: absolute;
  right: -0.5rem;
  width: 1rem;
  height: 0.5rem;
  border: 1px solid var(--ds-action);
  background: var(--ds-canvas);
}

.ticket__stub::before {
  top: -1px;
  border-top: 0;
  border-radius: 0 0 1rem 1rem;
}

.ticket__stub::after {
  bottom: -1px;
  border-bottom: 0;
  border-radius: 1rem 1rem 0 0;
}

.ticket__stub strong {
  color: var(--ds-text);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.ticket__stub strong.is-late {
  color: var(--ds-warning);
}

.ticket__main {
  min-width: 0;
  padding: var(--ds-space-5);
}

.ticket__title {
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-title);
  line-height: var(--ds-leading-title);
  letter-spacing: -0.01em;
}

.ticket__line {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.ticket__sides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ds-space-6);
  margin-top: var(--ds-space-4);
}

.ticket__sides p {
  margin-top: var(--ds-space-1);
  overflow-wrap: anywhere;
}

.ticket__sides p.is-quiet {
  color: var(--ds-text-muted);
}

.ticket__sides > div > small {
  display: block;
  margin-top: var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.ticket__do {
  display: flex;
  align-items: flex-end;
  padding: var(--ds-space-5);
}

@media (max-width: 1023.98px) {
  .ticket {
    grid-template-columns: 7rem minmax(0, 1fr);
  }

  .ticket__do {
    grid-column: 1 / -1;
    padding: 0 var(--ds-space-5) var(--ds-space-5);
  }

  .ticket__do :deep(.ds-btn),
  .ticket__do :deep(a) {
    width: 100%;
  }
}

@media (max-width: 767.98px) {
  .ticket {
    grid-template-columns: minmax(0, 1fr);
  }

  .ticket__stub {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    padding: var(--ds-space-3) var(--ds-space-4);
    border-right: 0;
    border-bottom: 1px dashed var(--ds-border-control);
  }

  .ticket__stub::before,
  .ticket__stub::after {
    display: none;
  }

  .ticket__main {
    padding: var(--ds-space-4);
  }

  .ticket__do {
    padding: 0 var(--ds-space-4) var(--ds-space-4);
  }

  .ticket__sides {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ds-space-4);
  }
}
</style>
