<script setup>
// WS2. One item on the feed, drawn as a paper luggage tag hanging from a pin
// on a rail: the photo (or a drawing), the title, and a stub at the bottom
// with the status and the item number. Where and when it was found or lost
// are left for the item's page ("See full details").
//
// Pin, string and tag swing together from the pin (utils/pendulum.js, as on
// the Matches page): a mouse brushing past sways it, and the rails sway it
// while they slide to another page (nudge). People who ask their device for
// less motion, and the unit tests, get still tags.
//   id, title, category, photoUrl   the item
//   state                           the item's status (itemState in utils/feed.js)
//   tone                            the colour to draw the item in when there
//                                   is no photo
//   type                            'found' or 'lost'
//   to                              the page the tag links to
//   tilt, drop                      the angle it rests at (the feed hangs it
//                                   straight, at 0) and the length of its string
//   hangs                           false to stand the tag in a grid with no
//                                   pin or string (the feed); it still lifts
//                                   on hover and turns over
//   flips                           true to turn the tag over when tapped,
//                                   instead of opening the item (the feed)
//   flipped                         true while it shows its back
//   description                     shown on the back, at most two lines
//   ask                             the back's question, button, and the
//                                   score or badge on its picture:
//                                   { question, label, to, score, badge } (tagAsk in
//                                   utils/feed.js); with guest (not signed
//                                   in) it shows only "See full details"
// Emits turn with true when tapped to show its back, and false to turn back.
// The back has a bigger photo, the description and a button
// that leads on (to claim it, report it, and so on). A "See full details"
// link under that button opens the item's page. Tapping the back (anywhere but a link) or
// Esc turns it back.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { statusPill, categoryColour, itemNumber } from '@/utils/design'
import { resizedPhotoUrl } from '@/services/cloudinary'
import { isAtRest, stepPendulum } from '@/utils/pendulum'
import { noteCardTap } from '@/utils/item-morph'

// Attributes like data-testid go on the link, not the list item
defineOptions({ inheritAttrs: false })

const props = defineProps({
  id: { type: [Number, String], required: true },
  title: { type: String, required: true },
  category: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  state: { type: String, default: '' },
  tone: { type: String, default: '' },
  type: { type: String, default: 'found' },
  to: { type: [String, Object], required: true },
  tilt: { type: Number, default: 0 },
  drop: { type: Number, default: 40 },
  hangs: { type: Boolean, default: true },
  flips: { type: Boolean, default: false },
  flipped: { type: Boolean, default: false },
  description: { type: String, default: '' },
  ask: { type: Object, default: null },
})

const emit = defineEmits(['turn'])

const photoFailed = ref(false)
const isLost = computed(() => props.type === 'lost')
// The status words. An open lost report says "Still looking", since the usual
// words ("Waiting for its owner") are about found items.
const status = computed(() => {
  if (isLost.value && props.state === 'open') return { label: 'Still looking', tone: 'lost' }
  return props.state ? statusPill(props.state) : null
})
// The item number on the stub, like "0042"
const stubCode = computed(() => itemNumber({ id: props.id }))

// ---- The swing -------------------------------------------------------------

// The tag rests at its own small angle (tilt) and swings around it
const swingEl = ref(null)
const restTurn = computed(() => `rotate(${props.tilt}deg)`)
let swing = { angle: 0, speed: 0 }
let frame = null
let lastTime = null
let moves = false

function draw() {
  if (swingEl.value) {
    swingEl.value.style.transform = `rotate(${(props.tilt + swing.angle).toFixed(2)}deg)`
  }
}

function tick(time) {
  const dt = lastTime === null ? 0 : (time - lastTime) / 1000
  lastTime = time
  swing = stepPendulum(swing, dt)
  if (isAtRest(swing)) {
    swing = { angle: 0, speed: 0 }
    frame = null
    lastTime = null
  } else {
    frame = requestAnimationFrame(tick)
  }
  draw()
}

// Gives the tag a push, in degrees a second (positive swings its bottom
// left). `most` caps the speed, so many small pushes (a slide) add up to a sway.
function nudge(speed, most = 120) {
  if (!moves) return
  swing = { angle: swing.angle, speed: Math.max(-most, Math.min(most, swing.speed + speed)) }
  if (frame === null) frame = requestAnimationFrame(tick)
}

// A mouse brushing past pushes the bottom the way it was going
function brush(event) {
  if (event.pointerType !== 'mouse') return
  const box = event.currentTarget.getBoundingClientRect()
  nudge(event.clientX < box.left + box.width / 2 ? -45 : 45)
}

