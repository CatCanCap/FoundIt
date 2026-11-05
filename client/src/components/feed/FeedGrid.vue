<script setup>
// WS2. The feed's items as luggage tags standing in a grid, its usual view:
// one FeedTag per item, 2 across on a phone and 4 from 768px (beside the
// categories from 1024px), so a page of 8 is two rows on a laptop. Tapping a
// tag turns it over to show its back; one tag at a time. Tapping anywhere
// else, Esc, another page or another filter turns it back. When the page,
// side or category changes, the tags arrive one after another. The compact
// view is FeedList.
//   tags      one per item, the FeedTag props worked out by the feed page
//   type      'found' or 'lost'
//   swapKey   the tags arrive again whenever this changes
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FeedTag from '@/components/feed/FeedTag.vue'

const props = defineProps({
  tags: { type: Array, required: true },
  type: { type: String, required: true },
  swapKey: { type: String, required: true },
})

// The feed page scrolls back up to the grid after a page change
const listEl = ref(null)
defineExpose({ listEl })

// The id of the tag showing its back, if any
const turned = ref(null)
watch(
  () => props.swapKey,
  () => (turned.value = null),
)

// A tap outside the turned tag turns it back
function onPointerDown(event) {
  if (turned.value !== null && !event.target.closest?.('.feed-tag.is-turned')) {
    turned.value = null
  }
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <ul :key="swapKey" ref="listEl" class="feed-grid" :class="`is-${type}`" data-testid="feed-list">
    <!-- FeedTag passes these attributes on to its front -->
    <FeedTag
      v-for="(tag, index) in tags"
      :key="tag.id"
      v-bind="tag"
      :hangs="false"
      flips
      :flipped="turned === tag.id"
      class="ds-enter"
      :style="{ '--i': index }"
      :data-testid="`feed-card-${tag.id}`"
      @turn="(on) => (turned = on ? tag.id : null)"
    />
  </ul>
</template>

<style scoped>
.feed-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ds-space-5) var(--ds-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 768px) {
  .feed-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ds-space-6) var(--ds-space-4);
  }
}
</style>
