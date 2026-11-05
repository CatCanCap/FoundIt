<script setup>
// WS2. The welcome card at the top of the feed for a student with a new match:
// a small picture of the find, "Good afternoon, Alice. Your flask may have
// turned up.", where and when, and the buttons. It is one line on a laptop, and
// wraps with the buttons underneath on smaller screens. It stays out of the
// score and the reasons; the Matches page and the item's page have those.
//   hero        what to say, worked out by the feed page
//   greeting    "Good morning", to start the line
//   firstName   the student's first name, or '' to leave it out
//   showAll     true to add a "See all matches" button
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { resizedPhotoUrl } from '@/services/cloudinary'

defineProps({
  hero: { type: Object, required: true },
  greeting: { type: String, required: true },
  firstName: { type: String, default: '' },
  showAll: { type: Boolean, default: false },
})
</script>

<template>
  <section
    class="feed-hero ds-inverse d-flex flex-wrap flex-lg-nowrap align-items-center"
    data-testid="feed-hero"
    aria-labelledby="hero-title"
  >
    <div
      class="feed-hero__photo position-relative d-grid flex-shrink-0 overflow-hidden"
      aria-hidden="true"
    >
      <img
        v-if="hero.photoUrl"
        class="position-absolute top-0 start-0 w-100 h-100 object-fit-contain"
        :src="resizedPhotoUrl(hero.photoUrl, 200)"
        alt=""
      />
      <ItemIcon v-else :category="hero.category" :size="34" :tone="hero.tone" />
    </div>

    <div class="feed-hero__text flex-grow-1">
      <h2 id="hero-title" class="feed-hero__title mb-0">
        {{ greeting }}<template v-if="firstName">, {{ firstName }}</template
        >.
        <span class="feed-hero__news">Your {{ hero.word }} may have turned up.</span>
      </h2>
      <p class="feed-hero__lede mb-0">
        Someone handed in a <strong>{{ hero.title }}</strong
        ><template v-if="hero.place">
          at <strong>{{ hero.place }}</strong></template
        ><template v-if="hero.gap"
          >, {{ hero.gap }} after you lost yours<template v-if="hero.sameBuilding">
            there</template
          ></template
        >.
      </p>
    </div>

    <div class="feed-hero__actions d-flex flex-wrap gap-2 flex-shrink-0">
      <BaseButton :to="hero.to" data-testid="feed-hero-claim"> Is it yours? </BaseButton>
      <BaseButton v-if="showAll" to="/matches" variant="secondary" data-testid="feed-hero-all">
        See all matches
      </BaseButton>
    </div>
  </section>
</template>

<style scoped>
/* A card in the other theme's colours (ds-inverse), so it stands out from the
   page, with a thin gold edge, because gold means a match */
.feed-hero {
  gap: var(--ds-space-3) var(--ds-space-4);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-signal);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  color: var(--ds-text);
  /* It slides down into place when it appears */
  animation: feed-hero-drop var(--ds-dur-max) var(--ds-ease-out) both;
}

@keyframes feed-hero-drop {
  from {
    opacity: 0;
    translate: 0 calc(-1 * var(--ds-space-3));
  }
}

/* For people who turn down motion: a short fade instead */
@media (prefers-reduced-motion: reduce) {
  .feed-hero {
    animation: feed-hero-fade var(--ds-dur-base) linear both;
  }
}

@keyframes feed-hero-fade {
  from {
    opacity: 0;
  }
}

/* The small picture of the find */
.feed-hero__photo {
  width: 4rem;
  height: 4rem;
  place-items: center;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.feed-hero__text {
  /* On a phone the words share the first row with the picture */
  flex-basis: calc(100% - 4rem - var(--ds-space-4));
  min-width: 0;
}

.feed-hero__title {
  color: inherit;
  font-family: inherit;
  letter-spacing: 0;
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
  line-height: var(--ds-leading-body);
}

/* The news itself, in gold because it is a match */
.feed-hero__news {
  color: var(--ds-signal-text);
}

.feed-hero__lede {
  margin-top: var(--ds-space-1);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.feed-hero__lede strong {
  color: var(--ds-text);
}

/* On smaller screens the buttons share a row under the words */
.feed-hero__actions {
  width: 100%;
}

.feed-hero__actions :deep(.fi-button) {
  padding-inline: var(--ds-space-3);
  white-space: nowrap;
  flex: 1 1 0;
}

/* From 992px it's one line: picture, words, then the buttons at the end */
@media (min-width: 992px) {
  .feed-hero__text {
    flex-basis: auto;
  }

  .feed-hero__actions {
    width: auto;
  }

  .feed-hero__actions :deep(.fi-button) {
    flex: none;
  }
}
</style>
