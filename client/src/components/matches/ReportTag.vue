<script setup>
// One lost report in the Matches page's rail, drawn as a small luggage tag
// hanging on a string from a pin, like the feed's tags: cut top corners and an
// eyelet, the photo (or a drawing in the item's colour), the name, and a stub
// under a perforation with how many finds look like it and the best match.
// It is a tab: picking it shows the report under the rail.
//
// Tag and string swing together from the pin, with the sign-in tag's
// pendulum (utils/pendulum.js): a mouse brushing past sways it, picking it
// sets it swinging as it drops lower on a longer string, its top turning
// navy, and the rail sways it while it scrolls (nudge). People who ask their
// device for less motion, and the unit tests, get still tags.
//   report    from GET /api/matches/mine: { item, matches }
//   current   true for the report being shown
//   tone      the colour to draw the item in when there is no photo
//   panelId   the id of the panel that shows the picked report
// Emits select.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'
import { reportKind, reportTagLabel } from '@/utils/matches'
import { isAtRest, stepPendulum } from '@/utils/pendulum'

const props = defineProps({
  report: { type: Object, required: true },
  current: { type: Boolean, default: false },
  tone: { type: String, default: '' },
  panelId: { type: String, required: true },
})

const emit = defineEmits(['select'])

const photoFailed = ref(false)
const kind = computed(() => reportKind(props.report))
const label = computed(() => reportTagLabel(props.report))
// The best match, only while there are finds to check (the list comes best first)
const score = computed(() =>
  kind.value === 'finds' ? `${Math.round(props.report.matches[0].score)}%` : '',
)

// ---- The swing -------------------------------------------------------------

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

// Give the tag a push, in degrees a second: positive swings its bottom left.
// `most` caps the speed, so many small pushes (a scroll) add up to a sway.
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

// Picked: it swings as it drops on its longer string
watch(
  () => props.current,
  (now) => {
    if (now) nudge(80)
  },
)

onMounted(() => {
  moves =
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches)
  if (!moves) return
  // Swing in gently, as if just hung up, each tag a little differently
  state = { angle: (((props.report.item.id * 7) % 9) - 4) * 0.9, speed: 0 }
  if (state.angle) frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})

defineExpose({ nudge })
</script>

<template>
  <li class="report-tag" :class="[`is-${kind}`, { 'is-current': current }]" role="presentation">
    <div ref="swingEl" class="report-tag__swing">
      <span class="report-tag__pin" aria-hidden="true"></span>
      <span class="report-tag__string" aria-hidden="true"></span>
      <button
        :id="`report-tab-${report.item.id}`"
        type="button"
        role="tab"
        class="report-tag__paper"
        :aria-selected="current ? 'true' : 'false'"
        :aria-controls="panelId"
        :tabindex="current ? 0 : -1"
        data-testid="report-item"
        @pointerenter="brush"
        @click="emit('select', report)"
      >
        <span class="report-tag__cap" aria-hidden="true">
          <span class="report-tag__eyelet"></span>
        </span>
        <span class="report-tag__body">
          <span
            class="report-tag__picture"
            :class="{ 'has-photo': report.item.photoUrl && !photoFailed }"
            aria-hidden="true"
          >
            <img
              v-if="report.item.photoUrl && !photoFailed"
              :src="resizedPhotoUrl(report.item.photoUrl, 480)"
              alt=""
              loading="lazy"
              @error="photoFailed = true"
            />
            <ItemIcon v-else :category="report.item.category" :size="56" :tone="tone" />
          </span>
          <span class="report-tag__title" data-testid="report-name">{{ report.item.title }}</span>
          <span class="report-tag__stub">
            <span class="report-tag__finds" data-testid="report-finds">{{ label }}</span>
            <span v-if="score" class="report-tag__score">{{ score }}</span>
          </span>
        </span>
      </button>
    </div>
  </li>
</template>

<style scoped>
.report-tag {
  --tag-edge: var(--ds-border-control);
  --tag-top: var(--ds-surface);
  --tag-shadow: color-mix(in srgb, var(--ds-band) 10%, transparent);
  --string: var(--ds-border-control);
  /* How far below its pin the tag hangs; the report shown hangs lower */
  --drop: 1.5rem;
  display: flex;
  flex: 0 0 auto;
  width: 13rem;
  scroll-snap-align: start;
}

.report-tag.is-current {
  --tag-edge: var(--ds-action);
  --tag-top: var(--ds-action);
  --tag-shadow: color-mix(in srgb, var(--ds-band) 22%, transparent);
  --string: var(--ds-action);
  --drop: 2.75rem;
}

/* Pin, string and tag swing together from the pin. The script turns this
   with an inline transform while it swings. */
.report-tag__swing {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  transform-origin: 50% 0.25rem;
}

/* The pin the string hangs from */
.report-tag__pin {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--string);
  transition: background-color var(--ds-dur-base) var(--ds-ease-out);
}

