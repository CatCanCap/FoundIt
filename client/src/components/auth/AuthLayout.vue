<script setup>
// The navy sign-in band shared by the login and register pages (Figma V01 and
// V01b): logo, a big headline on the left, the paper tag with the form on the
// right, and the lion peeking from behind it.
//
// Slots:
//   headline  the <h1> words; wrap the accent word in <em class="fi-accent">
//   lede      one line under the headline (optional)
//   aside     anything under the lede (optional)
//   default   what goes on the tag (the form)
// Props:
//   stamp     words in the round stamp on the tag
//   swapKey   change it to give the tag a push, e.g. when the words on it swap
//   mood      what the lion is doing: 'idle', 'watching' (perks up while you
//             type your email), 'shy' (ducks down while you type a hidden
//             password), 'oops' (shakes its head after a wrong answer) or
//             'cheer' (hops when you're in). Still for reduced motion.
//   eyes      'open' or 'closed' lets the lion shut its eyes (see MascotArt);
//             '' (the default) shows the picture as it is
//
// Sizing uses Bootstrap's grid: one column on phones and tablets (the
// headline, then the tag), two side by side from lg (992px). On a phone the
// headline is shorter so the tag starts on the first screen, and the lion
// peeks over the tag's top edge; from lg it stands beside the tag as in V01.
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/ui/BrandLogo.vue'
import HangingTag from '@/components/ui/HangingTag.vue'
import MascotArt from '@/components/ui/MascotArt.vue'

const props = defineProps({
  stamp: { type: String, default: '' },
  swapKey: { type: String, default: '' },
  mood: { type: String, default: 'idle' },
  eyes: { type: String, default: '' },
})

const tag = ref(null)

watch(
  () => props.swapKey,
  () => tag.value?.nudge(60),
)
</script>

