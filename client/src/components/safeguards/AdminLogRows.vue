<script setup>
// One page of the admin action log, as a record: a heading for each day, then
// each action with its time, what was done in one line, its reason, who did it
// and the case it belongs to. The dot says what kind of action it was.
//   rows   the log entries on this page, from GET /admin/actions
import { computed } from 'vue'
import { ACTION_LABELS, disputeCode, reportCode, formatWhen } from '@/utils/safeguards'

const props = defineProps({
  rows: { type: Array, required: true },
})

const KINDS = {
  warn_user: 'penalty',
  suspend_user: 'penalty',
  remove_message: 'penalty',
  remove_item: 'penalty',
  unsuspend_user: 'lifted',
}

// What was done, naming the person when the action was about them
function headline(entry) {
  const name = entry.user?.name
  if (name && entry.action === 'warn_user') return `Warned ${name}`
  if (name && entry.action === 'suspend_user') return `Suspended ${name}`
  if (name && entry.action === 'unsuspend_user') return `Lifted ${name}'s suspension`
  if (name && entry.action === 'close_dispute') return `Kept ${name}'s claim`
  if (name && entry.action === 'uphold_dispute') return `Took the item from ${name}`
  return ACTION_LABELS[entry.action] || entry.action
}

const days = computed(() => {
  const groups = []
  for (const entry of props.rows) {
    const [day, time] = formatWhen(entry.createdAt).split(', ')
    const last = groups[groups.length - 1]
    const row = { entry, time, kind: KINDS[entry.action] || 'decision' }
    if (last?.day === day) last.rows.push(row)
    else groups.push({ day, rows: [row] })
  }
  return groups
})
</script>

<template>
  <div class="log">
    <section v-for="group in days" :key="group.day" class="log__day">
      <h3>{{ group.day }}</h3>
      <ol>
        <li
          v-for="{ entry, time, kind } in group.rows"
          :key="entry.id"
          class="log__row"
          :class="`is-${kind}`"
          :data-testid="`admin-log-${entry.id}`"
        >
          <time :datetime="entry.createdAt">{{ time }}</time>
          <span class="log__dot" aria-hidden="true"></span>
          <div class="log__body">
            <strong>{{ headline(entry) }}</strong>
            <p v-if="entry.reason">{{ entry.reason }}</p>
          </div>
          <div class="log__side">
            <RouterLink
              v-if="entry.disputeId"
              :to="`/admin/disputes/${entry.disputeId}`"
              class="ds-link"
              >{{ disputeCode(entry.disputeId) }}</RouterLink
            >
            <RouterLink
              v-else-if="entry.reportId"
              :to="`/admin/reports/${entry.reportId}`"
              class="ds-link"
              >{{ reportCode(entry.reportId) }}</RouterLink
            >
            <span>{{ entry.admin?.name || 'A former admin' }}</span>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.log__day + .log__day {
  margin-top: var(--ds-space-5);
}

.log__day h3 {
  padding-bottom: var(--ds-space-2);
  border-bottom: 1px solid var(--ds-border);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0;
}

.log__day ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.log__row {
  display: grid;
  grid-template-columns: 3rem 0.75rem minmax(0, 1fr) auto;
  gap: var(--ds-space-3);
  align-items: baseline;
  padding-block: var(--ds-space-3);
  border-bottom: 1px solid var(--ds-border);
}

.log__row time {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-variant-numeric: tabular-nums;
}

.log__dot {
  align-self: start;
  width: 0.625rem;
  height: 0.625rem;
  margin-top: 0.4rem;
  border-radius: 50%;
  background: var(--ds-action);
}

.log__row.is-penalty .log__dot {
  background: var(--ds-danger);
}

.log__row.is-lifted .log__dot {
  background: var(--ds-success);
}

.log__body {
  min-width: 0;
}

.log__body p {
  margin-top: var(--ds-space-1);
  color: var(--ds-text-muted);
  overflow-wrap: anywhere;
}

.log__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 575.98px) {
  .log__row {
    grid-template-columns: 2.75rem 0.75rem minmax(0, 1fr);
  }

  .log__side {
    grid-column: 3;
    flex-direction: row;
    justify-content: space-between;
    gap: var(--ds-space-3);
  }
}
</style>
