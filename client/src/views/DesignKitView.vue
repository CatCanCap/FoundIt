<script setup>
// /design (dev only): the design system's tokens and controls on one page
// (assets/system.css), to compare with Figma and to check night mode.
import { ref } from 'vue'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SegmentedToggle from '@/components/ui/SegmentedToggle.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import TextField from '@/components/ui/TextField.vue'
import { STATUS_PILLS } from '@/utils/design'

// Every colour role, grouped the way src/assets/system.css defines them
const COLOUR_GROUPS = [
  {
    name: 'Surfaces',
    tokens: ['canvas', 'surface', 'surface-sunken', 'surface-tile', 'border', 'border-control'],
  },
  { name: 'Text', tokens: ['text', 'text-muted'] },
  { name: 'Action', tokens: ['action', 'action-hover', 'action-pressed', 'action-wash'] },
  {
    name: 'Signal and states',
    tokens: ['signal', 'signal-text', 'danger', 'success', 'warning', 'focus'],
  },
  { name: 'Band', tokens: ['band', 'on-band', 'on-band-muted'] },
]

const TYPE = [
  ['ds-display', 'Display', 'Lost something on campus?'],
  ['ds-h1', 'H1', 'Your matches'],
  ['ds-h2', 'H2', 'Best find'],
  ['ds-h3', 'H3', 'Other finds'],
  ['ds-title', 'Title', 'Black wallet, SOE level 2'],
  ['ds-lead', 'Lead', 'We check every new find against your report.'],
  ['', 'Body', 'Handed in at the SOE concierge on Tuesday afternoon.'],
  ['ds-small', 'Small', 'Same category, same colour, same floor.'],
  ['ds-caption', 'Caption', 'Found 2 days ago'],
]

const SPACES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const RADII = ['control', 'surface', 'round']
const DURATIONS = ['fast', 'base', 'slow', 'max']
const EASINGS = ['out', 'in', 'press']

const ICONS = [
  ['Water Bottle', 'Blue'],
  ['Student Card', 'White'],
  ['Wallet', 'Brown'],
  ['Umbrella', 'Red'],
  ['Earbuds', 'White'],
  ['Keys', 'Silver'],
  ['Laptop', 'Grey'],
  ['Phone', 'Black'],
  ['Charger', 'Black'],
  ['Bag', 'Navy'],
  ['Clothing', 'Green'],
]

const STATES = Object.keys(STATUS_PILLS).filter((state) => state !== 'resolved')
const toggle = ref('found')
const bandToggle = ref('student')
const sample = ref('')
const wrong = ref('alex@gmail.com')

// Bumping the key remounts the row, so its arrival plays again
const replay = ref(0)
</script>