<template>
  <main class="fi-auth d-flex flex-column">
    <header
      class="fi-auth__top container-xl d-flex align-items-center justify-content-between gap-3"
    >
      <BrandLogo tone="light" />
      <RouterLink to="/feed" class="fi-auth__browse">Browse finds</RouterLink>
    </header>

    <div class="fi-auth__body container-xl d-flex flex-grow-1">
      <div class="row w-100 mx-0 align-items-center gy-4 gx-lg-5">
        <section class="fi-auth__intro col-12 col-lg-6 px-0 pe-lg-4">
          <h1 class="fi-auth__headline"><slot name="headline" /></h1>
          <p v-if="$slots.lede" class="fi-auth__lede"><slot name="lede" /></p>
          <slot name="aside" />
        </section>

        <section
          class="fi-auth__card col-12 col-sm-10 col-md-8 col-lg-6 mx-auto px-0 d-flex justify-content-center justify-content-lg-end"
        >
          <div class="fi-auth__mascot" aria-hidden="true">
            <div class="fi-auth__lion" :class="`fi-auth__lion--${mood}`" data-testid="auth-lion">
              <MascotArt :size="170" :eyes="eyes" />
            </div>
          </div>
          <HangingTag ref="tag" :stamp="stamp">
            <slot />
          </HangingTag>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.fi-auth {
  /* The sign-in band always uses the day colours, whatever night mode is set
     to, so the words on the navy band and the manila tag stay readable */
  --fi-page: #f5f7fb;
  --fi-raised: #ffffff;
  --fi-ticket: #ffffff;
  --fi-ink: #141a3f;
  --fi-mist: #5c6282;
  --fi-line: #e1e5ee;
  --fi-primary: #1a2b6d;
  --fi-primary-strong: #101c50;
  --fi-on-primary: #ffffff;
  --fi-primary-soft: color-mix(in srgb, var(--fi-primary) 9%, transparent);
  --fi-brass: #c9a24a;
  --fi-brass-strong: #8f6d1f;
  --fi-danger: #b3261e;
  /* Worked out again from the day colours above (tokens.css works them out
     from the night ones in night mode) */
  --fi-danger-soft: color-mix(in srgb, var(--fi-danger) 14%, transparent);
  --fi-notice-soft: color-mix(in srgb, var(--fi-brass) 16%, transparent);
  min-height: 100vh;
  min-height: 100dvh;
  /* Clear of the iPhone's notch and home bar */
  padding: max(1rem, env(safe-area-inset-top)) 0 max(1.5rem, env(safe-area-inset-bottom));
  background:
    radial-gradient(60rem 40rem at 75% 30%, rgb(60 72 160 / 35%), transparent 60%),
    linear-gradient(180deg, #121a4d 0%, #0a1030 100%);
  color: #fff;
}

.fi-auth__top,
.fi-auth__body {
  max-width: 72rem;
  padding-inline: 1rem;
}

/* A pill, so it is an easy thumb target on a phone */
.fi-auth__browse {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid rgb(238 240 248 / 25%);
  border-radius: 999px;
  color: rgb(238 240 248 / 90%);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.fi-auth__browse:hover,
.fi-auth__browse:active {
  border-color: rgb(238 240 248 / 55%);
  background: rgb(238 240 248 / 8%);
  color: #fff;
}

.fi-auth__browse:focus-visible {
  outline: 3px solid var(--fi-brass);
  outline-offset: 3px;
}

.fi-auth__body {
  padding-block: 1.25rem 0;
}

/* Phones: a shorter headline, so the tag starts on the first screen */
.fi-auth__headline {
  margin: 0 0 0.85rem;
  font-size: clamp(2.1rem, 9.5vw, 4.75rem);
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.035em;
}

/* The serif accent word, with the brass swoosh under it */
.fi-auth__headline :deep(.fi-accent) {
  position: relative;
  padding-right: 0.08em;
  letter-spacing: -0.01em;
}

.fi-auth__headline :deep(.fi-accent)::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0.1em;
  bottom: -0.04em;
  height: 0.09em;
  border-radius: 999px;
  background: var(--fi-brass);
  transform: rotate(-1.5deg);
}

.fi-auth__lede {
  margin: 0;
  max-width: 28rem;
  color: rgb(238 240 248 / 75%);
  font-size: 1rem;
}

.fi-auth__card {
  position: relative;
}

/* Phones and tablets: the lion peeks over the tag's top edge, to the right of
   the string, with the rest of it hidden behind the tag */
.fi-auth__mascot {
  position: absolute;
  /* Placed by the lion itself: the box's padding is head room for its hop */
  top: -2.5rem;
  right: 0.75rem;
  z-index: 0;
  pointer-events: none;
}

.fi-auth__mascot :deep(img) {
  width: auto;
  height: 92px;
}

.fi-auth__card :deep(.fi-hanging) {
  z-index: 1;
}

@media (min-width: 576px) {
  .fi-auth__top,
  .fi-auth__body {
    padding-inline: 1.5rem;
  }

  .fi-auth__headline {
    margin-bottom: 1.25rem;
  }

  .fi-auth__lede {
    font-size: 1.05rem;
  }
}

/* Desktop: headline and tag side by side, with the lion peeking out */
@media (min-width: 992px) {
  .fi-auth {
    padding-block: 1.5rem 2rem;
  }

  .fi-auth__top,
  .fi-auth__body {
    padding-inline: 2.5rem;
  }

  .fi-auth__headline {
    margin-bottom: 1.5rem;
  }

  .fi-auth__lede {
    margin-bottom: 1.5rem;
  }

  /* The lion stands left of the tag, peeking out from behind its corner as in
     V01, so it never covers the words on the tag */
  .fi-auth__card {
    padding-left: 9.5rem !important;
  }

  .fi-auth__mascot {
    top: auto;
    right: auto;
    left: -0.5rem;
    bottom: 0.5rem;
  }

  .fi-auth__mascot :deep(img) {
    height: 170px;
  }
}

/* The lion's moods. The box it stands in hides whatever drops below its
   floor, so "shy" sinks it down until only its ears show */
.fi-auth__mascot {
  overflow: hidden;
  padding: 1.5rem 0.5rem 0;
}

.fi-auth__lion {
  transform-origin: 50% 100%;
  transition: transform 0.35s cubic-bezier(0.3, 1.3, 0.5, 1);
}

.fi-auth__lion--watching {
  transform: translateY(-4px) rotate(-4deg) scale(1.03);
}

.fi-auth__lion--shy {
  transform: translateY(72%);
  transition-timing-function: cubic-bezier(0.5, 0, 0.75, 0);
  transition-duration: 0.3s;
}

.fi-auth__lion--oops {
  animation: fi-lion-oops 0.5s ease;
}

.fi-auth__lion--cheer {
  animation: fi-lion-cheer 0.55s cubic-bezier(0.3, 1.4, 0.5, 1);
}

@keyframes fi-lion-oops {
  20% {
    transform: rotate(-7deg);
  }
  40% {
    transform: rotate(6deg);
  }
  60% {
    transform: rotate(-4deg);
  }
  80% {
    transform: rotate(2deg);
  }
}

@keyframes fi-lion-cheer {
  40% {
    transform: translateY(-18%) scale(1.06);
  }
  70% {
    transform: translateY(0) scale(0.97, 1.03);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fi-auth__lion {
    transition: none;
    animation: none !important;
  }

  .fi-auth__lion--watching {
    transform: none;
  }
}

/* Narrow desktops: a smaller lion, so it only touches the tag's edge and
   never covers the words at the bottom of the tag */
@media (min-width: 992px) and (max-width: 1199.98px) {
  .fi-auth__card {
    padding-left: 8.75rem !important;
  }

  .fi-auth__mascot :deep(img) {
    width: auto;
    height: 130px;
  }
}
</style>