onMounted(() => {
  // Only a tag on a string swings
  moves =
    props.hangs &&
    typeof window.requestAnimationFrame === 'function' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches)
  if (!moves) return
  // Swings in gently, as if just hung up, each tag a little differently
  swing = { angle: (((Number(props.id) * 7) % 9) - 4) * 0.5, speed: 0 }
  if (swing.angle) frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})

// ---- Turning it over -------------------------------------------------------

const frontEl = ref(null)
const backEl = ref(null)
// The bigger photo only loads once the back has been shown
const backSeen = ref(false)
const backId = computed(() => `feed-tag-back-${props.id}`)
// Asks the feed to turn it over (or back), with a slight sway on its string
function turn(on) {
  nudge(on ? -18 : 18)
  emit('turn', on)
}

// Turned over with the keyboard (Enter or Space give a click with no
// detail), so the focus moves to the back's button. A tap or a mouse click
// leaves it, so no focus ring appears that nobody asked for.
let byKeyboard = false
function onFrontClick(event) {
  if (!props.flips) return
  byKeyboard = event.detail === 0
  turn(true)
}

// Tapping the back turns it back, except on its button or link
// "See full details": the back's picture grows into the item's page
// (utils/item-morph.js)
const backPhotoEl = ref(null)
function rememberTap(event) {
  noteCardTap(event, props.to, backPhotoEl.value, {
    title: props.title,
    category: props.category,
    photoUrl: props.photoUrl && !photoFailed.value ? resizedPhotoUrl(props.photoUrl, 480) : '',
    tone: props.tone,
  })
}

function onBackClick(event) {
  if (!event.target.closest('a, button')) turn(false)
}

// The front is a button that turns it over, not a link
const frontAttrs = computed(() =>
  props.flips
    ? { type: 'button', 'aria-expanded': String(props.flipped), 'aria-controls': backId.value }
    : { to: props.to },
)

// Keyboard focus follows the side shown: to the back's button once it turns
// over, and back to the front if it was on the back when it turns back
watch(
  () => props.flipped,
  (on) => {
    if (on) backSeen.value = true
    const wasOnBack = backEl.value?.contains(document.activeElement)
    nextTick(() => {
      if (on && byKeyboard) backEl.value?.querySelector('a')?.focus()
      else if (wasOnBack) frontEl.value?.focus()
    })
  },
)

defineExpose({ nudge })
</script>

