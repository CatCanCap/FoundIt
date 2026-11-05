<script setup>
// Shows a photo large over the page, so an admin never leaves a case to look at
// proof. It is a real dialog: focus stays inside while it is open, Esc closes
// it, and focus goes back to the photo that opened it. Clicking outside the
// picture closes it too. The box is the same size for every photo: the photo
// is fitted inside it, never cropped, so a small or tall photo doesn't change it.
// Put one on the page and call open(url, label) through a template ref.
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const dialog = ref(null)
const url = ref('')
const label = ref('')
const failed = ref(false)

function open(photoUrl, photoLabel = 'Photo') {
  url.value = photoUrl
  label.value = photoLabel
  failed.value = false
  if (dialog.value?.showModal) dialog.value.showModal()
  else dialog.value?.setAttribute('open', '')
}

function close() {
  if (dialog.value?.close) dialog.value.close()
  else dialog.value?.removeAttribute('open')
}

// A click on the dialog itself, not on anything in it, landed on the backdrop
function onClick(event) {
  if (event.target === dialog.value) close()
}

defineExpose({ open, close })
</script>

<template>
  <dialog
    ref="dialog"
    class="viewer"
    :aria-label="label"
    data-testid="photo-viewer"
    @click="onClick"
  >
    <figure class="viewer__frame">
      <div class="viewer__stage">
        <img v-if="!failed" :src="url" :alt="label" @error="failed = true" />
        <p v-else class="viewer__failed" role="alert">This photo could not be loaded.</p>
      </div>
      <figcaption class="viewer__bar">
        <span>{{ label }}</span>
        <BaseButton variant="secondary" data-testid="photo-viewer-close" @click="close">
          Close
        </BaseButton>
      </figcaption>
    </figure>
  </dialog>
</template>

<style scoped>
.viewer {
  /* A fixed width, not the photo's own, so every photo opens in the same box */
  width: min(56rem, calc(100vw - 2 * var(--ds-space-4)));
  max-width: none;
  max-height: calc(100dvh - 2 * var(--ds-space-4));
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  color: var(--ds-text);
  box-shadow: var(--ds-elev-2);
}

.viewer::backdrop {
  background: color-mix(in srgb, var(--ds-band) 75%, transparent);
}

.viewer[open] {
  animation: viewer-in var(--ds-dur-base) var(--ds-ease-out);
}

@keyframes viewer-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
}

.viewer__frame {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 2 * var(--ds-space-4));
  margin: 0;
}

.viewer__stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  /* On a short screen the box gets shorter, leaving room for the bar */
  max-height: calc(100dvh - 2 * var(--ds-space-4) - 5rem);
  background: var(--ds-surface-tile);
}

.viewer__stage img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.viewer__failed {
  margin: 0;
  padding: var(--ds-space-7) var(--ds-space-6);
  color: var(--ds-text-muted);
  text-align: center;
}

.viewer__bar {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-4);
  padding: var(--ds-space-3) var(--ds-space-4);
  font-weight: var(--ds-weight-bold);
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .viewer[open] {
    animation: none;
  }
}
</style>