<template>
  <div class="ds kit">
    <AppHeader :match-count="2" />

    <main class="ds-wrap kit__main">
      <PageHeader
        title="Design system"
        lede="The tokens and controls every rebuilt page is made from. Switch to night mode to check both themes."
      >
        <template #actions>
          <BaseButton variant="secondary" size="sm" to="/feed">Back to the feed</BaseButton>
        </template>
      </PageHeader>

      <section class="kit__section" aria-labelledby="kit-colour">
        <h2 id="kit-colour" class="ds-h2">Colour roles</h2>
        <div v-for="group in COLOUR_GROUPS" :key="group.name" class="kit__group">
          <h3 class="ds-title">{{ group.name }}</h3>
          <ul class="kit__swatches">
            <li v-for="token in group.tokens" :key="token" class="kit__swatch-row">
              <span class="kit__swatch" :style="{ background: `var(--ds-${token})` }"></span>
              <code class="ds-small">--ds-{{ token }}</code>
            </li>
          </ul>
        </div>
      </section>

      <section class="kit__section" aria-labelledby="kit-type">
        <h2 id="kit-type" class="ds-h2">Type</h2>
        <p class="ds-muted kit__note">
          Bricolage Grotesque for page and section titles, Public Sans for everything else.
        </p>
        <dl class="kit__type">
          <div v-for="[cls, name, sample] in TYPE" :key="name" class="kit__type-row">
            <dt class="ds-caption ds-muted">{{ name }}</dt>
            <dd :class="cls">{{ sample }}</dd>
          </div>
        </dl>
      </section>

      <section class="kit__section" aria-labelledby="kit-shape">
        <h2 id="kit-shape" class="ds-h2">Space, corners and elevation</h2>
        <ul class="kit__spaces">
          <li v-for="step in SPACES" :key="step" class="kit__space-row">
            <code class="ds-small">--ds-space-{{ step }}</code>
            <span class="kit__space" :style="{ width: `var(--ds-space-${step})` }"></span>
          </li>
        </ul>
        <div class="kit__tiles">
          <div
            v-for="radius in RADII"
            :key="radius"
            class="kit__tile"
            :style="{ borderRadius: `var(--ds-radius-${radius})` }"
          >
            <code class="ds-small">--ds-radius-{{ radius }}</code>
          </div>
          <div class="kit__tile kit__tile--raised" :style="{ boxShadow: 'var(--ds-elev-1)' }">
            <code class="ds-small">--ds-elev-1</code>
            <span class="ds-caption ds-muted">Hover lift</span>
          </div>
          <div class="kit__tile kit__tile--raised" :style="{ boxShadow: 'var(--ds-elev-2)' }">
            <code class="ds-small">--ds-elev-2</code>
            <span class="ds-caption ds-muted">Things that float</span>
          </div>
        </div>
      </section>

      <section class="kit__section" aria-labelledby="kit-motion">
        <h2 id="kit-motion" class="ds-h2">Motion</h2>
        <div class="kit__motion">
          <ul class="kit__chips">
            <li v-for="name in DURATIONS" :key="name">
              <code class="ds-small">--ds-dur-{{ name }}</code>
            </li>
            <li v-for="name in EASINGS" :key="name">
              <code class="ds-small">--ds-ease-{{ name }}</code>
            </li>
            <li><code class="ds-small">--ds-stagger</code></li>
            <li><code class="ds-small">--ds-loop</code></li>
          </ul>
          <BaseButton variant="secondary" size="sm" data-testid="kit-replay" @click="replay++">
            Play the arrival again
          </BaseButton>
        </div>
        <ul :key="replay" class="kit__arrivals">
          <li v-for="i in 5" :key="i" class="kit__arrival ds-enter" :style="{ '--i': i - 1 }"></li>
        </ul>
      </section>

      <section class="kit__section" aria-labelledby="kit-controls">
        <h2 id="kit-controls" class="ds-h2">Controls</h2>
        <div class="kit__group">
          <h3 class="ds-title">BaseButton</h3>
          <div class="kit__row">
            <BaseButton>Claim this item</BaseButton>
            <BaseButton variant="secondary">Browse found items</BaseButton>
            <BaseButton variant="night">See my matches</BaseButton>
            <BaseButton variant="link">Not mine</BaseButton>
            <BaseButton size="sm">Report an item</BaseButton>
            <BaseButton disabled>Disabled</BaseButton>
            <BaseButton aria-busy="true">Sending</BaseButton>
          </div>
        </div>
        <div class="kit__group">
          <h3 class="ds-title">Classes for plain links and buttons</h3>
          <div class="kit__row">
            <a href="#kit-controls" class="ds-btn ds-btn--primary">Primary</a>
            <a href="#kit-controls" class="ds-btn ds-btn--secondary">Secondary</a>
            <a href="#kit-controls" class="ds-btn ds-btn--tertiary">
              Tertiary
              <svg
                class="ds-btn__arrow"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M3 8h9.5M8.5 4 12.5 8l-4 4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </a>
            <a href="#kit-controls" class="ds-btn ds-btn--primary ds-btn--lg">Large</a>
            <a href="#kit-controls" class="ds-link">An inline link</a>
            <button type="button" class="ds-icon-btn" aria-label="Close">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section class="kit__section" aria-labelledby="kit-form">
        <h2 id="kit-form" class="ds-h2">Form parts</h2>
        <div class="kit__form">
          <TextField v-model="sample" label="SMU email" type="email" help="Ending in smu.edu.sg." />
          <TextField
            v-model="wrong"
            label="SMU email"
            type="email"
            error="Use your SMU email, ending in smu.edu.sg."
          />
          <SegmentedToggle
            v-model="toggle"
            label="Show on the map"
            :options="[
              { value: 'found', label: 'Found this week' },
              { value: 'lost', label: 'Lost, 30 days' },
            ]"
          />
        </div>
        <div class="kit__band">
          <SegmentedToggle
            v-model="bandToggle"
            tone="light"
            label="Sign in as"
            :options="[
              { value: 'student', label: 'Student' },
              { value: 'admin', label: 'Admin' },
            ]"
          />
        </div>
      </section>

      <section class="kit__section" aria-labelledby="kit-status">
        <h2 id="kit-status" class="ds-h2">Status pills</h2>
        <p class="ds-muted kit__note">Shown only when an item is not in its usual state.</p>
        <div class="kit__row">
          <StatusPill v-for="state in STATES" :key="state" :state="state" />
        </div>
      </section>

      <section class="kit__section" aria-labelledby="kit-icons">
        <h2 id="kit-icons" class="ds-h2">Item drawings</h2>
        <p class="ds-muted kit__note">For items without a photo, in the item's main colour.</p>
        <ul class="kit__icons">
          <li v-for="[category, colour] in ICONS" :key="category" class="kit__icon">
            <span class="kit__icon-tile"><ItemIcon :category="category" :colour="colour" /></span>
            <span class="ds-caption ds-muted">{{ category }}</span>
          </li>
        </ul>
      </section>

      <section class="kit__section" aria-labelledby="kit-loading">
        <h2 id="kit-loading" class="ds-h2">Loading</h2>
        <div class="kit__row">
          <span class="ds-spinner kit__spinner" role="status" aria-label="Loading"></span>
          <div class="kit__skeleton" aria-hidden="true">
            <span class="ds-skeleton kit__skeleton-thumb"></span>
            <span class="kit__skeleton-lines">
              <span class="ds-skeleton kit__skeleton-bar is-title"></span>
              <span class="ds-skeleton kit__skeleton-bar"></span>
            </span>
          </div>
        </div>
      </section>

      <section class="kit__section" aria-labelledby="kit-mascot">
        <h2 id="kit-mascot" class="ds-h2">Mascot</h2>
        <div class="kit__row">
          <MascotArt :size="170" />
          <MascotArt variant="head" :size="64" />
        </div>
      </section>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.kit {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.kit__main {
  flex: 1;
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

.kit__section {
  display: grid;
  gap: var(--ds-space-4);
  margin-top: var(--ds-space-7);
  padding-top: var(--ds-space-6);
  border-top: 1px solid var(--ds-border);
}

.kit__group {
  display: grid;
  gap: var(--ds-space-3);
}

.kit__group + .kit__group {
  margin-top: var(--ds-space-3);
}

.kit__note {
  max-width: 40rem;
}

.kit__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-4);
}

