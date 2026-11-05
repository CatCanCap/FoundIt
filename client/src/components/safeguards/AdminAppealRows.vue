<script setup>
// The Appeals tab once decided (or "All"): who appealed, what they said, and
// what was decided with the reply they were sent.
//   rows   appeals on this page, from GET /admin/appeals
import { appealCode, formatWhen } from '@/utils/safeguards'

defineProps({
  rows: { type: Array, required: true },
})

const OUTCOMES = { open: 'Waiting', accepted: 'Lifted', declined: 'Kept' }
</script>

<template>
  <table class="admin-table">
    <thead>
      <tr>
        <th scope="col" class="admin-col-item">Person</th>
        <th scope="col" class="admin-wide">Their appeal</th>
        <th scope="col" class="admin-col-status">Decision</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(appeal, index) in rows"
        :key="appeal.id"
        :style="{ '--i': index }"
        :data-testid="`admin-appeal-${appeal.id}`"
      >
        <td>
          <div class="admin-item-title">{{ appeal.person?.name || 'Someone' }}</div>
          <div class="ds-small ds-muted ds-num admin-code">{{ appealCode(appeal.id) }}</div>
          <div class="admin-narrow admin-said ds-small ds-muted">“{{ appeal.message }}”</div>
        </td>
        <td class="admin-wide">
          <div class="admin-said ds-small ds-muted">“{{ appeal.message }}”</div>
        </td>
        <td class="admin-outcome">
          <span class="d-block">{{ OUTCOMES[appeal.status] }}</span>
          <span class="ds-small ds-muted d-block">
            {{ formatWhen(appeal.decidedAt || appeal.createdAt) }}
          </span>
          <span v-if="appeal.reply" class="admin-said ds-small ds-muted">{{ appeal.reply }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped src="./admin-table.css"></style>
