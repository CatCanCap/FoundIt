<script setup>
// The landing page at /, for visitors who are not signed in (signed-in people
// go straight to the feed, admins to the Admin page: see router/guard.js).
// It answers one question: has someone on campus already handed in what I
// lost? The headline and the two reports come first, the newest finds beside
// them, and how it works below. The first of the rebuilt pages: it uses the
// design system in assets/system.css (class="ds").
//
// The header and hero sit on a navy band with the campus drawn faintly
// behind them (CampusNight) and a match playing in the card beside the
// headline (HeroMatch). The newest finds overlap the band's bottom edge.
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppFooter from '@/components/ui/AppFooter.vue'
import BrandLogo from '@/components/ui/BrandLogo.vue'
import CampusNight from '@/components/landing/CampusNight.vue'
import HeroMatch from '@/components/landing/HeroMatch.vue'
import NewestFinds from '@/components/landing/NewestFinds.vue'
import HowItWorks from '@/components/landing/HowItWorks.vue'
import { currentTheme, setTheme } from '@/utils/theme'

const theme = ref(currentTheme())

function toggleTheme() {
  theme.value = theme.value === 'night' ? 'day' : 'night'
  setTheme(theme.value)
}
</script>

<template>
  <div class="ds landing" data-testid="landing">
    <header class="landing__top landing__on-band">
      <div class="ds-wrap landing__bar">
        <BrandLogo tone="light" />
        <nav class="landing__nav" aria-label="Main">
          <button
            type="button"
            class="ds-icon-btn"
            :aria-label="theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'"
            :aria-pressed="theme === 'night'"
            data-testid="theme-toggle"
            @click="toggleTheme"
          >
            <svg
              class="landing__theme-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                v-if="theme === 'night'"
                d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
              />
              <path v-else d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            </svg>
          </button>
          <RouterLink to="/login" class="ds-btn ds-btn--secondary" data-testid="landing-sign-in"
            >Sign in</RouterLink
          >
        </nav>
      </div>
    </header>

    <main>
      <div class="landing__band">
        <CampusNight class="landing__night" />

        <section class="ds-wrap landing__hero" aria-labelledby="landing-title">
          <div class="landing__pitch landing__on-band">
            <h1 id="landing-title" class="ds-display">
              Lost something on campus? Check if it’s been handed in.
            </h1>
            <p class="ds-lead ds-muted landing__lede">
              FoundIt checks every lost report against every find at SMU, down to the building and
              room, and shows you why each one might be yours.
            </p>
            <div class="landing__actions">
              <RouterLink
                to="/report/lost"
                class="ds-btn ds-btn--primary ds-btn--lg"
                data-testid="landing-lost"
                >I lost something</RouterLink
              >
              <RouterLink
                to="/report/found"
                class="ds-btn ds-btn--secondary ds-btn--lg"
                data-testid="landing-found"
                >I found something</RouterLink
              >
            </div>
          </div>

          <HeroMatch class="landing__match" />
        </section>
      </div>

      <div class="landing__below">
        <div class="ds-wrap landing__finds-wrap">
          <NewestFinds class="landing__finds" />
        </div>
      </div>

      <HowItWorks />
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* The page starts navy, under the header and hero; everything from the
   newest finds down has its own light background */
.landing {
  --landing-top-h: calc(4.5rem + 1px);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow-x: clip;
  background: var(--ds-band);
}

/* The hero, with the campus map behind it reaching up behind the header too.
   It is tall enough at the bottom for the newest finds (and the lion standing
   on them) to overlap its edge. */
.landing__band {
  position: relative;
  padding-bottom: calc(var(--ds-space-8) + var(--ds-space-6));
}

.landing__band .landing__night {
  top: calc(-1 * var(--landing-top-h));
  height: calc(100% + var(--landing-top-h));
}

.landing__hero {
  position: relative;
}

/* Words and controls on the band take its colours, the same way the
   page-not-found screen does. The match card keeps the light ones. */
.landing__on-band {
  --ds-surface: color-mix(in srgb, var(--ds-on-band) 12%, var(--ds-band));
  --ds-surface-sunken: color-mix(in srgb, var(--ds-on-band) 20%, var(--ds-band));
  --ds-text: var(--ds-on-band);
  --ds-text-muted: var(--ds-on-band-muted);
  --ds-border: color-mix(in srgb, var(--ds-on-band) 24%, var(--ds-band));
  --ds-border-control: var(--ds-on-band-muted);
  --ds-action: var(--ds-on-band);
  --ds-action-hover: var(--ds-on-band-muted);
  --ds-action-pressed: var(--ds-on-band-muted);
  --ds-action-wash: color-mix(in srgb, var(--ds-on-band) 12%, transparent);
  --ds-on-action: var(--ds-band);
  --ds-focus: var(--ds-on-band);
  color: var(--ds-text);
}

.landing__top {
  position: relative;
  z-index: 1;
  border-bottom: 1px solid var(--ds-border);
}

/* Outline buttons are see-through on the band, so the map shows through */
.landing__on-band .ds-btn--secondary {
  background: transparent;
}

.landing__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-4);
  min-height: 4.5rem;
}

.landing__nav {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
}

.landing__theme-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The pitch on the left, the match on the right; stacked below 1024px */
.landing__hero {
  display: grid;
  gap: var(--ds-space-7);
  padding-top: var(--ds-space-6);
}

/* Below 1024px the pitch sits above the match card, so both are centred */
.landing__pitch {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--ds-space-5);
  max-width: 38rem;
  margin-inline: auto;
  text-align: center;
}

.landing__lede {
  max-width: 34rem;
}

.landing__actions {
  display: grid;
  gap: var(--ds-space-3);
  margin-top: var(--ds-space-2);
}

/* Below 1024px the card sits under the pitch, in the middle of the band */
.landing__match {
  justify-self: center;
  width: 100%;
  max-width: 32rem;
}

/* The newest finds rise over the band's bottom edge: the light background
   starts at the edge, and the row of tags is pulled up past it */
.landing__below {
  --overlap: var(--ds-space-7);
  padding-bottom: var(--ds-space-7);
  background: var(--ds-canvas);
}

.landing__finds-wrap {
  position: relative;
  top: calc(-1 * var(--overlap));
  margin-bottom: calc(-1 * var(--overlap));
}

@media (min-width: 480px) {
  .landing__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }
}

@media (min-width: 768px) {
  .landing__hero {
    padding-top: var(--ds-space-8);
  }

  /* Room at the bottom of the band for the lion standing on the list */
  .landing__band {
    padding-bottom: calc(var(--ds-space-9) + var(--ds-space-8));
  }

  .landing__below {
    --overlap: var(--ds-space-8);
  }
}

@media (min-width: 1024px) {
  /* Side by side with the card again: back to the left */
  .landing__pitch {
    justify-items: start;
    margin-inline: 0;
    text-align: start;
  }

  .landing__actions {
    justify-content: flex-start;
  }

  .landing__hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 28rem);
    align-items: center;
    gap: var(--ds-space-8);
    padding-top: var(--ds-space-8);
  }
}
</style>