code {
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-variant-numeric: tabular-nums;
}

/* Colour */

.kit__swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: var(--ds-space-3);
}

.kit__swatch-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
}

.kit__swatch {
  flex-shrink: 0;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  border-radius: var(--ds-radius-control);
  box-shadow: inset 0 0 0 1px var(--ds-border);
}

/* Type */

.kit__type {
  display: grid;
  gap: var(--ds-space-4);
  margin: 0;
}

.kit__type-row {
  display: grid;
  gap: var(--ds-space-1);
}

.kit__type-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

/* The display sizes are for headings; show them in the heading face */
.kit__type-row dd:is(.ds-display, .ds-h1, .ds-h2, .ds-h3) {
  font-family: var(--ds-font-display);
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.02em;
}

@media (min-width: 768px) {
  .kit__type-row {
    grid-template-columns: 6rem 1fr;
    align-items: baseline;
    gap: var(--ds-space-4);
  }
}

/* Space, corners and elevation */

.kit__spaces {
  display: grid;
  gap: var(--ds-space-2);
}

.kit__space-row {
  display: grid;
  grid-template-columns: 8rem 1fr;
  align-items: center;
}

.kit__space {
  height: var(--ds-space-2);
  border-radius: var(--ds-radius-control);
  background: var(--ds-action);
}

.kit__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--ds-space-4);
  margin-top: var(--ds-space-3);
}

.kit__tile {
  display: grid;
  place-content: center;
  gap: var(--ds-space-1);
  min-height: 6rem;
  padding: var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  background: var(--ds-surface);
  text-align: center;
}

.kit__tile--raised {
  border-color: transparent;
  border-radius: var(--ds-radius-surface);
}

/* Motion */

.kit__motion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-4);
}

.kit__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-2);
}

.kit__chips li {
  padding: var(--ds-space-1) var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
}

.kit__arrivals {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ds-space-3);
}

.kit__arrival {
  height: var(--ds-space-8);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  box-shadow: inset 0 0 0 1px var(--ds-border);
}

/* Form parts */

.kit__form {
  display: grid;
  gap: var(--ds-space-5);
  max-width: 24rem;
}

.kit__band {
  justify-self: start;
  padding: var(--ds-space-5);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-band);
  color: var(--ds-on-band);
}

/* Item drawings */

.kit__icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: var(--ds-space-4);
}

.kit__icon {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-2);
  text-align: center;
}

.kit__icon-tile {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-tile);
}

/* Loading */

.kit__spinner {
  color: var(--ds-action);
  font-size: var(--ds-size-h3);
}

.kit__skeleton {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ds-space-3);
  min-width: 12rem;
  max-width: 24rem;
}

.kit__skeleton-thumb {
  flex-shrink: 0;
  width: var(--ds-space-8);
  height: var(--ds-space-8);
  border-radius: var(--ds-radius-control);
}

.kit__skeleton-lines {
  display: grid;
  flex: 1;
  gap: var(--ds-space-2);
}

.kit__skeleton-bar {
  height: var(--ds-space-3);
  width: 60%;
}

.kit__skeleton-bar.is-title {
  width: 90%;
  height: var(--ds-space-4);
}
</style>
