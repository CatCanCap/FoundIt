<script setup>
// The Both sides tab's comparison: the found item and each lost report side by
// side, one row per detail that can be compared (category, colour, brand,
// where, when), so the admin reads straight across a row. Details of a lost
// report that agree with the found item are marked "Same". On a phone each
// row stacks.
//   found      the found item (GET /admin/disputes/:id foundItem)
//   reports    [{ key, title, item }]: each lost report (item may be null)
//   spots      GET /spots, for building and floor names
import { computed } from 'vue'
import { compareWithFound, formatWhen, colourList } from '@/utils/safeguards'
import { placeName } from '@/utils/design'

const props = defineProps({
  found: { type: Object, required: true },
  reports: { type: Array, required: true },
  spots: { type: Array, default: () => [] },
})

function places(item) {
  const names = (item.trail || []).map((point) => {
    const spot = props.spots.find((entry) => entry.id === point.spotId)
    return spot ? `${placeName(spot)}, ${spot.floor}` : 'A campus spot'
  })
  return names.length ? [...new Set(names)] : ['–']
}

function when(item) {
  const trail = item.trail || []
  if (!trail.length) return '–'
  const start = formatWhen(trail[0].from)
  const end = formatWhen(trail[trail.length - 1].to)
  // "8 Oct, 12:00 – 12:30" on one day, the full date twice otherwise
  return start.split(', ')[0] === end.split(', ')[0]
    ? `${start} – ${end.split(', ')[1]}`
    : `${start} – ${end}`
}

const PLACE_TAGS = { spot: 'Same spot', building: 'Same building' }

// Each row: how to show an item's value (as lines), and the tag to add when a
// lost report agrees with the found item
const FIELDS = [
  {
    key: 'category',
    label: 'Category',
    lines: (item) => [item.category],
    tag: (match) => match.category && 'Same',
  },
  {
    key: 'colour',
    label: 'Colour',
    // Every colour, main colour first: "Navy, White"
    lines: (item) => [colourList(item).join(', ') || '–'],
    tag: (match) => match.colour && 'Same',
  },
  {
    key: 'brand',
    label: 'Brand',
    lines: (item) => [item.brand || '–'],
    tag: (match) => match.brand && 'Same',
  },
  { key: 'where', label: 'Where', lines: places, tag: (match) => PLACE_TAGS[match.place] },
  { key: 'when', label: 'When', lines: (item) => [when(item)] },
  {
    key: 'description',
    label: 'Description',
    lines: (item) => [item.description || '–'],
    tag: (match) =>
      match.sharedWords.length && `In common: ${match.sharedWords.slice(0, 4).join(', ')}`,
  },
]

const columns = computed(() =>
  props.reports.map((report) => ({
    ...report,
    match: report.item ? compareWithFound(props.found, report.item, props.spots) : null,
  })),
)

const rows = computed(() =>
  FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    found: field.lines(props.found),
    cells: columns.value.map((column) => {
      if (!column.item) return { key: column.key, lines: ['–'] }
      const tag = field.tag ? field.tag(column.match) : ''
      return { key: column.key, lines: field.lines(column.item), tag, state: tag ? 'match' : '' }
    }),
  })),
)
</script>

<template>
  <div class="compare" data-testid="case-compare">
    <table class="compare-table">
      <thead>
        <tr>
          <th scope="col" class="compare-label"><span class="visually-hidden">Detail</span></th>
          <th scope="col"><span class="a-who is-finder">The find</span></th>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :data-testid="`compare-${column.key}`"
          >
            <span class="a-who" :class="`is-${column.role}`">{{ column.title }}</span>
            <span v-if="!column.item" class="compare-none">No lost report on file.</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th scope="row" class="compare-label">{{ row.label }}</th>
          <td data-who="Find">
            <span v-for="line in row.found" :key="line" class="d-block">{{ line }}</span>
          </td>
          <td
            v-for="(cell, index) in row.cells"
            :key="cell.key"
            :data-who="columns[index].title"
            :class="cell.state && `is-${cell.state}`"
            :data-testid="`compare-${cell.key}-${row.key}`"
          >
            <span class="compare-value">
              <span v-for="line in cell.lines" :key="line" class="d-block">{{ line }}</span>
            </span>
            <span v-if="cell.tag" class="compare-tag">{{ cell.tag }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ds-size-small);
  table-layout: fixed;
}

.compare-table th,
.compare-table td {
  padding: var(--ds-space-2) var(--ds-space-3);
  border-bottom: 1px solid var(--ds-border);
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.compare-table thead th {
  border-bottom: 1.5px solid var(--ds-text-muted);
}

.compare-label {
  width: 5.5rem;
  padding-left: 0 !important;
}

tbody .compare-label {
  color: var(--ds-text-muted);
  font-weight: var(--ds-weight-medium);
}

.compare-none {
  display: block;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-regular);
}

.compare-table td:not(.is-match) .compare-value {
  color: var(--ds-text-muted);
}

.compare-table td:first-of-type .compare-value,
.compare-table td[data-who='Find'] {
  color: var(--ds-text);
}

.compare-table td.is-match {
  background: color-mix(in srgb, var(--ds-success) 11%, transparent);
}

.compare-table td.is-match .compare-value {
  font-weight: var(--ds-weight-medium);
}

.compare-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  margin-top: 0.1rem;
  color: var(--ds-success);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

/* A tick drawn from two edges, so it scales with the text */
.compare-tag::before {
  content: '';
  width: 0.3rem;
  height: 0.6rem;
  margin: -0.15rem 0.1rem 0;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  rotate: 45deg;
}

@media (max-width: 767.98px) {
  .compare-table,
  .compare-table tbody,
  .compare-table tr,
  .compare-table td,
  .compare-table tbody th {
    display: block;
    width: auto;
  }

  .compare-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .compare-table tr {
    padding-block: var(--ds-space-2);
    border-bottom: 1px solid var(--ds-border);
  }

  .compare-table tbody th {
    padding: 0 0 var(--ds-space-1);
    border: 0;
    color: var(--ds-text);
    font-weight: var(--ds-weight-bold);
  }

  .compare-table td {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    padding: var(--ds-space-1) var(--ds-space-2);
    border: 0;
  }

  .compare-table td::before {
    content: attr(data-who);
    color: var(--ds-text-muted);
  }

  .compare-table td > * {
    grid-column: 2;
  }
}
</style>
