<script setup>
// "I found it myself", with one confirm step: the same on the report's details,
// the "No matches yet" panel and under declined claims. Closing a report stops
// its matching, so it asks once first. Only show it while the report is open
// (status 'open'): during a handoff the report is closed by the handoff.
//   busy    true while the report is being closed
//   prompt  words before the link, e.g. "Got it back another way?" (optional)
// Emits close when the owner confirms.
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'

defineProps({
  busy: { type: Boolean, default: false },
  prompt: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const asking = ref(false)

function confirm() {
  asking.value = false
  emit('close')
}
</script>

<template>
  <div v-if="asking" class="close-report__ask" role="group" aria-label="Close this report?">
    <span>Got it back? Closing the report stops its matching.</span>
    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="busy"
      data-testid="found-it-confirm"
      @click="confirm"
    >
      Yes, close it
    </BaseButton>
    <BaseButton variant="link" size="sm" @click="asking = false">Keep it open</BaseButton>
  </div>
  <p v-else class="close-report">
    <template v-if="prompt">{{ prompt }} </template>
    <button type="button" class="close-report__link" data-testid="found-it" @click="asking = true">
      I found it myself
    </button>
  </p>
</template>

<style scoped>
.close-report {
  margin: 0;
  color: var(--fi-mist);
  font-size: 0.9rem;
}

.close-report__link {
  padding: 0.2rem 0;
  border: 0;
  background: none;
  color: var(--fi-mist);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.close-report__link:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

.close-report__ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  font-size: 0.9rem;
}

/* Inside a rebuilt page (class="ds", the Matches page): the design system's
   quiet link, with a 44px tap target. The finds page keeps the look above. */
.ds .close-report,
.ds .close-report__ask {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.ds .close-report__ask {
  gap: var(--ds-space-2) var(--ds-space-3);
}

.ds .close-report__link {
  position: relative;
  color: var(--ds-text-muted);
  text-decoration-thickness: 1px;
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

.ds .close-report__link:hover {
  color: var(--ds-text);
  text-decoration-thickness: 2px;
}

.ds .close-report__link::after {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  height: var(--ds-control-h);
  translate: 0 -50%;
}

.ds .close-report__link:focus-visible {
  outline-color: var(--ds-focus);
}
</style>
