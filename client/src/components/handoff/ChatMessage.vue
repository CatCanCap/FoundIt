<script setup>
// One message in the handoff chat (Figma V12.1): a bubble, who sent it and
// when, and "Report" under the other person's messages. "Report" asks
// "Report this message?" before it sends anything.
//   message    from GET /api/messages/:matchId
//   mine       true when the person looking sent it
//   meta       "You · 09:24"
//   reported   true once this person reported it, to say thanks instead
//   showMeta   false for all but the last of a few messages from one person in
//              the same minute: they share the time line under the last one,
//              and each keeps a small flag button to report it on its own
//   grouped    the next message belongs with this one, so it sits closer
// A message being sent has message.pending ("Sending…"); one that failed has
// message.failed ("Not sent" with "Try again", which emits retry).
// Emits report when the person confirms.
// In the design system (assets/system.css): your messages in navy, theirs on
// the sunken surface; only the handoff page uses it.
import { ref } from 'vue'

defineProps({
  message: { type: Object, required: true },
  mine: { type: Boolean, default: false },
  meta: { type: String, required: true },
  reported: { type: Boolean, default: false },
  showMeta: { type: Boolean, default: true },
  grouped: { type: Boolean, default: false },
})

const emit = defineEmits(['report', 'retry'])
const asking = ref(false)

function confirmReport() {
  asking.value = false
  emit('report')
}
</script>

<template>
  <li
    class="chat-msg"
    :class="{ 'is-mine': mine, 'is-grouped': grouped, 'is-pending': message.pending }"
    data-testid="chat-message"
  >
    <div class="chat-msg__row">
      <p v-if="message.removedAt" class="chat-msg__bubble chat-msg__bubble--removed">
        This message was removed by an admin
      </p>
      <p v-else class="chat-msg__bubble">{{ message.text }}</p>
      <template v-if="!showMeta && !mine && !message.removedAt">
        <span v-if="reported" class="chat-msg__reported" data-testid="message-reported">
          Reported
        </span>
        <button
          v-else
          type="button"
          class="chat-msg__flag"
          :aria-expanded="asking"
          aria-label="Report this message"
          data-testid="report-message"
          @click="asking = !asking"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
          </svg>
        </button>
      </template>
    </div>

    <div v-if="message.failed" class="chat-msg__meta chat-msg__meta--failed">
      <span>Not sent</span>
      <button
        type="button"
        class="chat-msg__action"
        data-testid="message-retry"
        @click="emit('retry')"
      >
        Try again
      </button>
    </div>
    <div v-else-if="message.pending" class="chat-msg__meta">
      <span>Sending…</span>
    </div>
    <div v-else-if="showMeta" class="chat-msg__meta">
      <span>{{ meta }}</span>
      <template v-if="!mine && !message.removedAt">
        <span v-if="reported" class="chat-msg__reported" data-testid="message-reported">
          Reported. Thanks.
        </span>
        <button
          v-else
          type="button"
          class="chat-msg__action"
          :aria-expanded="asking"
          data-testid="report-message"
          @click="asking = !asking"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
          </svg>
          Report
        </button>
      </template>
    </div>

    <div v-if="asking" class="chat-msg__ask" role="group" aria-label="Report this message?">
      <p class="chat-msg__ask-title">Report this message?</p>
      <div class="chat-msg__ask-actions">
        <button
          type="button"
          class="chat-msg__ask-yes"
          data-testid="report-message-confirm"
          @click="confirmReport"
        >
          Report to admin
        </button>
        <button type="button" class="chat-msg__action" @click="asking = false">Cancel</button>
      </div>
    </div>
  </li>
</template>

<style scoped>
.chat-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: var(--ds-space-4);
}

.chat-msg.is-mine {
  align-items: flex-end;
}

.chat-msg.is-grouped {
  margin-bottom: var(--ds-space-1);
}

.chat-msg.is-pending .chat-msg__bubble {
  opacity: 0.65;
}

/* The row sets the width limit, not the bubble: a percentage on a bubble
   inside a shrinking row made short words break after every letter */
.chat-msg__row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-1);
  max-width: min(36rem, 85%);
}

.chat-msg.is-mine .chat-msg__row {
  justify-content: flex-end;
}

.chat-msg__bubble {
  min-width: 0;
  max-width: 100%;
  margin: 0 0 var(--ds-space-1);
  padding: var(--ds-space-2) var(--ds-space-4);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
  /* Words stay whole; only a word too long for the bubble (a link) breaks */
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

.chat-msg.is-mine .chat-msg__bubble {
  background: var(--ds-action);
  color: var(--ds-on-action);
}

.chat-msg__bubble--removed,
.chat-msg.is-mine .chat-msg__bubble--removed {
  border: 1px dashed var(--ds-border-control);
  background: transparent;
  color: var(--ds-text-muted);
  font-style: italic;
}

.chat-msg__meta {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}

.chat-msg__meta--failed {
  color: var(--ds-danger);
}

/* Report, Try again, Cancel: quiet words with a tap area around them */
.chat-msg__action {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  min-height: 2rem;
  padding: 0 var(--ds-space-1);
  border: 0;
  border-radius: var(--ds-radius-control);
  background: none;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
  cursor: pointer;
}

.chat-msg__action::after {
  content: '';
  position: absolute;
  inset: -0.375rem -0.25rem;
}

.chat-msg__action:hover {
  color: var(--ds-text);
}

.chat-msg__meta--failed .chat-msg__action {
  color: var(--ds-danger);
}

.chat-msg__action svg,
.chat-msg__flag svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-msg__flag {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  border-radius: var(--ds-radius-round);
  background: none;
  color: var(--ds-text-muted);
  cursor: pointer;
}

.chat-msg__flag:hover {
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
}

.chat-msg__action:focus-visible,
.chat-msg__flag:focus-visible,
.chat-msg__ask-yes:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
}

.chat-msg__reported {
  color: var(--ds-success);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

/* "Report this message?": a small floating panel under the message */
.chat-msg__ask {
  margin-top: var(--ds-space-1);
  padding: var(--ds-space-3);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  box-shadow: var(--ds-elev-2);
}

.chat-msg__ask-title {
  margin: 0 0 var(--ds-space-2);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
}

.chat-msg__ask-actions {
  display: flex;
  gap: var(--ds-space-2);
}

/* Reporting is not the main thing to do, so it is outlined in red, not filled */
.chat-msg__ask-yes {
  min-height: 2rem;
  padding: 0 var(--ds-space-3);
  border: 1px solid var(--ds-danger);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-danger);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  cursor: pointer;
}

.chat-msg__ask-yes:hover {
  background: color-mix(in srgb, var(--ds-danger) 10%, var(--ds-surface));
}
</style>
