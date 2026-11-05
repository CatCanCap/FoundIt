<script setup>
// Returns (WS5, /returns; /handoffs still leads here). Two tabs:
//   Claims and chats  every claim you made, and every claim on something you
//                     found, one row per item: its live claim, with any
//                     declined or closed claims folded under it ("Declined
//                     (2)"). Filters: Open (the default: anything that still
//                     needs someone), Declined, Closed, Resolved and All.
//   Things you found  every item you handed in, claimed or not, with what it
//                     is up to; your lost reports are on Matches instead.
// The tab and filter live in the address bar (?tab=found, ?show=declined).
// A chat with a message you have not seen is marked "New message". On a
// declined or closed claim, tapping "See why" counts as seeing it. The list
// follows the shared store, so it never goes stale while it is open.
// Built in the design system (class="ds", assets/system.css): underlined tabs,
// a quieter row of filters under them, and rows that open as a whole.
//
// Data: GET /api/claims/mine (shared with the header's badge through
// stores/handoffs.js) and GET /api/items?type=found&postedBy=<you>.
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConnectionProblem from '@/components/ui/ConnectionProblem.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { ledgerNumber, mainColour } from '@/utils/design'
import { useAuthStore } from '@/stores/auth'
import { useHandoffsStore } from '@/stores/handoffs'
import { hasNewMessage, isYourTurn, rowState, waitingFor } from '@/utils/handoff'
import {
  FILTERS,
  TABS,
  declinedNote,
  filterCounts,
  foundItemStatus,
  groupByItem,
  inFilter,
  pickFilter,
  pickTab,
  whyLink,
} from '@/utils/returns'
import { errorText, formatWhen, isConnectionError } from '@/utils/safeguards'

const FOUND_LIMIT = 200

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const handoffs = useHandoffsStore()

// The same rows as the header's badge, so the list updates whenever the badge
// does (every 15 seconds, and after every step in a handoff)
const { rows } = storeToRefs(handoffs)
const loading = ref(true)
const loadError = ref('')
// No answer from FoundIt: the "can't reach" panel, whose Try again loads again
const cantReach = ref(false)

const tab = computed(() => pickTab(route.query.tab))
const filter = computed(() => pickFilter(route.query.show))

const groups = computed(() => groupByItem(rows.value))
const counts = computed(() => filterCounts(groups.value))
const shown = computed(() => groups.value.filter((group) => inFilter(group, filter.value)))

// Things you found: loaded the first time the tab opens
const found = ref([])
const foundLoaded = ref(false)
const foundLoading = ref(false)
const foundError = ref('')
const foundCantReach = ref(false)

async function loadFound() {
  if (foundLoaded.value || foundLoading.value || !auth.user) return
  foundLoading.value = true
  foundError.value = ''
  try {
    const response = await api.get('/items', {
      params: { type: 'found', postedBy: auth.user.id, limit: FOUND_LIMIT },
    })
    found.value = response.data
    foundLoaded.value = true
    foundCantReach.value = false
  } catch (error) {
    foundCantReach.value = isConnectionError(error)
    if (!foundCantReach.value) foundError.value = errorText(error)
  } finally {
    foundLoading.value = false
  }
}

async function loadRows() {
  loading.value = true
  loadError.value = ''
  try {
    // A check already on its way is shared with the header
    await handoffs.fetchRows()
    cantReach.value = false
  } catch (error) {
    cantReach.value = isConnectionError(error)
    if (!cantReach.value) loadError.value = errorText(error)
  } finally {
    loading.value = false
  }
}

onMounted(loadRows)

watch(
  tab,
  (value) => {
    if (value === 'found') loadFound()
  },
  { immediate: true },
)

function setQuery(fields) {
  router.replace({ query: { ...route.query, ...fields } })
}