/* The string, down into the eyelet. It lengthens with a little bounce when
   the tag is picked, so the tag drops towards its report. */
.report-tag__string {
  flex-shrink: 0;
  width: 1.5px;
  height: var(--drop);
  margin-top: -0.25rem;
  background: var(--string);
  transition:
    height var(--ds-dur-slow) var(--ds-ease-press),
    background-color var(--ds-dur-base) var(--ds-ease-out);
}

/* The whole tag is the button. Its shadow follows the cut corners and deepens
   on hover; the top of the tag sits over the end of the string. */
.report-tag__paper {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: -0.85rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  filter: drop-shadow(0 1px 2px var(--tag-shadow)) drop-shadow(0 4px 10px var(--tag-shadow));
  -webkit-tap-highlight-color: transparent;
  transition:
    filter var(--ds-dur-base) var(--ds-ease-out),
    transform var(--ds-dur-fast) var(--ds-ease-press);
}

.report-tag__paper:hover {
  --tag-shadow: color-mix(in srgb, var(--ds-band) 20%, transparent);
  --tag-edge: var(--ds-text-muted);
}

.report-tag.is-current .report-tag__paper:hover {
  --tag-edge: var(--ds-action);
}

/* Pressed: a small tug down on the string */
.report-tag__paper:active {
  transform: translateY(2px);
}

.report-tag__paper:focus-visible {
  outline: 3px solid var(--ds-focus);
  outline-offset: 3px;
}

/* The top of the tag, with cut corners: the edge colour, with the paper
   1px inside it so the cut corners have an edge too */
.report-tag__cap {
  position: relative;
  height: 1.5rem;
  background: var(--tag-edge);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.report-tag__cap::before {
  content: '';
  position: absolute;
  inset: 1px 1px 0;
  background: var(--tag-top);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
  transition: background-color var(--ds-dur-base) var(--ds-ease-out);
}

/* The ring the string goes through */
.report-tag__eyelet {
  position: absolute;
  top: 0.35rem;
  left: 50%;
  z-index: 1;
  width: 0.875rem;
  height: 0.875rem;
  margin-left: -0.4375rem;
  border: 3px solid var(--ds-text-muted);
  border-radius: 50%;
  background: var(--ds-canvas);
}

.report-tag.is-current .report-tag__eyelet {
  border-color: var(--ds-on-action);
}

.report-tag__body {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
  gap: var(--ds-space-2);
  padding: var(--ds-space-2) var(--ds-space-4) var(--ds-space-4);
  border: 1px solid var(--tag-edge);
  border-top: 0;
  border-radius: 0 0 var(--ds-radius-surface) var(--ds-radius-surface);
  background: var(--ds-surface);
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.report-tag__picture {
  display: grid;
  place-items: center;
  height: 7rem;
  margin-bottom: var(--ds-space-1);
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
  color: var(--ds-text-muted);
}

.report-tag__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.report-tag__title {
  display: -webkit-box;
  overflow: hidden;
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  /* Always two lines tall, so every tag is the same height */
  min-height: 2.7em;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.report-tag__paper:hover .report-tag__title {
  text-decoration-line: underline;
}

/* The stub, under a perforation: how many finds, and the best match */
.report-tag__stub {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-2);
  margin-top: auto;
  padding-top: var(--ds-space-2);
  border-top: 1px dashed var(--tag-edge);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  font-weight: var(--ds-weight-bold);
  white-space: nowrap;
}

.report-tag__finds {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Gold means a match: a dot before the count of finds */
.report-tag.is-finds .report-tag__finds {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  color: var(--ds-signal-text);
}

.report-tag.is-finds .report-tag__finds::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--ds-signal);
}

.report-tag.is-back .report-tag__finds {
  color: var(--ds-action);
}

.report-tag.is-none .report-tag__finds {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-medium);
}

.report-tag__score {
  color: var(--ds-text);
  font-variant-numeric: tabular-nums;
}

/* Phones: three tags across, with the edge of a fourth showing when there are
   more, so the rail leaves room for the report under it */
@media (max-width: 575.98px) {
  .report-tag {
    width: 6.75rem;
  }

  .report-tag.is-current {
    --drop: 2.25rem;
  }

  .report-tag__picture {
    height: 4rem;
    margin-bottom: 0;
  }

  .report-tag__picture .fi-item-icon {
    width: 2.5rem;
    height: 2.5rem;
  }

  .report-tag__body {
    padding: var(--ds-space-2);
  }

  .report-tag__title {
    font-size: var(--ds-size-caption);
  }

  .report-tag__stub {
    font-size: var(--ds-size-caption);
  }
}

/* Less motion: the tags hang still, and the picked one drops without the
   bounce */
@media (prefers-reduced-motion: reduce) {
  .report-tag__string {
    transition: background-color var(--ds-dur-base) var(--ds-ease-out);
  }

  .report-tag__paper:active {
    transform: none;
  }
}
</style>
