<script setup>
// One page of the People list on the Admin page: suspended and warned
// accounts, with their warnings, the latest admin action, and a way to lift a
// suspension. Lifting needs a reason, which goes in the action log, so the
// button opens a small form under the person first.
//   rows   the people on this page, from GET /admin/users
// Emits `changed` with a message after a suspension is lifted, so the page
// can load the list again.
import { ref, nextTick } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import { ACTION_LABELS, formatWhen, initials, errorText } from '@/utils/safeguards'

defineProps({
  rows: { type: Array, required: true },
})
const emit = defineEmits(['changed'])

const openFor = ref(null) // the person whose form is open
const reason = ref('')
const errorMessage = ref('')
const isSaving = ref(false)
const reasonBox = ref(null)

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
// "Warned", not "Warned a user": the row already says who
const actionWord = (entry) => (ACTION_LABELS[entry.action] || entry.action).replace(/ a user$/, '')

async function openForm(person) {
  openFor.value = person.id
  reason.value = ''
  errorMessage.value = ''
  await nextTick()
  reasonBox.value?.[0]?.focus()
}

async function closeForm(person) {
  openFor.value = null
  await nextTick()
  document.querySelector(`[data-testid="people-unsuspend-${person.id}"]`)?.focus()
}

async function liftSuspension(person) {
  errorMessage.value = ''
  if (!reason.value.trim()) {
    errorMessage.value = 'Give a reason first. It goes in the action log.'
    return
  }
  isSaving.value = true
  try {
    await api.post(`/admin/users/${person.id}/unsuspend`, { reason: reason.value.trim() })
    openFor.value = null
    emit('changed', `${person.name}'s suspension was lifted.`)
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <table class="admin-table people-table">
    <thead>
      <tr>
        <th scope="col" class="admin-col-item">Person</th>
        <th scope="col" class="admin-wide people-count">Warnings</th>
        <th scope="col" class="admin-wide people-count">Suspensions</th>
        <th scope="col" class="admin-wide">Latest action</th>
        <th scope="col"><span class="visually-hidden">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      <template v-for="(person, index) in rows" :key="person.id">
        <tr :style="{ '--i': index }" :data-testid="`admin-person-${person.id}`">
          <td>
            <div class="sg-item admin-item">
              <span class="sg-avatar" aria-hidden="true">{{ initials(person.name) }}</span>
              <div class="admin-min">
                <div class="admin-item-title">{{ person.name }}</div>
                <a :href="`mailto:${person.email}`" class="ds-small ds-muted people-mail">{{
                  person.email
                }}</a>
                <span
                  v-if="person.suspendedAt"
                  class="sg-pill sg-pill-warn people-state"
                  data-testid="people-suspended"
                  >Suspended since {{ formatWhen(person.suspendedAt).split(', ')[0] }}</span
                >
                <!-- A phone has no room for the columns, so they sit under the name -->
                <div class="admin-narrow ds-small ds-muted">
                  {{ plural(person.warnings, 'warning') }},
                  {{ plural(person.suspensions, 'suspension') }}
                </div>
                <div v-if="person.lastAction" class="admin-narrow ds-small ds-muted">
                  {{ actionWord(person.lastAction) }},
                  {{ formatWhen(person.lastAction.createdAt) }}
                </div>
              </div>
            </div>
          </td>
          <td class="admin-wide people-count ds-num">{{ person.warnings }}</td>
          <td class="admin-wide people-count ds-num">{{ person.suspensions }}</td>
          <td class="admin-wide">
            <template v-if="person.lastAction">
              <div class="people-action">
                <strong>{{ actionWord(person.lastAction) }}</strong>
                <span class="ds-small ds-muted">{{ formatWhen(person.lastAction.createdAt) }}</span>
              </div>
              <div v-if="person.lastAction.reason" class="admin-said ds-small ds-muted">
                {{ person.lastAction.reason }}
              </div>
            </template>
          </td>
          <td class="admin-go">
            <BaseButton
              v-if="person.suspendedAt && openFor !== person.id"
              variant="secondary"
              size="sm"
              :data-testid="`people-unsuspend-${person.id}`"
              @click="openForm(person)"
            >
              Unsuspend<span class="visually-hidden"> {{ person.name }}</span>
            </BaseButton>
          </td>
        </tr>

        <tr v-if="openFor === person.id">
          <td colspan="5">
            <form
              class="people-form"
              :data-testid="`people-form-${person.id}`"
              @submit.prevent="liftSuspension(person)"
            >
              <label :for="`unsuspend-reason-${person.id}`" class="sg-field-label"
                >Why lift {{ person.name }}'s suspension? · goes in the action log</label
              >
              <textarea
                :id="`unsuspend-reason-${person.id}`"
                ref="reasonBox"
                v-model="reason"
                class="sg-input"
                rows="2"
                maxlength="1000"
                data-testid="people-reason"
              ></textarea>
              <div
                v-if="errorMessage"
                class="sg-alert people-error"
                role="alert"
                data-testid="people-error"
              >
                {{ errorMessage }}
              </div>
              <div class="people-buttons">
                <BaseButton variant="secondary" size="sm" @click="closeForm(person)"
                  >Cancel</BaseButton
                >
                <BaseButton
                  type="submit"
                  size="sm"
                  :disabled="isSaving"
                  data-testid="people-confirm"
                >
                  {{ isSaving ? 'Saving…' : 'Lift the suspension' }}
                </BaseButton>
              </div>
            </form>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped src="./admin-table.css"></style>

<style scoped>
/* The two counts are numbers, so they line up in narrow centred columns */
.admin-table .people-count {
  width: 6.5rem;
  text-align: center;
}

td.people-count {
  font-size: var(--ds-size-title);
  font-weight: var(--ds-weight-bold);
}

.people-mail {
  display: block;
  overflow-wrap: anywhere;
  color: inherit;
  text-decoration: none;
}

.people-mail:hover {
  text-decoration: underline;
}

.people-state {
  margin-top: var(--ds-space-1);
}

.people-action {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ds-space-2);
}

.people-form {
  padding-block: var(--ds-space-2);
}

.people-error {
  margin: var(--ds-space-2) 0 0;
}

.people-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ds-space-2);
  margin-top: var(--ds-space-2);
}
</style>
