<script setup>
// One page of reported chat messages and posts on the Admin page: what was
// reported and who wrote it, the reason, how long it has waited (or what was
// decided), and the button to the report.
//   rows   the reports on this page, from GET /admin/reports
//   show   'open', 'decided' or 'all' (names the third column)
//   now    the time to measure waits against
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { mainColour } from '@/utils/design'
import { formatWhen, waitingWords, reportCode } from '@/utils/safeguards'

defineProps({
  rows: { type: Array, required: true },
  show: { type: String, default: 'open' },
  leadFirst: { type: Boolean, default: false },
  now: { type: Date, default: () => new Date() },
})

const OUTCOMES = { dismissed: 'Dismissed', actioned: 'Action taken' }

function excerpt(report) {
  if (report.kind === 'message') return report.message ? `“${report.message.text}”` : 'A message'
  return report.item?.title || 'A post'
}
</script>

<template>
  <table class="admin-table">
    <thead>
      <tr>
        <th scope="col" class="admin-col-item">Reported</th>
        <th scope="col" class="admin-wide">Reason given</th>
        <th scope="col" class="admin-col-status">{{ show === 'open' ? 'Waiting' : 'Status' }}</th>
        <th scope="col"><span class="visually-hidden">Open</span></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(report, index) in rows"
        :key="report.id"
        :style="{ '--i': index }"
        :data-testid="`admin-report-${report.id}`"
      >
        <td>
          <div class="sg-item admin-item">
            <img
              v-if="report.kind === 'item' && report.item?.photoUrl"
              :src="report.item.photoUrl"
              alt=""
              class="sg-thumb sg-thumb-sm"
            />
            <span v-else class="sg-thumb sg-thumb-sm admin-icon" aria-hidden="true">
              <ItemIcon
                v-if="report.kind === 'item'"
                :category="report.item?.category"
                :colour="mainColour(report.item)"
                :size="26"
              />
              <svg v-else width="22" height="22" viewBox="0 0 24 24">
                <path
                  d="M4 5h16v11H9l-5 4z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <div class="admin-min">
              <div class="admin-item-title">
                {{ report.kind === 'message' ? 'Chat message' : 'Post' }}
                <template v-if="report.people?.author">
                  by {{ report.people.author.name }}</template
                >
              </div>
              <div class="ds-small ds-muted ds-num admin-code">
                <span>{{ reportCode(report.id) }}</span>
              </div>
              <div class="admin-said ds-small ds-muted">{{ excerpt(report) }}</div>
              <div class="admin-narrow ds-small ds-muted">Reason: {{ report.reason }}</div>
            </div>
          </div>
        </td>
        <td class="admin-wide">
          <div class="admin-said ds-small ds-muted">{{ report.reason }}</div>
          <div v-if="report.people?.reporter" class="ds-small ds-muted">
            Reported by {{ report.people.reporter.name }}
          </div>
        </td>
        <td v-if="report.status === 'open'" class="admin-wait">
          <span
            :class="{ 'is-long': waitingWords(report.createdAt, now).isLong }"
            :title="`Reported ${formatWhen(report.createdAt)}`"
            >{{ waitingWords(report.createdAt, now).text }}</span
          >
        </td>
        <td v-else class="admin-outcome">
          <span class="d-block">{{ OUTCOMES[report.status] }}</span>
          <span class="ds-small ds-muted">{{ formatWhen(report.decidedAt) }}</span>
        </td>
        <td class="admin-go">
          <BaseButton
            :to="`/admin/reports/${report.id}`"
            :variant="leadFirst && index === 0 ? 'primary' : 'secondary'"
            size="sm"
            >{{ report.status === 'open' ? 'Review' : 'View'
            }}<span class="visually-hidden"> {{ reportCode(report.id) }}</span></BaseButton
          >
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped src="./admin-table.css"></style>
