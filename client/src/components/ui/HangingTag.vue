<script setup>
// A paper tag on a string that can be dragged and swings back.
//   stamp  optional text in the round stamp
//   tilt   resting tilt in degrees (0 on small screens)
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { angleFromPivot, clampAngle, isAtRest, stepPendulum } from '@/utils/pendulum'

defineProps({
  stamp: { type: String, default: '' },
  tilt: { type: Number, default: -3 },
})

const root = ref(null)
const swing = ref(null)
const dragging = ref(false)

let state = { angle: 0, speed: 0 }
let frame = null
let lastTime = null
let reducedMotion = false
let drag = null

// Clicks on these work as usual and never move the tag
const INTERACTIVE = 'input, textarea, select, button, a, label'

function draw() {
  if (swing.value) swing.value.style.transform = `rotate(${state.angle.toFixed(3)}deg)`
}

function tick(time) {
  const dt = lastTime === null ? 0 : (time - lastTime) / 1000
  lastTime = time
  if (!drag) state = stepPendulum(state, dt)
  draw()
  if (drag || !isAtRest(state)) {
    frame = requestAnimationFrame(tick)
  } else {
    state = { angle: 0, speed: 0 }
    draw()
    frame = null
    lastTime = null
  }
}

function startMotion() {
  if (frame === null) frame = requestAnimationFrame(tick)
}

// Give the tag a push: positive swings its bottom left, negative right
function nudge(speed = 70) {
  if (reducedMotion) return
  state = { angle: state.angle, speed: state.speed + speed }
  startMotion()
}

function pivot() {
  const box = root.value.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top }
}

function onPointerDown(event) {
  if (reducedMotion || event.button > 0 || event.target.closest(INTERACTIVE)) return
  const point = { x: event.clientX, y: event.clientY }
  drag = {
    id: event.pointerId,
    start: point,
    startTime: performance.now(),
    // Keep the tag where it is under the pointer instead of jumping
    offset: state.angle - angleFromPivot(pivot(), point),
    lastAngle: state.angle,
    lastTime: performance.now(),
    moved: false,
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  dragging.value = true
  startMotion()
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return
  const point = { x: event.clientX, y: event.clientY }
  if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 4) drag.moved = true
  if (!drag.moved) return

  const angle = clampAngle(angleFromPivot(pivot(), point) + drag.offset)
  const now = performance.now()
  const dt = Math.max((now - drag.lastTime) / 1000, 1 / 240)
  // Remember how fast it was moving, so letting go mid-swing throws it
  const speed = (angle - drag.lastAngle) / dt
  state = { angle, speed: state.speed * 0.5 + speed * 0.5 }
  drag.lastAngle = angle
  drag.lastTime = now
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return
  const wasTap = !drag.moved && performance.now() - drag.startTime < 400
  if (wasTap) {
    // Tapping the right half pushes the bottom left, and the left half right
    const side = Math.sign(event.clientX - pivot().x) || 1
    state = { angle: state.angle, speed: state.speed + side * 80 }
  }
  drag = null
  dragging.value = false
  startMotion()
}

onMounted(() => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (reducedMotion) return
  // Swing in gently, as if just hung up
  state = { angle: 7, speed: 0 }
  startMotion()
})

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})

defineExpose({ nudge })
</script>

<template>
  <div ref="root" class="fi-hanging" :style="{ '--tilt': `${tilt}deg` }">
    <div
      ref="swing"
      class="fi-hanging__swing"
      :class="{ 'fi-hanging__swing--dragging': dragging }"
      data-testid="hanging-tag"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="fi-hanging__string" aria-hidden="true"></span>
      <div class="fi-hanging__tag">
        <span class="fi-hanging__eyelet" aria-hidden="true"></span>
        <Transition name="fi-stamp" mode="out-in">
          <span v-if="stamp" :key="stamp" class="fi-hanging__stamp" aria-hidden="true">{{
            stamp
          }}</span>
        </Transition>
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.fi-hanging {
  position: relative;
  width: 100%;
  max-width: 26rem;
}

/* String and tag swing together from the top of the string */
.fi-hanging__swing {
  position: relative;
  padding-top: 3rem;
  transform-origin: 50% 0;
  cursor: grab;
  /* Sideways drags move the tag; up and down still scroll the page */
  touch-action: pan-y;
  will-change: transform;
}

.fi-hanging__swing--dragging {
  cursor: grabbing;
  user-select: none;
}

/* Fields, buttons and links inside keep their own pointer */
.fi-hanging__swing :deep(:is(input, textarea, select)) {
  cursor: text;
}

.fi-hanging__swing :deep(:is(button, a, label)) {
  cursor: pointer;
}

.fi-hanging__string {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1.5px;
  height: 3.6rem;
  background: rgb(238 240 248 / 55%);
}

.fi-hanging__tag {
  position: relative;
  padding: 2.75rem 1.75rem 1.75rem;
  background: #ffffff; /* white card on the navy band (SMU blue and white) */
  color: #141a3f;
  border-radius: 6px var(--fi-radius-sm) var(--fi-radius-sm) var(--fi-radius-sm);
  box-shadow: var(--fi-shadow-lift);
  transform: rotate(var(--tilt));
  transform-origin: 50% 0;
}

.fi-hanging__eyelet {
  position: absolute;
  top: 0.75rem;
  left: 50%;
  width: 1.1rem;
  height: 1.1rem;
  margin-left: -0.55rem;
  border: 3px solid #141a3f;
  border-radius: 50%;
  background: #0a1030;
}

.fi-hanging__stamp {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: grid;
  place-items: center;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0.5rem;
  border: 2px solid rgb(184 137 42 / 70%);
  border-radius: 50%;
  color: rgb(184 137 42 / 85%);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
  transform: rotate(12deg);
}

/* A new stamp is pressed on: it fades in from slightly larger */
.fi-stamp-enter-active,
.fi-stamp-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.fi-stamp-enter-from {
  opacity: 0;
  transform: rotate(12deg) scale(1.35);
}

.fi-stamp-leave-to {
  opacity: 0;
  transform: rotate(12deg) scale(0.9);
}

@media (max-width: 575.98px) {
  /* Hang straight on a phone, where the tag fills the width */
  .fi-hanging__tag {
    --tilt: 0deg;
    padding: 2.5rem 1.25rem 1.25rem;
  }

  .fi-hanging__stamp {
    width: 3.5rem;
    height: 3.5rem;
    font-size: 0.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fi-hanging__swing {
    cursor: auto;
  }

  .fi-stamp-enter-active,
  .fi-stamp-leave-active {
    transition: none;
  }
}
</style>
