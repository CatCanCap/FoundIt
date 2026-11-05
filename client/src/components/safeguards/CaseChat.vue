<script setup>
// The Chat tab of a dispute case (Figma v3 V17c): the handoff chat between the
// claimer and the finder, laid out like any chat: one person on each side, a
// name above each run of messages and the time in each bubble. An admin sees
// it only because of the dispute, and the person who disputed was never in it.
//   caseFile  GET /admin/disputes/:id
import { computed } from 'vue'
import LockNote from '@/components/safeguards/LockNote.vue'
import { formatWhen } from '@/utils/safeguards'

const props = defineProps({
  caseFile: { type: Object, required: true },
})

const dispute = computed(() => props.caseFile.dispute)
const claimerName = computed(() => props.caseFile.claimer?.name || 'The claimer')
const finderName = computed(() => props.caseFile.finder?.name || 'The finder')
const raiserName = computed(() => props.caseFile.raisedBy?.name || 'The person who disputed')
const firstName = (name) => name.split(' ')[0]

const dayOf = (iso) => formatWhen(iso).split(', ')[0]
const timeOf = (iso) => formatWhen(iso).split(', ')[1]

// Each message with its side, and a day above it when the day changes
const lines = computed(() => {
  let lastDay = ''
  let lastSender = null
  return props.caseFile.messages.map((message) => {
    const day = dayOf(message.sentAt)
    const line = {
      message,
      side: message.senderId === props.caseFile.finder?.id ? 'finder' : 'claimer',
      name: message.senderId === props.caseFile.finder?.id ? finderName.value : claimerName.value,
      day: day === lastDay ? '' : day,
      isNewRun: message.senderId !== lastSender,
    }
    lastDay = day
    lastSender = message.senderId
    return line
  })
})

const count = computed(() => props.caseFile.messages.length)
const removed = computed(() => props.caseFile.messages.filter((entry) => entry.removedAt).length)
const lastDay = computed(() =>
  count.value ? dayOf(props.caseFile.messages[count.value - 1].sentAt) : '',
)
const openedDay = computed(() => dayOf(dispute.value.createdAt))
</script>

<template>
  <div class="chat-tab" data-testid="case-chat">
    <div class="chat-top">
      <p v-if="count" class="chat-sum">
        <strong>{{ count }} {{ count === 1 ? 'message' : 'messages' }}</strong>
        <span v-if="removed">{{ removed }} removed by an admin</span>
        <span>{{ firstName(raiserName) }} is not in this chat</span>
      </p>
      <span v-else></span>
      <LockNote>Visible because it's attached to this dispute.</LockNote>
    </div>

    <div class="talk">
      <div v-if="count === 0" class="talk__empty" data-testid="case-chat-empty">
        <strong>No messages yet</strong>
        <p>
          {{ firstName(claimerName) }} and {{ firstName(finderName) }} haven't written to each
          other, so there's nothing to review here.
        </p>
      </div>

      <template v-for="line in lines" :key="line.message.id">
        <div v-if="line.day" class="talk__note">
          <span>{{ line.day }}</span>
        </div>
        <div class="talk__msg" :class="[`is-${line.side}`, { 'is-new-run': line.isNewRun }]">
          <span v-if="line.isNewRun || line.day" class="a-who talk__name">
            {{ line.name }} <small>{{ line.side }}</small>
          </span>
          <div class="talk__bubble" :class="{ 'is-removed': line.message.removedAt }">
            <p>{{ line.message.removedAt ? 'A message was removed' : line.message.text }}</p>
            <div class="talk__meta">
              <time :datetime="line.message.sentAt">{{ timeOf(line.message.sentAt) }}</time>
            </div>
          </div>
        </div>
      </template>

      <div v-if="openedDay !== lastDay" class="talk__note">
        <span>{{ openedDay }}</span>
      </div>
      <div class="talk__note is-event">
        <span>
          <strong>Dispute opened by {{ firstName(raiserName) }}</strong>
          at {{ timeOf(dispute.createdAt) }}.
          <template v-if="dispute.status === 'open'">The handoff is paused.</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-2) var(--ds-space-4);
  margin-bottom: var(--ds-space-5);
}

.chat-top :deep(*) {
  margin-bottom: 0;
}

.chat-sum {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--ds-space-4);
  color: var(--ds-text-muted);
}

.chat-sum strong {
  color: var(--ds-text);
}

/* Sits straight on the case panel: no box of its own */
/* The day, and anything else that belongs to neither person, on a hairline */
.talk__note {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-3);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
  text-align: center;
}

.talk__note::before,
.talk__note::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--ds-border);
}

.talk__note.is-event strong {
  color: var(--ds-role-disputer);
}

/* A quiet panel, like every other empty list */
.talk__empty {
  padding: var(--ds-space-7) var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
  text-align: center;
}

.talk__empty strong {
  display: block;
  color: var(--ds-text);
  font-size: var(--ds-size-title);
  line-height: var(--ds-leading-title);
}

.talk__empty p {
  max-width: 28rem;
  margin: var(--ds-space-1) auto 0;
}

.talk__msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-top: var(--ds-space-1);
}

.talk__msg.is-new-run {
  padding-top: var(--ds-space-3);
}

.talk__msg.is-claimer {
  --role: var(--ds-role-claimer);
}

.talk__msg.is-finder {
  --role: var(--ds-role-finder);
  align-items: flex-end;
}

.talk__name {
  margin-bottom: var(--ds-space-1);
  padding-inline: var(--ds-space-1);
  font-size: var(--ds-size-small);
}

.talk__bubble {
  max-width: min(75%, 34rem);
  padding: var(--ds-space-2) var(--ds-space-3);
  border-radius: var(--ds-radius-surface);
  background: color-mix(in srgb, var(--role) 11%, var(--ds-surface));
  overflow-wrap: anywhere;
}

.is-claimer .talk__bubble {
  border-top-left-radius: var(--ds-space-1);
}

.is-finder .talk__bubble {
  border-top-right-radius: var(--ds-space-1);
}

.talk__meta {
  display: flex;
  justify-content: flex-end;
  gap: var(--ds-space-2);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-variant-numeric: tabular-nums;
}

.talk__bubble.is-removed {
  outline: 1px dashed var(--ds-border-control);
  background: var(--ds-surface);
  color: var(--ds-text-muted);
  font-style: italic;
}

.talk__bubble.is-removed .talk__meta {
  font-style: normal;
}

@media (max-width: 575.98px) {
  .talk__bubble {
    max-width: 85%;
  }
}
</style>