// Folded declined and closed claims, opened one item at a time. The Declined
// and Closed filters are about the folded claims, so there they start open,
// but the arrow can still close each one.
const opened = ref(new Set())
const closedHere = ref(new Set())
const startsOpen = computed(() => filter.value === 'declined' || filter.value === 'closed')
function isOpen(group) {
  return startsOpen.value ? !closedHere.value.has(group.key) : opened.value.has(group.key)
}
function toggle(group) {
  const list = startsOpen.value ? closedHere : opened
  const next = new Set(list.value)
  if (next.has(group.key)) next.delete(group.key)
  else next.add(group.key)
  list.value = next
}
// A new filter starts fresh: open under Declined or Closed, folded elsewhere
watch(filter, () => {
  closedHere.value = new Set()
})

// "See why" counts as reading that claim's news, wherever it leads (a closed
// chat cannot be opened, and My disputes or the item page do not clear it)
function seeWhy(row) {
  if (row.lastMessage?.sentAt) handoffs.markSeen(row.matchId, row.lastMessage.sentAt)
}

// How a status reads: navy and bold when it is your turn, muted while you
// wait, green once the item is back, red when the claim ended or is paused
function tone(row) {
  const state = rowState(row)
  if (state === 'resolved') return 'done'
  if (state === 'declined' || state === 'closed' || state === 'paused') return 'ended'
  return isYourTurn(row) ? 'turn' : 'waiting'
}

// The same four for Things you found (utils/returns.js names them by colour)
const FOUND_TONES = { brass: 'turn', navy: 'waiting', green: 'done', grey: 'waiting' }
function foundTone(item) {
  return FOUND_TONES[foundItemStatus(item, rows.value).tone] || 'waiting'
}

function roleLine(row) {
  return row.role === 'owner' ? 'You claimed this' : 'You found this'
}

function foldLabel(group) {
  const parts = []
  if (group.declined.length) parts.push(`Declined (${group.declined.length})`)
  if (group.closed.length) parts.push(`Closed (${group.closed.length})`)
  return parts.join(' · ')
}

const emptyText = computed(() => {
  if (rows.value.length === 0) {
    return 'Nothing yet. When you claim a match, or someone claims something you found, the chat shows up here.'
  }
  return {
    open: 'Nothing needs you right now.',
    declined: 'No declined claims.',
    closed: 'No closed claims.',
    resolved: 'Nothing has been returned yet.',
    all: 'Nothing yet.',
  }[filter.value]
})
</script>

