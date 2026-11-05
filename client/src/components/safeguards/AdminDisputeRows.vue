<script setup>
// One page of the dispute queue on the Admin page (Figma v3 V16): the item,
// what is disputed, how long it has waited (or how it was decided), any
// "needs attention" flags, and the button to the case.
//   rows   the disputes on this page, from GET /admin/disputes
//   show   'open', 'decided' or 'all' (names the third column)
//   now    the time to measure waits against (tests pass a fixed one)
import BaseButton from '@/components/ui/BaseButton.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import { mainColour } from '@/utils/design'
import {
  disputeCode,
  itemCode,
  formatWhen,
  waitingWords,
  disputeFlags,
  OUTCOMES,
} from '@/utils/safeguards'

defineProps({
  rows: { type: Array, required: true },
  show: { type: String, default: 'open' },
  leadFirst: { type: Boolean, default: false },
  now: { type: Date, default: () => new Date() },
})

// "Wei Ling says" and "Daniel Tan replied.", around the quoted dispute
const saidLine = (dispute) => `${dispute.people?.raisedBy?.name || 'Disputer'} says`
const replyLine = (dispute) => `${dispute.people?.claimer?.name || 'The claimer'} replied.`
</script>

<template>
  <table class="admin-table">
    <thead>
      <tr>
        <th scope="col" class="admin-col-item">Item</th>
        <th scope="col" class="admin-wide">What's disputed</th>
        <th scope="col" class="admin-col-status">{{ show === 'open' ? 'Waiting' : 'Status' }}</th>
        <th scope="col"><span class="visually-hidden">Open</span></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(dispute, index) in rows"
        :key="dispute.id"
        :style="{ '--i': index }"
        :data-testid="`admin-dispute-${dispute.id}`"
      >
        <td>
          <div class="sg-item admin-item">
            <img
              v-if="dispute.item?.photoUrl"
              :src="dispute.item.photoUrl"
              alt=""
              class="sg-thumb sg-thumb-sm"
            />
            <span v-else class="sg-thumb sg-thumb-sm admin-icon" aria-hidden="true">
              <ItemIcon
                :category="dispute.item?.category"
                :colour="mainColour(dispute.item)"
                :size="26"
              />
            </span>
            <div class="admin-min">
              <div class="admin-item-title">{{ dispute.item?.title }}</div>
              <div class="ds-small ds-muted ds-num admin-code">
                <span>{{ itemCode(dispute.itemId) }}</span> ·
                <span>{{ disputeCode(dispute.id) }}</span>
              </div>
              <div class="admin-narrow admin-said ds-small ds-muted">
                “{{ dispute.description }}”
              </div>
              <ul
                v-if="disputeFlags(dispute, now).length"
                class="admin-flags"
                aria-label="Needs attention"
              >
                <li
                  v-for="flag in disputeFlags(dispute, now)"
                  :key="flag"
                  class="admin-flag"
                  data-testid="admin-flag"
                >
                  {{ flag }}
                </li>
              </ul>
            </div>
          </div>
        </td>
        <td class="admin-wide">
          <div class="admin-said ds-small ds-muted">
            {{ saidLine(dispute) }} <em>“{{ dispute.description }}”</em>
            <span v-if="dispute.claimerResponse" class="admin-reply">{{ replyLine(dispute) }}</span>
          </div>
        </td>
        <td v-if="dispute.status === 'open'" class="admin-wait">
          <span
            :class="{ 'is-long': waitingWords(dispute.createdAt, now).isLong }"
            :title="`Opened ${formatWhen(dispute.createdAt)}`"
            >{{ waitingWords(dispute.createdAt, now).text }}</span
          >
        </td>
        <td v-else class="admin-outcome">
          <span class="d-block">{{ OUTCOMES[dispute.status]?.short }}</span>
          <span class="ds-small ds-muted d-block">{{ formatWhen(dispute.decidedAt) }}</span>
          <span
            v-if="dispute.returnBy"
            class="ds-small ds-muted d-block"
            data-testid="admin-return-by"
          >
            Return by {{ formatWhen(dispute.returnBy).split(', ')[0] }}
            <template v-if="dispute.returnDone"> · back</template>
          </span>
        </td>
        <td class="admin-go">
          <BaseButton
            :to="`/admin/disputes/${dispute.id}`"
            :variant="leadFirst && index === 0 ? 'primary' : 'secondary'"
            size="sm"
            >{{ dispute.status === 'open' ? 'Open case' : 'View'
            }}<span class="visually-hidden"> {{ disputeCode(dispute.id) }}</span></BaseButton
          >
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped src="./admin-table.css"></style>