<template>
  <li
    class="feed-tag position-relative d-flex flex-column align-items-center"
    :class="{ 'is-lost': isLost, 'is-turned': flips && flipped, 'is-standing': !hangs }"
    :style="{ '--drop': `${drop}px` }"
  >
    <div
      ref="swingEl"
      class="feed-tag__swing position-relative d-flex flex-column align-items-center w-100"
      :style="{ transform: restTurn }"
    >
      <template v-if="hangs">
        <span class="feed-tag__pin flex-shrink-0 rounded-circle" aria-hidden="true"></span>
        <span class="feed-tag__string flex-shrink-0" aria-hidden="true"></span>
      </template>
      <span class="feed-tag__face d-flex w-100" :inert="(flips && flipped) || undefined">
        <component
          :is="flips ? 'button' : RouterLink"
          ref="frontEl"
          v-bind="{ ...frontAttrs, ...$attrs }"
          class="feed-tag__paper d-flex flex-column w-100 text-decoration-none"
          @pointerenter="brush"
          @click="onFrontClick"
        >
          <span class="feed-tag__cap position-relative" aria-hidden="true">
            <span class="feed-tag__eyelet position-absolute rounded-circle"></span>
          </span>
          <span class="feed-tag__body d-flex flex-column">
            <span
              class="feed-tag__photo position-relative d-grid overflow-hidden"
              :class="{ 'has-photo': photoUrl && !photoFailed }"
              :style="{ '--cat': categoryColour(category) }"
            >
              <img
                v-if="photoUrl && !photoFailed"
                class="position-absolute top-0 start-0 w-100 h-100 object-fit-contain"
                :src="resizedPhotoUrl(photoUrl, 480)"
                alt=""
                loading="lazy"
                data-testid="feed-card-photo"
                @error="photoFailed = true"
              />
              <ItemIcon
                v-else
                :category="category"
                :size="64"
                :tone="tone"
                data-testid="feed-card-icon"
              />
            </span>
            <span class="feed-tag__title" data-testid="feed-card-title">{{ title }}</span>
            <span
              class="feed-tag__stub d-flex flex-wrap flex-sm-nowrap align-items-center justify-content-between"
            >
              <span
                v-if="status"
                class="feed-tag__status"
                :class="`feed-tag__status--${status.tone}`"
                data-testid="feed-card-status"
                >{{ status.label }}</span
              >
              <span class="feed-tag__stub-number" aria-hidden="true">{{ stubCode }}</span>
            </span>
          </span>
        </component>
      </span>

      <!-- The back, in two halves like the front: the item (picture with the
           match score, description), then under a dashed line what to do
           (button, and the quieter link to the item's page) -->
      <div
        v-if="flips"
        :id="backId"
        ref="backEl"
        class="feed-tag__face feed-tag__back position-absolute start-0 bottom-0 w-100"
        :inert="!flipped || undefined"
        role="group"
        :aria-label="`${title}, back of the tag`"
        :data-testid="`feed-back-${id}`"
        @click="onBackClick"
        @keydown.esc="turn(false)"
      >
        <span class="feed-tag__paper d-flex flex-column w-100">
          <span class="feed-tag__cap position-relative" aria-hidden="true">
            <span class="feed-tag__eyelet position-absolute rounded-circle"></span>
          </span>
          <span class="feed-tag__body feed-tag__back-body position-relative d-flex flex-column">
            <span
              ref="backPhotoEl"
              class="feed-tag__photo feed-tag__photo--big position-relative d-grid overflow-hidden"
              :class="{ 'has-photo': photoUrl && !photoFailed }"
              :style="{ '--cat': categoryColour(category) }"
            >
              <img
                v-if="photoUrl && !photoFailed && backSeen"
                class="position-absolute top-0 start-0 w-100 h-100 object-fit-contain"
                :src="resizedPhotoUrl(photoUrl, 720)"
                alt=""
                @error="photoFailed = true"
              />
              <ItemIcon v-else :category="category" :size="84" :tone="tone" aria-hidden="true" />
              <span
                v-if="ask?.score != null"
                class="feed-tag__score position-absolute"
                :data-testid="`feed-back-score-${id}`"
                >{{ ask.score }}% match</span
              >
              <span
                v-else-if="ask?.badge"
                class="feed-tag__score feed-tag__score--mine position-absolute"
                :data-testid="`feed-back-badge-${id}`"
                >{{ ask.badge }}</span
              >
            </span>
            <span class="feed-tag__desc" :data-testid="`feed-back-description-${id}`">{{
              description || 'No description given.'
            }}</span>
            <span class="feed-tag__act d-flex flex-column">
              <!-- Someone not signed in: the item's page is the one way on -->
              <BaseButton
                v-if="ask?.guest"
                :to="to"
                size="sm"
                block
                class="feed-tag__ask"
                :data-testid="`feed-back-details-${id}`"
                @click.capture="rememberTap"
              >
                See full details
                <svg class="feed-tag__arrow" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </BaseButton>
              <template v-else>
                <span v-if="ask?.question" class="feed-tag__question">{{ ask.question }}</span>
                <BaseButton
                  :to="ask?.to || to"
                  size="sm"
                  block
                  class="feed-tag__ask"
                  :data-testid="`feed-back-open-${id}`"
                >
                  {{ ask?.label || 'See details' }}
                </BaseButton>
                <RouterLink
                  :to="to"
                  class="feed-tag__details align-self-center"
                  :data-testid="`feed-back-details-${id}`"
                  @click.capture="rememberTap"
                  >See full details <span aria-hidden="true">→</span></RouterLink
                >
              </template>
            </span>
          </span>
        </span>
      </div>
    </div>
  </li>
</template>

<style scoped>
.feed-tag {
  --navy: var(--fi-ink, #141a3f);
  --lost-ink: var(--lost, #b23e27);
  list-style: none;
}

/* Pin, string and tag swing together from the pin on the rail. The script
   turns this with an inline transform while it swings. */
.feed-tag__swing {
  transform-origin: 50% 4px;
}

/* The pin on the rail the string hangs from */
.feed-tag__pin {
  position: relative;
  z-index: 1;
  width: 10px;
  height: 10px;
  margin-top: -7px;
  background: var(--rail-end, var(--fi-brass-strong));
  box-shadow: 0 0 0 2px var(--fi-page);
}

/* The string from the pin down to the eyelet */
.feed-tag__string {
  width: 1.5px;
  height: var(--drop);
  margin-top: -3px;
  background: var(--rail-end, var(--fi-brass-strong));
}

.feed-tag__paper {
  max-width: 15.125rem;
  margin-top: -14px;
  color: var(--fi-ink);
  /* A solid navy shadow that follows the cut corners */
  filter: drop-shadow(5px 6px 0 var(--navy));
  transition: transform 0.18s ease;
}

/* Hover lifts the tag a little on its string */
.feed-tag__paper:hover {
  transform: translateY(-3px);
}

/* Pressed: a small tug down on the string */
.feed-tag__paper:active {
  transform: translateY(2px);
}

.feed-tag__paper:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 6px;
}

/* The top of the tag, with cut corners. A paler shape sits 1.5px inside a
   navy one, so the cut corners have a border too. */
.feed-tag__cap {
  height: 30px;
  background: var(--navy);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
}

.feed-tag__cap::before {
  content: '';
  position: absolute;
  inset: 1.5px 1.5px 0;
  background: var(--fi-ticket);
  clip-path: polygon(16% 0, 84% 0, 100% 100%, 0 100%);
}

/* The ring the string goes through */
.feed-tag__eyelet {
  top: 7px;
  left: 50%;
  z-index: 1;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  border: 4px solid var(--fi-brass);
  background: var(--fi-page);
}

.feed-tag.is-lost .feed-tag__eyelet {
  border-color: var(--lost-ink);
}

.feed-tag__body {
  gap: 6px;
  padding: 4px 16px 16px;
  border: 1.5px solid var(--navy);
  border-top: 0;
  border-radius: 0 0 10px 10px;
  background: var(--fi-ticket);
}

.feed-tag__photo {
  place-items: center;
  height: 158px;
  margin-bottom: 4px;
  border-radius: 6px;
  /* A pale tint of the category's colour */
  background: color-mix(in srgb, var(--cat) 14%, var(--fi-ticket));
  /* Items with no colour are drawn in grey */
  color: var(--fi-mist);
}

/* A faint outline, so a white drawing still shows on the pale tile */
.feed-tag__photo :deep(svg) {
  filter: drop-shadow(0 0 0.8px rgb(20 26 63 / 55%));
}

/* A photo shows whole on white, so nothing of the item is cut off */
.feed-tag__photo.has-photo {
  background: #fff;
}

.feed-tag__title {
  font-size: 1.125rem;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

/* The stub at the bottom, under a dashed line. It sits at the very bottom, so
   the stubs of a row line up whether a title takes one line or two. */
.feed-tag__stub {
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1.5px dashed var(--fi-line);
}

.feed-tag__status {
  font-size: 0.875rem;
  font-weight: 600;
}

.feed-tag__status--brass {
  color: var(--fi-brass-strong);
}

.feed-tag__status--navy,
.feed-tag__status--green {
  color: var(--fi-success);
}

.feed-tag__status--red {
  color: var(--fi-danger);
}

.feed-tag__status--lost {
  color: var(--lost-ink);
}

.feed-tag__status--grey {
  color: var(--fi-mist);
}

.feed-tag__stub-number {
  color: var(--fi-mist);
  font-family: var(--fi-font-mono);
  font-size: 1.25rem;
  font-weight: 500;
  white-space: nowrap;
}

.feed-tag.is-lost .feed-tag__stub-number {
  font-size: 1.0625rem;
}

/* On a phone the tags are two to a row, so they get a smaller photo and text */
@media (max-width: 575.98px) {
  .feed-tag__body {
    gap: 4px;
    padding: 4px 10px 12px;
  }

  .feed-tag__photo {
    height: 104px;
  }

  .feed-tag__status {
    font-size: 0.75rem;
  }

  .feed-tag__title {
    font-size: 0.9375rem;
  }

  .feed-tag__stub {
    gap: 2px 0.5rem;
  }

  .feed-tag__stub-number {
    font-size: 1rem;
  }

  .feed-tag.is-lost .feed-tag__stub-number {
    font-size: 0.875rem;
  }
}

/* Standing in a grid (no pin or string): the tag starts at the top of its
   cell, fills it, and its back sits exactly over it */
.feed-tag.is-standing .feed-tag__paper {
  max-width: none;
  margin-top: 0;
}

.feed-tag.is-standing .feed-tag__back {
  top: 0;
}

.feed-tag.is-standing .feed-tag__back .feed-tag__paper {
  height: 100%;
}

/* ---- Turning it over ---- */

/* A turned tag sits above its neighbours, since its back can be no smaller */
.feed-tag.is-turned {
  z-index: 2;
}

/* The tag turns on its string in two halves: the front turns edge-on, then
   the back turns in from edge-on. The back sits exactly over the front, under
   the string. */
.feed-tag__face {
  justify-content: center;
  transform-origin: 50% 0;
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.2s;
}

.feed-tag.is-turned > .feed-tag__swing > .feed-tag__face:not(.feed-tag__back) {
  transform: perspective(900px) rotateY(90deg);
  transition: transform 0.2s ease-in;
}

.feed-tag__back {
  top: var(--drop);
  visibility: hidden;
  transform: perspective(900px) rotateY(-90deg);
  transition:
    transform 0.2s ease-in,
    visibility 0s 0.2s;
}

/* It shows straight away (still edge-on, so unseen) so the keyboard can
   reach its button at once */
.feed-tag.is-turned .feed-tag__back {
  visibility: visible;
  transform: none;
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.2s;
}

/* The front is a button: no button look of its own */
button.feed-tag__paper {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: inherit;
}

/* The back's paper is as tall as the front's (which reaches 14px above the
   face, over the string), so tapping anywhere on it turns it back */
.feed-tag__back .feed-tag__paper {
  height: calc(100% + 14px);
  cursor: pointer;
}

.feed-tag__back-body {
  flex: 1 1 auto;
  min-height: 0;
  gap: 8px;
}

/* The bigger photo takes whatever the words leave */
.feed-tag__photo--big {
  flex: 1 1 0;
  min-height: 90px;
  height: auto;
  margin-bottom: 0;
}

.feed-tag__back :deep(.fi-button:focus-visible) {
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* The match score, a small gold pill on the picture's top corner */
.feed-tag__score {
  top: 6px;
  right: 6px;
  padding: 0.15rem 0.5rem;
  border-radius: var(--fi-radius-pill);
  background: var(--fi-brass);
  color: #141a3f;
  font-size: 0.75rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* "Your claim", "Your find" or "Your report": navy, since gold only means a
   match. The picture stays pale in both themes, so it reads the same at night. */
.feed-tag__score--mine {
  background: #1a2b6d;
  color: #fff;
}

/* The arrow on "See full details" */
.feed-tag__arrow {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* What to do, under a dashed line like the front's stub */
.feed-tag__act {
  gap: 6px;
  padding-top: 10px;
  border-top: 1.5px dashed var(--fi-line);
}

/* "See full details", a quiet grey link under the button */
.feed-tag__details {
  color: var(--fi-mist);
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.feed-tag__details:hover {
  color: var(--fi-brass-strong);
}

.feed-tag.is-lost .feed-tag__details:hover {
  color: var(--lost-ink);
}

.feed-tag__details:focus-visible {
  border-radius: 2px;
  outline: 3px solid var(--fi-focus);
  outline-offset: 2px;
}

/* "Is this yours?" or "Seen it?" over the button */
.feed-tag__question {
  color: var(--fi-brass-strong);
  font-size: 0.8125rem;
  font-weight: 800;
}

.feed-tag.is-lost .feed-tag__question {
  color: var(--lost-ink);
}

/* At most two lines of the description */
.feed-tag__desc {
  display: -webkit-box;
  overflow: hidden;
  color: var(--fi-ink);
  font-size: 0.875rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

/* The lost side's button in brick red */
.feed-tag.is-lost .feed-tag__back :deep(.feed-tag__ask) {
  border-color: var(--lost-ink);
  background: var(--lost-ink);
  color: #fff;
}

@media (max-width: 575.98px) {
  .feed-tag__back-body {
    gap: 5px;
  }

  .feed-tag__photo--big {
    min-height: 60px;
  }

  .feed-tag__desc,
  .feed-tag__question {
    font-size: 0.75rem;
  }

  .feed-tag__details,
  .feed-tag__score {
    font-size: 0.6875rem;
  }

  .feed-tag__act {
    gap: 4px;
    padding-top: 6px;
  }

  .feed-tag__back :deep(.fi-button) {
    padding-inline: 0.4rem;
    font-size: 0.8125rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .feed-tag__paper {
    transition: none;
  }

  /* No turning: the back simply shows in place of the front */
  .feed-tag__face,
  .feed-tag.is-turned > .feed-tag__swing > .feed-tag__face:not(.feed-tag__back),
  .feed-tag__back,
  .feed-tag.is-turned .feed-tag__back {
    transition: none;
  }

  .feed-tag.is-turned > .feed-tag__swing > .feed-tag__face:not(.feed-tag__back) {
    visibility: hidden;
    transform: none;
  }
}
</style>

<style>
/* Night mode: a navy tag instead of the site's manila one, so the light night
   text can be read on it, with a lighter navy edge and shadow so it stands out
   from the navy page. Not scoped, so it can match the <html> element. */
:root[data-theme='night'] .feed-tag {
  --navy: #3a4688;
  --fi-ticket: #1d2754;
}

/* The photo tile stays pale, so dark drawings (a black phone or wallet) still
   show on the navy tag */
:root[data-theme='night'] .feed-tag__photo:not(.has-photo) {
  background: color-mix(in srgb, var(--cat) 14%, #e9ecf6);
}
</style>
