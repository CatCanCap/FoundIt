<script setup>
// /report: choose between reporting a found item or a lost one.
// It answers one question: did I find something, or lose something? Each
// choice is one link straight into its form. Rebuilt in the design system
// (assets/system.css, class="ds").
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import ReportIcon from '@/components/report/ReportIcon.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const CHOICES = [
  {
    value: 'found',
    to: '/report/found',
    title: 'I found something',
    text: 'Say what it is and where you found it. We alert the owner.',
    time: '1 min',
  },
  {
    value: 'lost',
    to: '/report/lost',
    title: 'I lost something',
    text: 'Describe it and retrace your steps. We watch every new find.',
    time: '2 min',
  },
]
</script>

<template>
  <div class="ds choose">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap choose__main" data-testid="report-choose">
      <div class="choose__body">
        <h1 class="ds-h1">What do you want to report?</h1>

        <!-- Suspended accounts can't report -->
        <div
          v-if="auth.isSuspended"
          class="choose__suspended"
          role="status"
          data-testid="choose-suspended"
        >
          <p>
            Your account is suspended, so you can’t report found or lost items right now. You can
            still browse the feed.
          </p>
          <RouterLink to="/feed" class="ds-link ds-link--standalone">Browse the feed</RouterLink>
        </div>

        <nav v-else aria-label="Two ways to start">
          <ul class="choose__ways">
            <li
              v-for="(entry, i) in CHOICES"
              :key="entry.value"
              class="ds-enter"
              :style="{ '--i': i }"
            >
              <RouterLink
                :to="entry.to"
                class="choose-way"
                :class="`choose-way--${entry.value}`"
                :data-testid="`choose-${entry.value}`"
              >
                <span class="choose-way__icon" aria-hidden="true">
                  <ReportIcon :kind="entry.value" />
                </span>
                <span class="choose-way__text">
                  <span class="ds-title choose-way__title">{{ entry.title }}</span>
                  <span class="ds-muted">{{ entry.text }}</span>
                  <span class="ds-small ds-muted ds-num choose-way__time">{{ entry.time }}</span>
                </span>
                <svg class="choose-way__arrow" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </RouterLink>
            </li>
          </ul>
        </nav>
      </div>

      <!-- The lion, only where there is room beside the choices -->
      <div class="choose__art" aria-hidden="true">
        <MascotArt :size="260" />
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.choose {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.choose__main {
  display: grid;
  gap: var(--ds-space-7);
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

.choose__body {
  display: grid;
  align-content: start;
  gap: var(--ds-space-5);
  width: 100%;
  max-width: 38rem;
}

/* Suspended: a quiet panel with one way on */
.choose__suspended {
  display: grid;
  justify-items: start;
  gap: var(--ds-space-2);
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.choose__ways {
  display: grid;
  gap: var(--ds-space-3);
}

/* Each choice is one link card: an edge, an arrow and a lift on hover set it
   apart from static panels */
.choose-way {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  color: var(--ds-text);
  text-decoration: none;
  transition:
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    box-shadow var(--ds-dur-fast) var(--ds-ease-out),
    translate var(--ds-dur-fast) var(--ds-ease-out);
}

.choose-way:hover {
  border-color: var(--ds-action);
  box-shadow: var(--ds-elev-1);
  color: var(--ds-text);
  translate: 0 calc(-1 * var(--ds-space-1));
}

/* Yellow for found, red for lost: the icon tile, the time and the hover edge */
.choose-way--found {
  --kind: var(--ds-found);
  --kind-wash: var(--ds-found-wash);
}

.choose-way--lost {
  --kind: var(--ds-lost);
  --kind-wash: var(--ds-lost-wash);
}

.choose-way--found:hover,
.choose-way--lost:hover {
  border-color: var(--kind);
}

.choose-way:active {
  box-shadow: none;
  translate: 0;
}

.choose-way__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: var(--ds-control-h-lg);
  height: var(--ds-control-h-lg);
  border-radius: var(--ds-radius-control);
  background: var(--kind-wash, var(--ds-surface-sunken));
  color: var(--kind, var(--ds-action));
}

.choose-way__icon svg,
.choose-way__arrow {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.choose-way__text {
  display: grid;
  flex-grow: 1;
  gap: var(--ds-space-1);
  min-width: 0;
}

.choose-way__title {
  color: var(--ds-text);
}

.choose-way:hover .choose-way__title {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.choose-way__time {
  margin-top: var(--ds-space-1);
  color: var(--kind);
  font-weight: var(--ds-weight-medium);
}

.choose-way__arrow {
  flex-shrink: 0;
  color: var(--ds-action);
  transition: translate var(--ds-dur-fast) var(--ds-ease-press);
}

.choose-way:hover .choose-way__arrow {
  translate: var(--ds-space-1) 0;
}

/* The lion appears beside the choices from 1024px */
.choose__art {
  display: none;
}

@media (min-width: 768px) {
  .choose__main {
    padding-block: var(--ds-space-8);
  }

  .choose-way {
    gap: var(--ds-space-5);
    padding: var(--ds-space-5);
  }
}

@media (min-width: 1024px) {
  .choose__main {
    grid-template-columns: minmax(0, 38rem) minmax(0, 1fr);
    align-items: center;
    gap: var(--ds-space-8);
    padding-block: var(--ds-space-8) var(--ds-space-9);
  }

  .choose__art {
    display: grid;
    justify-items: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .choose-way,
  .choose-way__arrow {
    transition-property: border-color, box-shadow;
  }

  .choose-way:hover,
  .choose-way:hover .choose-way__arrow {
    translate: none;
  }
}
</style>
