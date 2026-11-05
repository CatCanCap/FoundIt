<script setup>
// The handoff plan form (WS5, Figma V12.2 and V12.3): meet up or drop it off,
// and where. Used twice on the chat page: by the finder to accept a claim, and
// by either person to change the plan.
//   v-model   { method: 'meetup' | 'drop-off', spotId }
//   places    the choices (GET /api/handoffs/collection-points), nearest first,
//             each with distanceMetres when known
//   name      a short name for the radio group, unique on the page
//   submit    words on the save button
//   busy      true while saving
//   hint      a line under the place list ('' for none)
// Emits submit and cancel. In the design system (assets/system.css); only the
// handoff page uses it.
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { spotName } from '@/utils/spots'

const plan = defineModel({ type: Object, required: true })

defineProps({
  places: { type: Array, default: () => [] },
  name: { type: String, required: true },
  submit: { type: String, required: true },
  busy: { type: Boolean, default: false },
  hint: { type: String, default: '' },
})

const emit = defineEmits(['submit', 'cancel'])

function placeLabel(point) {
  const metres = point.distanceMetres !== undefined ? ` (${point.distanceMetres} m)` : ''
  return `${spotName(point)}${metres}`
}
</script>

<template>
  <form class="plan-form" @submit.prevent="emit('submit')">
    <fieldset class="plan-form__options">
      <legend class="visually-hidden">How will it get back?</legend>
      <label class="plan-form__option" :for="`${name}-meetup`">
        <input
          :id="`${name}-meetup`"
          v-model="plan.method"
          type="radio"
          value="meetup"
          :name="name"
          :data-testid="`${name}-meetup`"
        />
        <span>Meet up</span>
      </label>
      <label class="plan-form__option" :for="`${name}-drop-off`">
        <input
          :id="`${name}-drop-off`"
          v-model="plan.method"
          type="radio"
          value="drop-off"
          :name="name"
          :data-testid="`${name}-drop-off`"
        />
        <span>Drop it off</span>
      </label>
    </fieldset>

    <div class="plan-form__field">
      <label :for="`${name}-spot`" class="plan-form__label">
        {{ plan.method === 'drop-off' ? 'Collection point' : 'Meet at' }}
      </label>
      <BaseSelect
        :id="`${name}-spot`"
        v-model="plan.spotId"
        required
        :aria-describedby="hint ? `${name}-spot-hint` : undefined"
        :data-testid="`${name}-spot`"
      >
        <option v-for="point in places" :key="point.id" :value="point.id">
          {{ placeLabel(point) }}
        </option>
      </BaseSelect>
      <p v-if="hint" :id="`${name}-spot-hint`" class="plan-form__hint">{{ hint }}</p>
    </div>

    <div class="plan-form__actions">
      <BaseButton type="submit" :disabled="busy" :data-testid="`${name}-save`">
        {{ submit }}
      </BaseButton>
      <BaseButton variant="link" @click="emit('cancel')">Back</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.plan-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
  align-self: stretch;
}

.plan-form__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--ds-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.plan-form__option {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  cursor: pointer;
  transition:
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.plan-form__option:hover {
  background: var(--ds-surface-sunken);
}

.plan-form__option:has(input:checked) {
  border-color: var(--ds-action);
  background: var(--ds-action-wash);
  font-weight: var(--ds-weight-medium);
}

.plan-form__option:has(input:focus-visible) {
  outline: 2px solid var(--ds-focus);
  outline-offset: 2px;
}

.plan-form__option input {
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
}

.plan-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.plan-form__label {
  font-weight: var(--ds-weight-medium);
}

.plan-form__hint {
  margin: 0;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.plan-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-3) var(--ds-space-5);
}
</style>
