<script setup>
// Grey shapes the size of what is loading, in place of the word "Loading…", so
// nothing jumps when the page arrives. Give what arrives the ds-arrive class.
//   kind   'rows'   a list of rows, each with a picture
//          'detail' a picture beside some facts (an item, a case)
//          'facts'  just the facts, for a page that already has its picture
//          'form'   labels and fields
//          'lines'  a few short lines, for a corner of a page
//   count  how many rows, fields or lines
//   label  what screen readers hear, "Loading your claims…"
defineProps({
  kind: { type: String, default: 'rows' },
  count: { type: Number, default: 3 },
  label: { type: String, default: 'Loading…' },
})
</script>

<template>
  <div class="page-skeleton" :class="`is-${kind}`" role="status">
    <span class="visually-hidden">{{ label }}</span>

    <ul v-if="kind === 'rows'" class="page-skeleton__rows" aria-hidden="true">
      <li v-for="n in count" :key="n" class="page-skeleton__row">
        <span class="ds-skeleton page-skeleton__thumb"></span>
        <span class="page-skeleton__words">
          <span class="ds-skeleton page-skeleton__bar is-title"></span>
          <span class="ds-skeleton page-skeleton__bar"></span>
        </span>
      </li>
    </ul>

    <div v-else-if="kind === 'detail'" class="row g-4" aria-hidden="true">
      <div class="col-12 col-md-5">
        <span class="ds-skeleton page-skeleton__picture"></span>
      </div>
      <div class="col-12 col-md-7 ps-md-4 page-skeleton__facts">
        <span class="ds-skeleton page-skeleton__bar is-small"></span>
        <span class="ds-skeleton page-skeleton__bar is-heading"></span>
        <span v-for="n in count" :key="n" class="ds-skeleton page-skeleton__bar"></span>
        <span class="ds-skeleton page-skeleton__box"></span>
      </div>
    </div>

    <div v-else-if="kind === 'facts'" class="page-skeleton__facts" aria-hidden="true">
      <span class="ds-skeleton page-skeleton__bar is-small"></span>
      <span class="ds-skeleton page-skeleton__bar is-heading"></span>
      <span v-for="n in count" :key="n" class="ds-skeleton page-skeleton__bar"></span>
      <span class="ds-skeleton page-skeleton__box"></span>
    </div>

    <div v-else-if="kind === 'form'" class="page-skeleton__form" aria-hidden="true">
      <span class="ds-skeleton page-skeleton__bar is-heading"></span>
      <div v-for="n in count" :key="n" class="page-skeleton__field">
        <span class="ds-skeleton page-skeleton__bar is-small"></span>
        <span class="ds-skeleton page-skeleton__input"></span>
      </div>
    </div>

    <div v-else class="page-skeleton__lines" aria-hidden="true">
      <span v-for="n in count" :key="n" class="ds-skeleton page-skeleton__bar"></span>
    </div>
  </div>
</template>

<style scoped>
.page-skeleton__rows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.page-skeleton__row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  padding-block: var(--ds-space-3);
  border-bottom: 1px solid var(--ds-border);
}

.page-skeleton__thumb {
  flex-shrink: 0;
  width: var(--ds-row-h);
  height: var(--ds-row-h);
  border-radius: var(--ds-radius-control);
}

.page-skeleton__words {
  display: grid;
  flex: 1;
  gap: var(--ds-space-2);
  min-width: 0;
}

.page-skeleton__bar {
  width: 100%;
  height: var(--ds-space-3);
}

.page-skeleton__bar.is-small {
  width: 30%;
}

.page-skeleton__bar.is-title {
  width: 60%;
  height: var(--ds-space-4);
}

.page-skeleton__bar.is-heading {
  width: 70%;
  height: var(--ds-space-6);
}

.page-skeleton__picture {
  aspect-ratio: 4 / 3;
  border-radius: var(--ds-radius-surface);
}

.page-skeleton__facts {
  display: grid;
  gap: var(--ds-space-4);
}

.page-skeleton__box {
  height: calc(var(--ds-space-9) + var(--ds-space-6));
  border-radius: var(--ds-radius-surface);
}

.page-skeleton__form {
  display: grid;
  gap: var(--ds-space-5);
  width: 100%;
  max-width: 40rem;
  margin-inline: auto;
}

.page-skeleton__field {
  display: grid;
  gap: var(--ds-space-2);
}

.page-skeleton__input {
  height: var(--ds-control-h);
  border-radius: var(--ds-radius-control);
}

.page-skeleton__lines {
  display: grid;
  gap: var(--ds-space-2);
}
</style>