<template>
  <div class="ds returns-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap returns">
      <PageHeader
        title="Your returns"
        title-testid="returns-title"
        lede="Claims and chats about things lost and found, and everything you handed in. Contact details stay hidden."
      />

      <nav class="returns-tabs" aria-label="Returns" role="tablist">
        <button
          v-for="entry in TABS"
          :key="entry.key"
          type="button"
          role="tab"
          class="returns-tabs__tab"
          :aria-selected="tab === entry.key"
          :data-testid="`tab-${entry.key}`"
          @click="setQuery({ tab: entry.key === 'claims' ? undefined : entry.key })"
        >
          {{ entry.label }}
          <span v-if="entry.key === 'claims' && counts.open" class="returns-tabs__count ds-num">
            {{ counts.open }}
          </span>
        </button>
      </nav>

      <!-- Claims and chats -->
      <template v-if="tab === 'claims'">
        <ConnectionProblem
          v-if="cantReach"
          :busy="loading"
          data-testid="handoffs-error"
          @retry="loadRows"
        />
        <PageSkeleton v-else-if="loading" label="Loading your claims and chats…" />
        <div v-else-if="loadError" class="returns-panel" role="alert" data-testid="handoffs-error">
          <p class="mb-0">{{ loadError }}</p>
        </div>

        <div v-else class="ds-arrive">
          <div class="returns-filters" role="group" aria-label="Show">
            <button
              v-for="entry in FILTERS"
              :key="entry.key"
              type="button"
              class="returns-filters__option"
              :aria-pressed="filter === entry.key"
              :data-testid="`filter-${entry.key}`"
              @click="setQuery({ show: entry.key === 'open' ? undefined : entry.key })"
            >
              {{ entry.label }}
              <span class="badge returns-filters__count ds-num">{{ counts[entry.key] }}</span>
            </button>
          </div>

          <section v-if="shown.length === 0" class="returns-panel" data-testid="handoffs-empty">
            <p class="mb-0">{{ emptyText }}</p>
            <BaseButton
              v-if="rows.length === 0"
              to="/matches"
              variant="secondary"
              data-testid="handoffs-empty-matches"
            >
              See your matches
            </BaseButton>
            <button
              v-else-if="filter !== 'all'"
              type="button"
              class="ds-link returns-panel__link"
              @click="setQuery({ show: 'all' })"
            >
              Show all
            </button>
          </section>

          <ol v-else class="returns-list">
            <li
              v-for="group in shown"
              :key="group.key"
              class="returns-list__item"
              data-testid="handoff-group"
            >
              <!-- The live (or resolved) claim: the whole row opens the chat -->
              <div
                v-if="group.main"
                class="returns-row returns-row--link"
                data-testid="handoff-row"
              >
                <div class="returns-row__picture">
                  <img
                    v-if="group.item?.photoUrl"
                    :src="group.item.photoUrl"
                    :alt="group.item.title"
                    loading="lazy"
                  />
                  <ItemIcon
                    v-else
                    :category="group.item?.category"
                    :colour="mainColour(group.item)"
                    :size="32"
                  />
                </div>
                <div class="returns-row__text">
                  <p class="handoffs__title returns-row__title">
                    {{ group.item?.title || 'Item' }}
                  </p>
                  <p class="returns-row__meta">
                    <span v-if="group.item" class="ds-num">{{ ledgerNumber(group.item.id) }}</span>
                    <span>{{ roleLine(group.main) }}</span>
                    <span>{{ formatWhen(group.main.claimedAt) }}</span>
                  </p>
                </div>
                <p class="returns-row__status">
                  <span
                    v-if="hasNewMessage(group.main, handoffs.seen)"
                    class="returns-new"
                    data-testid="handoff-new"
                  >
                    New message
                  </span>
                  <span class="returns-status" :class="`is-${tone(group.main)}`">
                    {{ waitingFor(group.main) }}
                  </span>
                </p>
                <RouterLink
                  :to="`/matches/${group.main.matchId}/handoff`"
                  class="returns-row__open stretched-link"
                >
                  <span class="visually-hidden"
                    >Open chat about {{ group.item?.title || 'item' }}</span
                  >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </RouterLink>
              </div>

              <!-- No live claim: the item's name, with its ended claims below -->
              <div v-else class="returns-row" data-testid="handoff-row">
                <div class="returns-row__picture">
                  <img
                    v-if="group.item?.photoUrl"
                    :src="group.item.photoUrl"
                    :alt="group.item.title"
                    loading="lazy"
                  />
                  <ItemIcon
                    v-else
                    :category="group.item?.category"
                    :colour="mainColour(group.item)"
                    :size="32"
                  />
                </div>
                <div class="returns-row__text">
                  <p class="handoffs__title returns-row__title">
                    {{ group.item?.title || 'Item' }}
                  </p>
                  <p class="returns-row__meta">
                    <span v-if="group.item" class="ds-num">{{ ledgerNumber(group.item.id) }}</span>
                    <span>{{ roleLine(group.declined[0] || group.closed[0]) }}</span>
                  </p>
                </div>
              </div>

              <!-- Declined and closed claims, folded -->
              <div
                v-if="group.declined.length || group.closed.length"
                class="returns-fold"
                data-testid="handoff-fold"
              >
                <button
                  type="button"
                  class="returns-fold__toggle"
                  :aria-expanded="isOpen(group)"
                  data-testid="handoff-fold-toggle"
                  @click="toggle(group)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                  {{ foldLabel(group) }}
                </button>
                <ul v-if="isOpen(group)" class="returns-fold__list">
                  <li
                    v-for="row in [...group.declined, ...group.closed]"
                    :key="row.matchId"
                    class="returns-past"
                    data-testid="handoff-past-row"
                  >
                    <span class="returns-status" :class="`is-${tone(row)}`">
                      {{ waitingFor(row) }}
                    </span>
                    <span class="returns-past__when">
                      {{ roleLine(row) }}, {{ formatWhen(row.claimedAt) }}
                    </span>
                    <span
                      v-if="hasNewMessage(row, handoffs.seen)"
                      class="returns-new"
                      data-testid="handoff-new"
                    >
                      New
                    </span>
                    <RouterLink
                      :to="whyLink(row)"
                      class="ds-link returns-past__why"
                      data-testid="handoff-why"
                      @click="seeWhy(row)"
                    >
                      See why
                    </RouterLink>
                  </li>
                </ul>
              </div>
            </li>
          </ol>
        </div>
      </template>

      <!-- Things you found -->
      <template v-else>
        <ConnectionProblem
          v-if="foundCantReach"
          :busy="foundLoading"
          data-testid="found-error"
          @retry="loadFound"
        />
        <PageSkeleton v-else-if="foundLoading" label="Loading the things you found…" />
        <div v-else-if="foundError" class="returns-panel" role="alert" data-testid="found-error">
          <p class="mb-0">{{ foundError }}</p>
        </div>
        <section v-else-if="found.length === 0" class="returns-panel" data-testid="found-empty">
          <p class="mb-0">You have not handed anything in yet. Found something on campus?</p>
          <BaseButton to="/report/found" variant="secondary">Report a found item</BaseButton>
        </section>
        <ol v-else class="returns-list ds-arrive">
          <li
            v-for="item in found"
            :key="item.id"
            class="returns-list__item returns-row returns-row--link"
            data-testid="found-row"
          >
            <div class="returns-row__picture">
              <img v-if="item.photoUrl" :src="item.photoUrl" :alt="item.title" loading="lazy" />
              <ItemIcon v-else :category="item.category" :colour="mainColour(item)" :size="32" />
            </div>
            <div class="returns-row__text">
              <p class="handoffs__title returns-row__title">{{ item.title }}</p>
              <p class="returns-row__meta">
                <span class="ds-num">{{ ledgerNumber(item.id) }}</span>
                <span>handed in {{ formatWhen(item.createdAt) }}</span>
                <span v-if="declinedNote(item, rows)">{{ declinedNote(item, rows) }}</span>
              </p>
            </div>
            <p class="returns-row__status">
              <span
                class="returns-status"
                :class="`is-${foundTone(item)}`"
                data-testid="found-status"
              >
                {{ foundItemStatus(item, rows).label }}
              </span>
            </p>
            <RouterLink
              :to="foundItemStatus(item, rows).to"
              class="returns-row__open stretched-link"
            >
              <span class="visually-hidden">
                {{ foundItemStatus(item, rows).action }}: {{ item.title }}
              </span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </RouterLink>
          </li>
        </ol>
      </template>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.returns-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The feed's wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.returns {
  flex: 1;
  padding-top: var(--ds-space-5);
  /* Clear of the iPhone's home bar */
  padding-bottom: max(var(--ds-space-8), env(safe-area-inset-bottom));
}

