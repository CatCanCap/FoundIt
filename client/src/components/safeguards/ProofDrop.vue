<script setup>
// "Drop photos here, or browse your files" (Figma v3 V14 and V15). The person
// drops a photo or picks one; the page uploads it and passes back the name.
// Used by the dispute form and by the claimer's reply on My disputes.
import { ref } from 'vue'
import { PHOTO_HINT } from '@/services/cloudinary'

const props = defineProps({
  id: { type: String, required: true },
  busy: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  testid: { type: String, default: '' },
})
const emit = defineEmits(['file'])

const isOver = ref(false)

function choose(event) {
  const file = event.target.files?.[0]
  if (file) emit('file', file)
}

function drop(event) {
  isOver.value = false
  if (props.busy) return
  const file = [...(event.dataTransfer?.files || [])].find((entry) =>
    entry.type.startsWith('image/'),
  )
  if (file) emit('file', file)
}
</script>

<template>
  <label
    :for="id"
    class="sg-drop"
    :class="{ 'is-over': isOver }"
    @dragover.prevent="isOver = true"
    @dragleave="isOver = false"
    @drop.prevent="drop"
  >
    <svg class="sg-drop-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M4 8h3l1.5-2h7L17 8h3v11H4z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
    </svg>
    <span class="sg-drop-title">
      <template v-if="busy">Uploading…</template>
      <template v-else-if="fileName">Added {{ fileName }}</template>
      <template v-else>Drop a photo here, or browse your files</template>
    </span>
    <span class="ds-small ds-muted">A photo of it, or a receipt. Optional. {{ PHOTO_HINT }}</span>
    <input
      :id="id"
      type="file"
      accept="image/*"
      :disabled="busy"
      :data-testid="testid || undefined"
      @change="choose"
    />
  </label>
</template>
