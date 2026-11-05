<script setup>
// What the Admin list is showing: a clickable count for each group, which also
// says how the queue stands, and one switch for the order. The groups are radio
// buttons underneath, so arrow keys work.
//   v-model:show  the picked group's value
//   v-model:sort  'oldest' or 'newest'
//   options       [{ value: 'open', label: 'Waiting', count: 12 }, ...], or null
//                 for a list with no groups
import { useId } from 'vue'

const show = defineModel('show', { type: String, default: '' })
const sort = defineModel('sort', { type: String, required: true })

defineProps({
  options: { type: Array, default: null },
})

const name = useId()

function flip() {
  sort.value = sort.value === 'oldest' ? 'newest' : 'oldest'
}
</script>

<template>
  <div class="filters">
    <fieldset v-if="options" class="filters__show">
      <legend class="visually-hidden">Show</legend>
      <label
        v-for="option in options"
        :key="option.value"
        class="filters__count"
        :class="{ 'is-on': show === option.value }"
      >
        <input
          v-model="show"
          class="visually-hidden"
          type="radio"
          :name="name"
          :value="option.value"
          :data-testid="`toggle-${option.value}`"
        />
        <strong>{{ option.count }}</strong>
        {{ option.label }}
      </label>
    </fieldset>

    <button
      type="button"
      class="filters__sort"
      :class="{ 'is-newest': sort === 'newest' }"
      data-testid="sort-flip"
      @click="flip"
    >
      <span class="visually-hidden">Sort: </span
      >{{ sort === 'oldest' ? 'Oldest first' : 'Newest first' }}<i aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2) var(--ds-space-6);
}

.filters__show {
  display: flex;
  gap: var(--ds-space-6);
  margin: 0;
  padding: 0;
  border: 0;
}

.filters__count {
  min-height: var(--ds-control-h);
  padding-bottom: var(--ds-space-1);
  border-bottom: 2px solid transparent;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  cursor: pointer;
  transition:
    color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.filters__count:hover {
  color: var(--ds-text);
}

.filters__count:has(:focus-visible) {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.filters__count strong {
  display: block;
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.filters__count.is-on {
  border-color: var(--ds-action);
  color: var(--ds-text);
  font-weight: var(--ds-weight-medium);
}

.filters__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h);
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

.filters__sort:hover {
  color: var(--ds-text);
}

.filters__sort i {
  width: 0.5rem;
  height: 0.5rem;
  margin-top: -0.2rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  rotate: 45deg;
  transition: rotate var(--ds-dur-fast) var(--ds-ease-out);
}

.filters__sort.is-newest i {
  margin-top: 0.2rem;
  rotate: 225deg;
}

@media (prefers-reduced-motion: reduce) {
  .filters__sort i {
    transition: none;
  }
}
</style>
