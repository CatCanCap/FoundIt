<script setup>
// The latest finds handed in, one at a time, under the headline on the
// sign-in and register pages: a pulsing dot, the find's drawing, its name,
// where and when. A new one slides up every few seconds; pointing at it holds
// it. It links to the feed. It uses the same public lists as the feed
// (GET /api/items?view=feed&type=found and GET /api/spots), and shows
// nothing at all when there are no finds or the server can't be reached.
// Where and when a find was handed in are private (the
// "Private places" rule, server/lib/item-privacy.js), so a visitor mostly sees just the name, with no place or time.
// People who ask their device for less motion get a fade, every few seconds.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import api from '@/api'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { COLOUR_HEX, mainColour, placeName } from '@/utils/design'
import { buildItemParams, describeWhen } from '@/utils/feed'

const SHOWN = 6
const EVERY_MS = 3500

const finds = ref([])
const spotsById = ref(new Map())
const index = ref(0)
let timer = null
let held = false

const current = computed(() => finds.value[index.value] || null)
const place = computed(() => {
  const spot = spotsById.value.get(current.value?.trail?.[0]?.spotId)
  return spot ? placeName(spot) : ''
})
const when = computed(() => (current.value ? describeWhen(current.value) : ''))
const tone = computed(() => COLOUR_HEX[mainColour(current.value)] || 'currentColor')

function next() {
  if (!held && finds.value.length > 1) index.value = (index.value + 1) % finds.value.length
}

onMounted(async () => {
  try {
    const [items, spots] = await Promise.all([
      api.get('/items', { params: buildItemParams('found') }),
      api.get('/spots'),
    ])
    spotsById.value = new Map(spots.data.map((spot) => [spot.id, spot]))
    finds.value = items.data
      .filter((item) => item.status === 'open' && item.trail?.length)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, SHOWN)
    timer = setInterval(next, EVERY_MS)
  } catch {
    // Nothing to show: the page reads just as well without it
  }
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <RouterLink
    v-if="current"
    to="/feed"
    class="fi-ticker"
    data-testid="just-found"
    @mouseenter="held = true"
    @mouseleave="held = false"
    @focus="held = true"
    @blur="held = false"
  >
    <span class="fi-ticker__live" aria-hidden="true"></span>
    <span class="fi-ticker__window">
      <Transition name="fi-ticker" mode="out-in">
        <span :key="current.id" class="fi-ticker__find">
          <span class="fi-ticker__icon" :style="{ '--tone': tone }">
            <ItemIcon :category="current.category" :size="22" :tone="tone" />
          </span>
          <span class="fi-ticker__words">
            <strong class="fi-ticker__title">{{ current.title }}</strong>
            <span v-if="place || when" class="fi-ticker__where">
              {{ place }}<template v-if="place && when"> · </template>{{ when }}
            </span>
          </span>
        </span>
      </Transition>
    </span>
    <span class="fi-ticker__arrow" aria-hidden="true">→</span>
  </RouterLink>
</template>

<style scoped>
.fi-ticker {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  max-width: min(100%, 26rem);
  padding: 0.5rem 0.9rem 0.5rem 0.75rem;
  border: 1px solid rgb(238 240 248 / 18%);
  border-radius: 999px;
  background: rgb(238 240 248 / 7%);
  color: #fff;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.fi-ticker:hover {
  border-color: rgb(238 240 248 / 40%);
  background: rgb(238 240 248 / 12%);
}

.fi-ticker:focus-visible {
  outline: 3px solid var(--fi-brass);
  outline-offset: 3px;
}

/* A brass dot that keeps pulsing, like a live feed */
.fi-ticker__live {
  position: relative;
  flex-shrink: 0;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--fi-brass);
}

.fi-ticker__live::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--fi-brass);
  animation: fi-ticker-pulse 1.8s ease-out infinite;
}

@keyframes fi-ticker-pulse {
  to {
    opacity: 0;
    transform: scale(2.6);
  }
}

.fi-ticker__window {
  overflow: hidden;
  min-width: 0;
}

.fi-ticker__find {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.fi-ticker__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tone) 18%, #f5f7fb);
}

.fi-ticker__icon :deep(svg) {
  filter: drop-shadow(0 0 0.8px rgb(20 26 63 / 55%));
}

.fi-ticker__words {
  display: grid;
  min-width: 0;
  line-height: 1.25;
}

.fi-ticker__title,
.fi-ticker__where {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fi-ticker__title {
  font-size: 0.92rem;
}

.fi-ticker__where {
  color: rgb(238 240 248 / 70%);
  font-size: 0.8rem;
}

.fi-ticker__arrow {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--fi-brass);
  transition: transform 0.15s ease;
}

.fi-ticker:hover .fi-ticker__arrow {
  transform: translateX(3px);
}

/* Each find slides up out of the window and the next slides in under it */
.fi-ticker-enter-active,
.fi-ticker-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fi-ticker-enter-from {
  opacity: 0;
  transform: translateY(100%);
}

.fi-ticker-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .fi-ticker__live::after {
    animation: none;
  }

  .fi-ticker-enter-from,
  .fi-ticker-leave-to {
    transform: none;
  }
}
</style>
