<script setup>
// Drawing of an item, shown when there is no photo.
//   category  picks the drawing
//   colour    main colour name (neutral grey without one)
//   size      pixels (default 48)
//   tone      any CSS colour, overrides colour
import { computed } from 'vue'
import { categoryIcon, itemIconColour } from '@/utils/design'

const props = defineProps({
  category: { type: String, default: '' },
  size: { type: Number, default: 48 },
  colour: { type: String, default: '' },
  tone: { type: String, default: '' },
})

const icon = computed(() => categoryIcon(props.category))
const drawColour = computed(() => props.tone || itemIconColour(props.colour))
</script>

<template>
  <svg
    class="fi-item-icon"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    role="img"
    :aria-label="category || 'Item'"
    :style="{ color: drawColour }"
    :data-icon="icon"
  >
    <template v-if="icon === 'bottle'">
      <rect x="18" y="4" width="12" height="7" rx="2" fill="currentColor" />
      <rect x="15" y="10" width="18" height="34" rx="5" fill="currentColor" />
      <rect x="15" y="18" width="18" height="3" fill="#fff" opacity="0.45" />
    </template>
    <template v-else-if="icon === 'card'">
      <rect x="4" y="11" width="40" height="27" rx="4" fill="currentColor" />
      <rect x="4" y="17" width="40" height="5" fill="#fff" opacity="0.4" />
      <rect x="9" y="28" width="12" height="4" rx="1.5" fill="#fff" opacity="0.8" />
    </template>
    <template v-else-if="icon === 'wallet'">
      <rect x="5" y="12" width="38" height="26" rx="5" fill="currentColor" />
      <rect x="28" y="20" width="15" height="10" rx="3" fill="#fff" opacity="0.5" />
      <circle cx="33" cy="25" r="2" fill="currentColor" />
    </template>
    <template v-else-if="icon === 'umbrella'">
      <path d="M4 24a20 18 0 0 1 40 0z" fill="currentColor" />
      <path
        d="M24 24v14a4 4 0 0 1-8 0"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </template>
    <template v-else-if="icon === 'earbuds'">
      <rect
        x="7"
        y="15"
        width="34"
        height="20"
        rx="10"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      />
      <path d="M7 24h34" stroke="currentColor" stroke-width="2" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'keys'">
      <circle cx="15" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="4" />
      <path d="M22 22l18 18" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
      <path d="M34 34l-4 4M38 38l-3 3" stroke="currentColor" stroke-width="3" />
    </template>
    <template v-else-if="icon === 'laptop'">
      <rect x="9" y="10" width="30" height="21" rx="2.5" fill="currentColor" />
      <rect x="4" y="33" width="40" height="4" rx="2" fill="currentColor" />
    </template>
    <template v-else-if="icon === 'phone'">
      <rect x="14" y="4" width="20" height="40" rx="4" fill="currentColor" />
      <rect x="21" y="38" width="6" height="2" rx="1" fill="#fff" opacity="0.6" />
    </template>
    <template v-else-if="icon === 'charger'">
      <rect x="14" y="16" width="20" height="18" rx="4" fill="currentColor" />
      <path d="M19 8v8M29 8v8" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <path d="M24 34v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </template>
    <template v-else-if="icon === 'bag'">
      <path d="M17 17v-4a7 7 0 0 1 14 0v4" fill="none" stroke="currentColor" stroke-width="3" />
      <rect x="8" y="16" width="32" height="26" rx="5" fill="currentColor" />
    </template>
    <template v-else>
      <!-- Any other category: a plain luggage tag -->
      <path
        d="M12 6h18l10 10v24a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"
        fill="currentColor"
      />
      <circle cx="30" cy="15" r="3" fill="#fff" />
    </template>
  </svg>
</template>

<style scoped>
.fi-item-icon {
  display: block;
  flex-shrink: 0;
  /* A thin dark edge, so a white or beige item still shows on the cream page */
  filter: drop-shadow(0 0 0.5px rgb(20 26 64 / 55%));
}

/* At night, a light edge, so a black or navy item still shows on navy */
:root[data-theme='night'] .fi-item-icon {
  filter: drop-shadow(0 0 0.5px rgb(238 240 248 / 70%));
}
</style>
