<script setup>
// The first tab of a dispute case (Figma v3 V17a): the item's journey, in the
// colour of whoever held it, and the three people with their records on other
// cases.
//   caseFile  GET /admin/disputes/:id
//   spots     GET /spots, for where it was found (may be empty)
import { computed } from 'vue'
import PersonHistory from '@/components/safeguards/PersonHistory.vue'
import { formatWhen, OUTCOMES } from '@/utils/safeguards'
import { placeName } from '@/utils/design'

const props = defineProps({
  caseFile: { type: Object, required: true },
  spots: { type: Array, default: () => [] },
})

const dispute = computed(() => props.caseFile.dispute)
const isOpen = computed(() => dispute.value.status === 'open')
const finderName = computed(() => props.caseFile.finder?.name || 'the finder')
const claimerName = computed(() => props.caseFile.claimer?.name || 'the claimer')
const raiserName = computed(() => props.caseFile.raisedBy?.name || 'the person who disputed')

const foundPlace = computed(() => {
  const spotId = props.caseFile.foundItem?.trail?.[0]?.spotId
  const spot = props.spots.find((entry) => entry.id === spotId)
  return spot ? `${placeName(spot)}, ${spot.floor}` : ''
})

const people = computed(() =>
  [
    { role: 'finder', person: props.caseFile.finder },
    { role: 'claimer', person: props.caseFile.claimer },
    { role: 'disputer', person: props.caseFile.raisedBy },
  ].filter((entry) => entry.person),
)

const dayOf = (iso) => formatWhen(iso).split(', ')[0]
const timeOf = (iso) => formatWhen(iso).split(', ')[1]
</script>

<template>
  <div class="summary" data-testid="case-summary">
    <ol class="story">
      <li class="beat is-finder">
        <div class="beat__when">
          {{ dayOf(caseFile.foundItem.createdAt) }}<br />{{ timeOf(caseFile.foundItem.createdAt) }}
        </div>
        <div class="beat__line" aria-hidden="true"></div>
        <div class="beat__body">
          <span class="a-who">{{ finderName }} <small>finder</small></span>
          <p>
            Handed it in<template v-if="foundPlace"> at {{ foundPlace }}</template
            >.
          </p>
        </div>
      </li>
      <li class="beat is-claimer">
        <div class="beat__when">
          {{ dayOf(caseFile.claim.createdAt) }}<br />{{ timeOf(caseFile.claim.createdAt) }}
        </div>
        <div class="beat__line" aria-hidden="true"></div>
        <div class="beat__body">
          <span class="a-who">{{ claimerName }} <small>claimer</small></span>
          <p>
            Claimed it<template v-if="caseFile.claim.detail"
              >, saying: “{{ caseFile.claim.detail }}”</template
            ><template v-else>.</template>
          </p>
        </div>
      </li>
      <li class="beat is-disputer">
        <div class="beat__when">
          {{ dayOf(dispute.createdAt) }}<br />{{ timeOf(dispute.createdAt) }}
        </div>
        <div class="beat__line" aria-hidden="true"></div>
        <div class="beat__body">
          <span class="a-who">{{ raiserName }} <small>disputer</small></span>
          <p>Says it's theirs.<template v-if="isOpen"> The handoff is paused.</template></p>
        </div>
      </li>
      <li class="beat is-now" data-testid="case-job">
        <div class="beat__when">
          <template v-if="isOpen">Now</template>
          <template v-else>
            {{ dayOf(dispute.decidedAt) }}<br />{{ timeOf(dispute.decidedAt) }}
          </template>
        </div>
        <div class="beat__line" aria-hidden="true"></div>
        <div class="beat__body">
          <template v-if="isOpen">
            <strong>Waiting for you</strong>
            <p>Decide who it belongs to. Nothing changes until you log it.</p>
          </template>
          <template v-else>
            <strong>{{ OUTCOMES[dispute.status]?.long }}</strong>
            <p>The reason is on the last tab.</p>
          </template>
        </div>
      </li>
    </ol>

    <aside class="a-record">
      <h3 class="a-h" style="margin: 0">On record, other cases</h3>
      <div v-for="entry in people" :key="entry.role" class="a-record__one">
        <span class="a-who" :class="`is-${entry.role}`">
          {{ entry.person.name }} <small>{{ entry.role }}</small>
        </span>
        <a :href="`mailto:${entry.person.email}`" class="a-record__mail">{{
          entry.person.email
        }}</a>
        <PersonHistory :history="entry.person.history" :data-testid="`history-${entry.role}`" />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  gap: var(--ds-space-7);
  align-items: start;
}

.story {
  margin: 0;
  padding: 0;
  list-style: none;
}

.beat {
  display: grid;
  grid-template-columns: 5.25rem 1rem minmax(0, 1fr);
  column-gap: var(--ds-space-3);
}

.beat__when {
  padding-top: 0.1rem;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.beat__line {
  position: relative;
  display: flex;
  justify-content: center;
}

.beat__line::before {
  content: '';
  position: absolute;
  top: 0.3rem;
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  background: var(--role);
}

/* The line is the person who held the item until the next event */
.beat__line::after {
  content: '';
  position: absolute;
  top: 1.3rem;
  bottom: -0.2rem;
  border-left: 4px solid var(--role);
}

.beat.is-finder .beat__line::after {
  border-left-width: 2px;
}

.beat.is-disputer .beat__line::after {
  border-left-style: dashed;
}

.beat__body {
  min-width: 0;
  padding-bottom: var(--ds-space-5);
}

.beat__body p {
  margin-top: var(--ds-space-1);
  overflow-wrap: anywhere;
}

.beat.is-now .beat__line::before {
  border: 2px dashed var(--ds-border-control);
  background: var(--ds-surface);
}

.beat.is-now .beat__line::after {
  display: none;
}

.beat.is-now .beat__body {
  padding-bottom: 0;
}

@media (max-width: 1023.98px) {
  .summary {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ds-space-5);
  }
}

@media (max-width: 767.98px) {
  .beat {
    grid-template-columns: 3.75rem 1rem minmax(0, 1fr);
    column-gap: var(--ds-space-2);
  }
}
</style>
