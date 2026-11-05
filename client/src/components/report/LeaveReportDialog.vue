<script setup>
// "Leave this report?" asked inside the page, instead of the browser's own
// OK / Cancel box. Shown by a report form when someone tries to leave with
// something filled in.
//   <LeaveReportDialog v-if="asking" @stay="..." @leave="..." />
// "Keep editing" is the main button and has focus first, so Enter or Escape
// keeps the work. Tab stays inside the dialog while it is open, and focus goes
// back to where it was when it closes.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const emit = defineEmits(['stay', 'leave'])

const panel = ref(null)
// Whatever had focus before the dialog opened (often the link that was clicked)
let focusedBefore = null

function buttons() {
  return [...(panel.value?.querySelectorAll('button') || [])]
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('stay')
    return
  }
  if (event.key !== 'Tab') return
  // Keep Tab and Shift+Tab going round the two buttons
  const list = buttons()
  if (list.length === 0) return
  const first = list[0]
  const last = list.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  focusedBefore = document.activeElement
  panel.value?.querySelector('[data-testid="leave-stay"]')?.focus()
})

onBeforeUnmount(() => {
  focusedBefore?.focus?.()
})
</script>

<template>
  <!-- Clicking outside the panel keeps the work, like Keep editing -->
  <div class="leave-backdrop" data-testid="leave-dialog" @click.self="emit('stay')">
    <div
      ref="panel"
      class="leave-panel ds-arrive"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="leave-title"
      aria-describedby="leave-text"
      @keydown="onKeydown"
    >
      <h2 id="leave-title" class="ds-h3">Leave this report?</h2>
      <p id="leave-text" class="ds-muted">What you’ve filled in won’t be saved.</p>
      <div class="leave-actions">
        <BaseButton variant="secondary" data-testid="leave-go" @click="emit('leave')">
          Leave
        </BaseButton>
        <BaseButton data-testid="leave-stay" @click="emit('stay')">Keep editing</BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Shown inside a rebuilt page (class="ds"), so it uses the design tokens.
   The page behind is dimmed with the navy of the bands. */
.leave-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1050;
  display: grid;
  place-items: center;
  padding: var(--ds-gutter);
  background: color-mix(in srgb, var(--ds-band) 55%, transparent);
}

.leave-panel {
  display: grid;
  gap: var(--ds-space-3);
  width: 100%;
  max-width: 26rem;
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  box-shadow: var(--ds-elev-2);
  color: var(--ds-text);
}

/* Leave, then Keep editing on the right; on a narrow phone they stack with
   Keep editing on top, nearest the thumb's first reach */
.leave-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ds-space-3);
  margin-top: var(--ds-space-2);
}

@media (max-width: 399.98px) {
  .leave-actions {
    flex-direction: column-reverse;
  }
}
</style>