/* ---- Tabs: underlined, as on the feed. Navy under the chosen one. ---- */
.returns-tabs {
  display: flex;
  gap: var(--ds-space-6);
  overflow-x: auto;
  border-bottom: 1px solid var(--ds-border);
  scrollbar-width: none;
}

.returns-tabs__tab {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h-lg);
  padding: 0 var(--ds-space-1);
  border: 0;
  background: transparent;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-medium);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--ds-dur-fast) var(--ds-ease-out);
}

.returns-tabs__tab::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 2px;
  background: var(--ds-border-control);
  scale: 0 1;
  transition: scale var(--ds-dur-base) var(--ds-ease-out);
}

.returns-tabs__tab:hover {
  color: var(--ds-text);
}

.returns-tabs__tab:hover::after {
  scale: 1;
}

.returns-tabs__tab[aria-selected='true'] {
  color: var(--ds-action);
  font-weight: var(--ds-weight-bold);
}

.returns-tabs__tab[aria-selected='true']::after {
  background: var(--ds-action);
  scale: 1;
}

.returns-tabs__tab:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: -2px;
  border-radius: var(--ds-radius-control);
}

.returns-tabs__count {
  min-width: 1.75rem;
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-action);
  color: var(--ds-on-action);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
  text-align: center;
}

