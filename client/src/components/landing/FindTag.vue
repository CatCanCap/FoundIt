<script setup>
// One of the newest finds on the landing page, as a luggage tag hanging on a
// string from the rail along the top of the row. The whole tag links to the
// find's page. It shows the picture and name, and where and when it was
// handed in only when the find's place isn't private (the
// "Private places" rule, server/lib/item-privacy.js; NewestFinds works out the words).
//
// It swings on the same pendulum as the Matches rail (utils/pendulum.js): it
// swings in gently when the row first shows, a passing mouse sways it, and
// moving to it with the keyboard gives it a small push. On hover it lifts a
// little and the picture leans in. Still with less motion asked for.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'
import { mainColour } from '@/utils/design'
import { isAtRest, stepPendulum } from '@/utils/pendulum'

const props = defineProps({
  item: { type: Object, required: true },
  // "LKS Library · Level 2" and "2 h ago", or '' for a private place
  place: { type: String, default: '' },
  when: { type: String, default: '' },
})

const photoFailed = ref(false)

// ---- The swing (as in components/matches/ReportTag.vue) ---------------------

const swingEl = ref(null)
let state = { angle: 0, speed: 0 }
let frame = null
let lastTime = null
let moves = false

function draw() {
  if (swingEl.value) {
    swingEl.value.style.transform = state.angle ? `rotate(${state.angle.toFixed(2)}deg)` : ''
  }
}

function tick(time) {
  const dt = lastTime === null ? 0 : (time - lastTime) / 1000
  lastTime = time
  state = stepPendulum(state, dt)
  if (isAtRest(state)) {
    state = { angle: 0, speed: 0 }
    frame = null
    lastTime = null
  } else {
    frame = requestAnimationFrame(tick)
  }
  draw()
}

// A push in degrees a second: positive swings the bottom left
function nudge(speed, most = 120) {
  if (!moves) return
  state = { angle: state.angle, speed: Math.max(-most, Math.min(most, state.speed + speed)) }
  if (frame === null) frame = requestAnimationFrame(tick)
}

// A mouse brushing past pushes the bottom the way it was going
function brush(event) {
  if (event.pointerType !== 'mouse') return
  const box = event.currentTarget.getBoundingClientRect()
  nudge(event.clientX < box.left + box.width / 2 ? -45 : 45)
}

onMounted(() => {
  moves =
    typeof window.requestAnimationFrame === 'function' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches)
  if (!moves) return
  // Swing in, as if just hung up, each tag a little differently
  state = { angle: (((props.item.id * 7) % 9) - 4) * 1.2, speed: 0 }
  if (state.angle) frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="swingEl" class="find-tag">
    <span class="find-tag__string" aria-hidden="true"></span>
    <RouterLink
      :to="`/items/${item.id}/record`"
      class="find-tag__paper"
      data-testid="newest-find"
      @pointerenter="brush"
      @focus="nudge(40)"
    >
      <span class="find-tag__cap" aria-hidden="true"><span class="find-tag__eyelet"></span></span>
      <span class="find-tag__body">
        <span class="find-tag__picture" aria-hidden="true">
          <img
            v-if="item.photoUrl && !photoFailed"
            :src="resizedPhotoUrl(item.photoUrl, 320)"
            alt=""
            loading="lazy"
            @error="photoFailed = true"
          />
          <ItemIcon v-else :category="item.category" :colour="mainColour(item)" :size="44" />
        </span>
        <span class="find-tag__name">{{ item.title }}</span>
        <span v-if="place || when" class="find-tag__stub ds-small ds-muted">
          <span v-if="place" class="find-tag__place">{{ place }}</span>
          <span v-if="when" class="ds-num">{{ when }}</span>
        </span>
      </span>
    </RouterLink>
  </div>
</template>

<style scoped>
/* String and tag swing together from the rail. The script turns this with
   an inline transform while it swings. */
.find-tag {
  display: flex;
  flex-direction: column;
  align-items: center;
  transform-origin: 50% 0;
}

.find-tag__string {
  width: 1.5px;
  height: var(--ds-space-5);
  background: var(--ds-border-control);
}

.find-tag__paper {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: -0.6rem;
  color: var(--ds-text);
  text-decoration: none;
  transform-origin: 50% 0.6rem;
  transition: transform var(--ds-dur-base) var(--ds-ease-out);
}

/* Hover: the tag lifts and tips a little from its eyelet, the picture leans
   in and the name underlines */
.find-tag__paper:hover {
  --tag-edge: var(--ds-text-muted);
  color: var(--ds-text);
  transform: translateY(-3px) rotate(-1.5deg);
}

.find-tag__paper:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: 3px;
  border-radius: var(--ds-radius-surface);
}

.find-tag__cap {
  position: relative;
  height: 1.25rem;
  background: var(--tag-edge, var(--ds-border-control));
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
}

.find-tag__cap::before {
  content: '';
  position: absolute;
  inset: 1px 1px 0;
  background: var(--ds-surface);
  clip-path: inherit;
}

.find-tag__eyelet {
  position: absolute;
  top: 0.3rem;
  left: 50%;
  z-index: 1;
  width: 0.75rem;
  height: 0.75rem;
  border: 3px solid var(--ds-text-muted);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  transform: translateX(-50%);
}

.find-tag__body {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
  gap: var(--ds-space-2);
  padding: var(--ds-space-1) var(--ds-space-3) var(--ds-space-3);
  border: 1px solid var(--tag-edge, var(--ds-border-control));
  border-top: 0;
  border-radius: 0 0 var(--ds-radius-surface) var(--ds-radius-surface);
  background: var(--ds-surface);
}

.find-tag__picture {
  display: grid;
  place-items: center;
  height: 6rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.find-tag__picture img,
.find-tag__picture :deep(svg) {
  transition: scale var(--ds-dur-slow) var(--ds-ease-out);
}

.find-tag__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.find-tag__paper:hover .find-tag__picture img,
.find-tag__paper:hover .find-tag__picture :deep(svg) {
  scale: 1.08;
}

/* Always two lines tall, so every tag is the same height */
.find-tag__name {
  display: -webkit-box;
  min-height: calc(2em * var(--ds-leading-small));
  overflow: hidden;
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  font-weight: var(--ds-weight-bold);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.find-tag__paper:hover .find-tag__name {
  text-decoration-line: underline;
}

/* Under a perforation: where and when, for a find whose place isn't private */
.find-tag__stub {
  display: grid;
  margin-top: auto;
  padding-top: var(--ds-space-2);
  border-top: 1px dashed var(--tag-edge, var(--ds-border-control));
}

.find-tag__place {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .find-tag__paper:hover {
    transform: none;
  }

  .find-tag__paper:hover .find-tag__picture img,
  .find-tag__paper:hover .find-tag__picture :deep(svg) {
    scale: none;
  }
}
</style>
