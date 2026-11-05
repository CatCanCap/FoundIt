<script setup>
// The Both sides tab of a dispute case (Figma v3 V17b): each person's side, how
// many details of their lost report agree with the find, when they filed it
// and any proof; then those details beside the find (ItemCompare).
//   caseFile  GET /admin/disputes/:id
//   spots     GET /spots, for place names (may be empty)
import { computed, ref } from 'vue'
import ItemCompare from '@/components/safeguards/ItemCompare.vue'
import PhotoViewer from '@/components/safeguards/PhotoViewer.vue'
import { detailsInCommon, timingWords } from '@/utils/safeguards'

const props = defineProps({
  caseFile: { type: Object, required: true },
  spots: { type: Array, default: () => [] },
})

const DETAILS = 4
const viewer = ref(null)

const dispute = computed(() => props.caseFile.dispute)
const claimerName = computed(() => props.caseFile.claimer?.name || 'the claimer')
const raiserName = computed(() => props.caseFile.raisedBy?.name || 'the person who disputed')
const firstName = (name) => name.split(' ')[0]

function filed(lost) {
  if (!lost) return { text: 'No lost report', isLate: true }
  const timing = timingWords(lost.createdAt, props.caseFile.claim.createdAt)
  return { text: `Filed ${timing.text} the claim`, isLate: !timing.before }
}

const sides = computed(() => {
  const file = props.caseFile
  return [
    {
      key: 'claimer',
      role: 'claimer',
      testId: 'case-claimer',
      name: claimerName.value,
      words: dispute.value.claimerResponse,
      noWords: 'No reply yet',
      claimDetail: file.claim.detail || 'No detail given',
      common: detailsInCommon(file.foundItem, file.claimerLostItem, props.spots),
      filed: filed(file.claimerLostItem),
      proofUrl: dispute.value.claimerProofUrl,
    },
    {
      key: 'raiser',
      role: 'disputer',
      testId: 'case-raiser',
      name: raiserName.value,
      words: dispute.value.description,
      noWords: '',
      claimDetail: '',
      common: detailsInCommon(file.foundItem, file.raiserLostItem, props.spots),
      filed: filed(file.raiserLostItem),
      proofUrl: dispute.value.proofUrl,
    },
  ]
})

// The lost reports to set beside the found item
const compareReports = computed(() => [
  {
    key: 'claimer',
    role: 'claimer',
    title: firstName(claimerName.value),
    item: props.caseFile.claimerLostItem,
  },
  {
    key: 'raiser',
    role: 'disputer',
    title: firstName(raiserName.value),
    item: props.caseFile.raiserLostItem,
  },
])
</script>

<template>
  <div>
    <div class="sides">
      <article
        v-for="side in sides"
        :key="side.key"
        class="side"
        :class="`is-${side.role}`"
        :data-testid="side.testId"
      >
        <header class="side__top">
          <span class="a-who"
            >{{ side.name }} <small>{{ side.role }}</small></span
          >
          <span class="side__score" data-testid="case-agreement">
            <strong>{{ side.common ?? 0 }}</strong> of {{ DETAILS }} match
          </span>
        </header>
        <div class="side__pips" aria-hidden="true">
          <i v-for="pip in DETAILS" :key="pip" :class="{ 'is-on': pip <= (side.common ?? 0) }"></i>
        </div>

        <blockquote v-if="side.words">“{{ side.words }}”</blockquote>
        <blockquote v-else class="is-quiet">{{ side.noWords }}</blockquote>
        <p v-if="side.claimDetail" class="side__claim">At the claim: “{{ side.claimDetail }}”</p>

        <div class="side__foot">
          <span :class="{ 'is-late': side.filed.isLate }">{{ side.filed.text }}</span>
          <button
            v-if="side.proofUrl"
            type="button"
            class="side__proof"
            :data-testid="`proof-${side.key}`"
            @click="viewer.open(side.proofUrl, `${firstName(side.name)}'s proof`)"
          >
            <img :src="side.proofUrl" alt="" />
            <span>
              1 photo<span class="visually-hidden"> from {{ firstName(side.name) }}</span>
            </span>
          </button>
          <span v-else>No proof</span>
        </div>
      </article>
    </div>

    <h3 class="a-h sides-h">Against the find</h3>
    <ItemCompare :found="caseFile.foundItem" :reports="compareReports" :spots="spots" />

    <PhotoViewer ref="viewer" />
  </div>
</template>

<style scoped>
.sides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ds-space-4);
}

.side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--ds-space-4);
  border-radius: var(--ds-radius-control);
  background: color-mix(in srgb, var(--role) 8%, transparent);
}

.side__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ds-space-3);
}

.side__score {
  flex: none;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  font-variant-numeric: tabular-nums;
}

.side__score strong {
  color: var(--role);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  line-height: 1;
}

.side__pips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ds-space-1);
  margin-top: var(--ds-space-2);
}

.side__pips i {
  height: 0.3rem;
  border-radius: var(--ds-radius-round);
  background: color-mix(in srgb, var(--role) 20%, transparent);
}

.side__pips i.is-on {
  background: var(--role);
}

.side blockquote {
  margin: var(--ds-space-4) 0 0;
  font-size: var(--ds-size-lead);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.side blockquote.is-quiet {
  color: var(--ds-text-muted);
}

.side__claim {
  margin-top: var(--ds-space-2);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  overflow-wrap: anywhere;
}

.side__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-3);
  margin-top: auto;
  padding-top: var(--ds-space-4);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.side__foot .is-late {
  color: var(--ds-warning);
  font-weight: var(--ds-weight-medium);
}

.side__proof {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-action);
  font: inherit;
  font-weight: var(--ds-weight-medium);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: zoom-in;
}

.side__proof img {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--ds-radius-control);
  object-fit: cover;
}

.sides-h {
  margin-top: var(--ds-space-6);
}

@media (max-width: 767.98px) {
  .sides {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ds-space-3);
  }
}
</style>