/* ---- Filters: a quieter row under the tabs, words with their counts.
   The chosen one sits on a navy wash. ---- */
/* Wraps on a narrow phone, so every filter stays in view */
.returns-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: var(--ds-space-3) 0 var(--ds-space-2);
}

.returns-filters__option {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-2);
  border: 0;
  border-radius: var(--ds-radius-control);
  background: transparent;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

.returns-filters__option:hover {
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
}

.returns-filters__option:active {
  background: var(--ds-action-wash);
}

.returns-filters__option[aria-pressed='true'] {
  background: var(--ds-action-wash);
  color: var(--ds-action);
  font-weight: var(--ds-weight-bold);
}

.returns-filters__option:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
}

/* Bootstrap's .badge is only a test hook here; this is the look */
.returns-filters__count {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
  opacity: 0.8;
}

/* ---- The list: rows on the page, split by thin rules ---- */
.returns-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The rule between rows is drawn apart from the row, so it stays straight
   under a row's rounded hover tint */
.returns-list__item {
  position: relative;
}

.returns-list__item + .returns-list__item::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  border-top: 1px solid var(--ds-border);
}

/* A found item's row is the list item itself, pulled out to the edges for
   its tint, so its rule is pulled back in */
.returns-list__item.returns-row + .returns-list__item.returns-row::before {
  inset-inline: var(--ds-space-3);
}

/* Picture, words, status, arrow. On phones the status drops under the
   words; from 768px it all sits on one line. */
.returns-row {
  position: relative;
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  grid-template-areas:
    'picture text'
    'picture status';
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-4);
  margin-inline: calc(-1 * var(--ds-space-3));
  padding: var(--ds-space-4) var(--ds-space-3);
  border-radius: var(--ds-radius-surface);
}

.returns-row--link {
  grid-template-columns: 3.5rem 1fr auto;
  grid-template-areas:
    'picture text open'
    'picture status open';
  transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
}

/* The whole row opens: it tints, the name underlines and the arrow moves */
.returns-row--link:hover {
  background: var(--ds-surface-sunken);
}

.returns-row--link:hover .returns-row__title {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.returns-row--link:hover .returns-row__open svg {
  translate: var(--ds-space-1) 0;
  color: var(--ds-action);
}

.returns-row--link:active {
  background: var(--ds-action-wash);
}

.returns-row__picture {
  grid-area: picture;
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.returns-row__picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.returns-row__text {
  grid-area: text;
  min-width: 0;
  overflow-wrap: anywhere;
}

.returns-row__title {
  margin: 0;
  color: var(--ds-text);
  font-size: var(--ds-size-body);
  line-height: var(--ds-leading-body);
  font-weight: var(--ds-weight-bold);
}

/* Number, who, when: separated by space, not dots */
.returns-row__meta {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--ds-space-3);
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.returns-row__status {
  grid-area: status;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-3);
  margin: 0;
}

.returns-row__open {
  grid-area: open;
  display: grid;
  place-items: center;
  width: var(--ds-control-h);
  height: var(--ds-control-h);
  color: var(--ds-text-muted);
  border-radius: var(--ds-radius-control);
}

.returns-row__open svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition:
    translate var(--ds-dur-fast) var(--ds-ease-out),
    color var(--ds-dur-fast) var(--ds-ease-out);
}

