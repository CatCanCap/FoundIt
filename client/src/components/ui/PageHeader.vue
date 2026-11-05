<script setup>
// Shared page header: optional eyebrow, the <h1> with an optional accent word,
// an optional lede (or #lede slot) and an #actions slot on the right.
//   <PageHeader eyebrow="Map" title="Where things" accent="go missing" lede="..." />
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  accent: { type: String, default: '' },
  lede: { type: String, default: '' },
  titleTestid: { type: String, default: undefined },
})
</script>

<template>
  <header
    class="fi-page-header d-flex flex-wrap align-items-end justify-content-between gap-3"
    data-testid="page-header"
  >
    <div>
      <p v-if="eyebrow" class="fi-eyebrow mb-1">{{ eyebrow }}</p>
      <h1 class="fi-page-header__title mb-0" :data-testid="titleTestid">
        {{ title }}
        <em v-if="accent" class="fi-accent">{{ accent }}</em>
      </h1>
      <p v-if="lede || $slots.lede" class="fi-page-header__lede mt-2 mb-0">
        <slot name="lede">{{ lede }}</slot>
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="fi-page-header__actions d-flex flex-wrap align-items-center gap-2"
    >
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
/* Straight on the page, over a heavy ink rule */
.fi-page-header {
  color: var(--fi-ink);
  padding-bottom: 1.25rem;
  border-bottom: 2px solid var(--fi-ink);
}

.fi-page-header__title {
  font-size: clamp(2rem, 6vw, 2.9rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.035em;
}

.fi-page-header__lede {
  color: var(--fi-mist);
  font-size: 1.0625rem;
}

/* Phones: actions on their own full-width row */
@media (max-width: 575.98px) {
  .fi-page-header__actions {
    width: 100%;
  }
}

@media (min-width: 576px) {
  .fi-page-header {
    padding-bottom: 1.5rem;
  }
}

/* Inside a rebuilt page (class="ds", assets/system.css): the title in the
   display face, a muted line under it, and no rule. The design system has no
   eyebrow labels or serif accent words, so the eyebrow is left out and the
   accent reads as part of the title; rebuilt pages can drop both props.
   Pages not rebuilt yet keep the look above. */
.ds .fi-page-header {
  color: var(--ds-text);
  padding-bottom: var(--ds-space-5);
  border-bottom: 0;
}

.ds .fi-page-header .fi-eyebrow {
  display: none;
}

.ds .fi-page-header__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h1);
  line-height: var(--ds-leading-h1);
  font-weight: var(--ds-weight-bold);
  letter-spacing: -0.02em;
}

.ds .fi-page-header__title .fi-accent {
  font: inherit;
  color: inherit;
}

.ds .fi-page-header__lede {
  max-width: 40rem;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-lead);
  line-height: var(--ds-leading-lead);
}

@media (min-width: 576px) {
  .ds .fi-page-header {
    padding-bottom: var(--ds-space-6);
  }
}
</style>
