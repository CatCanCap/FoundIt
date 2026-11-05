<script setup>
// The owner's lost reports on the Matches page: one row of tags hanging on
// strings that scrolls sideways and snaps to each tag, with no pages. On a
// wide screen with a mouse, a button at each end scrolls it; phones swipe.
// While it scrolls, the tags in view sway the other way, as hanging tags
// would. The tags are tabs: the arrow keys, Home and End move between them,
// and Tab goes on to the report shown under the rail. The report shown is
// scrolled into view when the page opens and whenever it changes, without
// moving the page up or down.
//   reports    the reports to hang, in order
//   currentId  the report shown
//   panelId    the id of the panel that shows it
// Emits select with the picked report.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ReportTag from '@/components/matches/ReportTag.vue'
import { itemTone } from '@/utils/matches'

const props = defineProps({
  reports: { type: Array, required: true },
  currentId: { type: Number, default: null },
  panelId: { type: String, required: true },
})

const emit = defineEmits(['select'])

const track = ref(null)
const tags = ref([])
const atStart = ref(true)
const atEnd = ref(true)

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Whether there is more of the rail to either side, for the two buttons
function measure() {
  const el = track.value
  if (!el) return
  atStart.value = el.scrollLeft <= 1
  atEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
}

// Scrolling sways the tags in view the other way, once a frame
let lastScroll = 0
let swayFrame = 0

function sway() {
  swayFrame = 0
  const el = track.value
  if (!el) return
  const moved = el.scrollLeft - lastScroll
  lastScroll = el.scrollLeft
  if (!moved) return
  const left = el.scrollLeft
  const right = left + el.clientWidth
  for (const tag of tags.value) {
    const box = tag?.$el
    if (!box || box.offsetLeft + box.offsetWidth < left || box.offsetLeft > right) continue
    tag.nudge(-moved * 0.6, 30)
  }
}

function onScroll() {
  measure()
  if (!swayFrame && window.requestAnimationFrame) swayFrame = requestAnimationFrame(sway)
}

// Scrolls the rail most of its width one way (-1) or the other (1)
function scrollRail(direction) {
  const el = track.value
  el?.scrollBy?.({
    left: direction * el.clientWidth * 0.8,
    behavior: reducedMotion() ? 'auto' : 'smooth',
  })
}

// Brings the report shown to the middle of the rail if it is out of sight
function reveal(smooth) {
  const el = track.value
  const tag = el?.querySelector('[aria-selected="true"]')?.closest('li')
  if (!tag) return
  const left = tag.offsetLeft
  const right = left + tag.offsetWidth
  if (left >= el.scrollLeft && right <= el.scrollLeft + el.clientWidth) return
  el.scrollTo?.({
    left: Math.max(0, left - (el.clientWidth - tag.offsetWidth) / 2),
    behavior: smooth && !reducedMotion() ? 'smooth' : 'auto',
  })
}

// The arrow keys, Home and End pick the next, previous, first or last tag
function onKeydown(event) {
  const count = props.reports.length
  const index = props.reports.findIndex((report) => report.item.id === props.currentId)
  const next = {
    ArrowRight: Math.min(count - 1, index + 1),
    ArrowLeft: Math.max(0, index - 1),
    Home: 0,
    End: count - 1,
  }[event.key]
  if (next === undefined) return
  event.preventDefault()
  const report = props.reports[next]
  emit('select', report)
  track.value?.querySelector(`#report-tab-${report.item.id}`)?.focus({ preventScroll: true })
}

watch(
  () => props.currentId,
  () => nextTick(() => reveal(true)),
)
// Another filter or search: a new set of tags
watch(
  () => props.reports,
  () =>
    nextTick(() => {
      reveal(false)
      measure()
    }),
)

onMounted(() => {
  reveal(false)
  measure()
  lastScroll = track.value?.scrollLeft || 0
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  if (swayFrame) cancelAnimationFrame(swayFrame)
})
</script>

<template>
  <div class="report-rail" data-testid="report-rails">
    <button
      v-show="!atStart"
      type="button"
      class="report-rail__scroll is-back ds-icon-btn"
      aria-label="Scroll back"
      data-testid="rail-back"
      @click="scrollRail(-1)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <ul
      ref="track"
      class="report-rail__track"
      role="tablist"
      aria-label="Your lost reports"
      @scroll.passive="onScroll"
      @keydown="onKeydown"
    >
      <ReportTag
        v-for="report in reports"
        ref="tags"
        :key="report.item.id"
        :report="report"
        :current="report.item.id === currentId"
        :tone="itemTone(report.item)"
        :panel-id="panelId"
        @select="emit('select', $event)"
      />
    </ul>
    <button
      v-show="!atEnd"
      type="button"
      class="report-rail__scroll is-on ds-icon-btn"
      aria-label="Scroll on"
      data-testid="rail-on"
      @click="scrollRail(1)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  </div>
</template>

<style scoped>
.report-rail {
  position: relative;
}

/* One row that runs out to the edges of the page's margin, so tags slide in
   from the side of the screen on a phone. The padding leaves room for the
   shown tag to rise and for the shadows. */
.report-rail__track {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-4);
  margin: 0 calc(-1 * var(--ds-gutter));
  padding: var(--ds-space-3) var(--ds-gutter) var(--ds-space-4);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scroll-padding-inline: var(--ds-gutter);
  scrollbar-width: none;
}

.report-rail__track::-webkit-scrollbar {
  display: none;
}

/* Phones: closer together, so three tags fit across */
@media (max-width: 575.98px) {
  .report-rail__track {
    gap: var(--ds-space-2);
  }
}

/* The buttons float over the ends of the rail; only with a mouse, from
   tablet width */
.report-rail__scroll {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: none;
  margin-top: calc(-0.5 * var(--ds-control-h));
  box-shadow: var(--ds-elev-2);
}

.report-rail__scroll.is-back {
  left: calc(-0.5 * var(--ds-control-h));
}

.report-rail__scroll.is-on {
  right: calc(-0.5 * var(--ds-control-h));
}

.report-rail__scroll svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (min-width: 768px) and (hover: hover) {
  .report-rail__scroll {
    display: inline-grid;
  }
}

/* Between tablet and laptop the page's margin is too narrow for the buttons
   to sit half outside it */
@media (max-width: 1023.98px) {
  .report-rail__scroll.is-back {
    left: 0;
  }

  .report-rail__scroll.is-on {
    right: 0;
  }
}
</style>