/* The stretched link covers the row, so the row shows its focus ring */
.returns-row__open:focus-visible {
  outline: none;
}

.returns-row--link:has(.returns-row__open:focus-visible) {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
}

/* ---- Status words: navy and bold when it's your turn, muted while you
   wait, green once back, red when the claim ended ---- */
.returns-status {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  font-weight: var(--ds-weight-medium);
}

.returns-status.is-turn {
  color: var(--ds-action);
  font-weight: var(--ds-weight-bold);
}

.returns-status.is-done {
  color: var(--ds-success);
}

.returns-status.is-ended {
  color: var(--ds-danger);
}

/* "New message": a navy dot and the words */
.returns-new {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-2);
  color: var(--ds-action);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
  font-weight: var(--ds-weight-bold);
}

.returns-new::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  border-radius: var(--ds-radius-round);
  background: currentColor;
}

/* ---- Declined and closed claims, folded under their item, lined up with
   the item's name ---- */
.returns-fold {
  padding: 0 0 var(--ds-space-3) calc(3.5rem + var(--ds-space-4));
}

.returns-fold__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  min-height: var(--ds-control-h);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-text-muted);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  cursor: pointer;
}

.returns-fold__toggle:hover {
  color: var(--ds-text);
}

.returns-fold__toggle:focus-visible {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
  border-radius: var(--ds-radius-control);
}

.returns-fold__toggle svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: rotate var(--ds-dur-base) var(--ds-ease-out);
}

.returns-fold__toggle[aria-expanded='true'] svg {
  rotate: 90deg;
}

.returns-fold__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.returns-past {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--ds-space-3);
  padding: var(--ds-space-1) 0;
  font-size: var(--ds-size-small);
}

.returns-past + .returns-past {
  border-top: 1px solid var(--ds-border);
}

.returns-past__when {
  color: var(--ds-text-muted);
}

.returns-past__why {
  margin-left: auto;
  color: var(--ds-text-muted);
}

/* ---- Empty and error: a quiet dashed panel with one way on ---- */
.returns-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
  margin-top: var(--ds-space-4);
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
}

.returns-panel[role='alert'] {
  color: var(--ds-danger);
}

.returns-panel__link {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
}

/* Phones: each old claim wraps the same way (status, then its line) */
@media (max-width: 767.98px) {
  .returns-past__when {
    flex-basis: 100%;
    order: 1;
  }

  .returns-past__why {
    order: 2;
    margin-left: 0;
  }
}

@media (min-width: 768px) {
  .returns-row {
    grid-template-columns: 4rem 1fr;
    grid-template-areas: 'picture text';
    gap: var(--ds-space-5);
  }

  .returns-row--link {
    grid-template-columns: 4rem 1fr auto auto;
    grid-template-areas: 'picture text status open';
  }

  .returns-row__picture {
    width: 4rem;
    height: 4rem;
  }

  .returns-row__title {
    font-size: var(--ds-size-title);
    line-height: var(--ds-leading-title);
  }

  .returns-filters__option {
    padding: 0 var(--ds-space-3);
  }

  .returns-row__status {
    justify-content: flex-end;
    text-align: right;
  }

  .returns-fold {
    padding-left: calc(4rem + var(--ds-space-5));
  }
}

@media (prefers-reduced-motion: reduce) {
  .returns-row--link,
  .returns-row__open svg,
  .returns-fold__toggle svg,
  .returns-tabs__tab,
  .returns-tabs__tab::after,
  .returns-filters__option {
    transition: none;
  }
}
</style>
