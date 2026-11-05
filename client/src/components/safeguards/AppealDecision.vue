<script setup>
// The appeal on the Admin rack's ticket (Figma-free; designed 2026-11-03):
// why the person was suspended beside their appeal, then the decision as two
// cards that say what each does, a reply written to the student with a few
// ways to start it, and a preview of exactly what they will see. The button
// names the action, so nobody sends the wrong one.
//   appeal  a row from GET /admin/appeals (with person and suspensionReason)
// Emits decided with a message for the page once the server has saved it.
import { computed, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import { errorText, formatWhen } from '@/utils/safeguards'

const props = defineProps({
  appeal: { type: Object, required: true },
})
const emit = defineEmits(['decided'])

const MAX_LENGTH = 1000
const STARTS = ['Thanks for explaining.', 'The chat shows', 'We checked with the finder.']

const decision = ref('')
const reply = ref('')
const isSaving = ref(false)
const errorMessage = ref('')
const replyBox = ref(null)

const person = computed(() => props.appeal.person || { name: 'This student' })
const firstName = computed(() => person.value.name.split(' ')[0])
const history = computed(() => person.value.history || {})
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// A start goes on the end of what is there, with a space between
function addStart(text) {
  reply.value = reply.value.trim() ? `${reply.value.trim()} ${text}` : text
  replyBox.value?.focus()
}

const ready = computed(() => Boolean(decision.value) && Boolean(reply.value.trim()))
const buttonWords = computed(() =>
  decision.value === 'keep' ? 'Keep and send reply' : 'Lift and send reply',
)

async function send() {
  if (!ready.value) return
  errorMessage.value = ''
  isSaving.value = true
  try {
    const action = decision.value === 'lift' ? 'accept' : 'decline'
    await api.post(`/admin/appeals/${props.appeal.id}/${action}`, { reason: reply.value.trim() })
    emit(
      'decided',
      decision.value === 'lift'
        ? `${person.value.name}'s suspension was lifted.`
        : `${person.value.name}'s suspension was kept.`,
    )
  } catch (error) {
    // Decided already (by another admin, or by this one when the first answer
    // came too late): close the form, and the list loads again
    if (error.response?.status === 409) emit('decided', 'This appeal has already been decided.')
    else errorMessage.value = errorText(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="ad" data-testid="appeal-decision">
    <p class="ad__who">
      <span class="ds-small ds-muted">{{ person.email }}</span>
      <span v-if="history.warnings" class="ad__chip is-warn">
        {{ plural(history.warnings, 'warning') }}
      </span>
      <span v-if="history.suspensions" class="ad__chip is-bad">
        {{ plural(history.suspensions, 'suspension') }}
      </span>
    </p>

    <div class="ad__sides">
      <div class="ad__side">
        <div class="ad__head">
          <span>Why {{ firstName }} was suspended</span>
          <span class="ds-num">{{ formatWhen(appeal.suspendedAt) }}</span>
        </div>
        <p>{{ appeal.suspensionReason || 'No reason was recorded with this suspension.' }}</p>
      </div>
      <div class="ad__side is-appeal">
        <div class="ad__head">
          <span>{{ firstName }}'s appeal</span>
          <span class="ds-num">{{ formatWhen(appeal.createdAt) }}</span>
        </div>
        <p>{{ appeal.message }}</p>
        <a
          v-if="appeal.proofUrl"
          :href="appeal.proofUrl"
          target="_blank"
          rel="noopener"
          class="ds-link ds-small"
          >See the photo</a
        >
      </div>
    </div>

    <form class="ad__decide" novalidate @submit.prevent="send">
      <div class="ad__left">
        <fieldset class="ad__choices">
          <legend class="sg-label">Your decision</legend>
          <label class="ad__choice is-lift" :class="{ 'is-on': decision === 'lift' }">
            <input
              v-model="decision"
              type="radio"
              name="appeal-decision"
              value="lift"
              data-testid="appeal-lift"
            />
            <span>
              <b>Lift the suspension</b>
              <small>{{ firstName }} can post, claim, chat and report again.</small>
            </span>
          </label>
          <label class="ad__choice is-keep" :class="{ 'is-on': decision === 'keep' }">
            <input
              v-model="decision"
              type="radio"
              name="appeal-decision"
              value="keep"
              data-testid="appeal-keep"
            />
            <span>
              <b>Keep the suspension</b>
              <small>{{ firstName }} stays read-only, and can't appeal this one again.</small>
            </span>
          </label>
        </fieldset>

        <div class="ad__write">
          <div class="ad__write-top">
            <label for="appeal-reply"
              >Reply to <b>{{ firstName }}</b></label
            >
            <span>{{ firstName }} sees this on the appeal page</span>
          </div>
          <div class="ad__starts" role="group" aria-label="Ways to start">
            <button v-for="text in STARTS" :key="text" type="button" @click="addStart(text)">
              {{ text }}
            </button>
          </div>
          <textarea
            id="appeal-reply"
            ref="replyBox"
            v-model="reply"
            rows="3"
            :maxlength="MAX_LENGTH"
            data-testid="appeal-reply-box"
          ></textarea>
          <div class="ad__foot">
            <span>Write it to {{ firstName }}, not to the admins</span>
            <span class="ds-num">{{ reply.length }} / {{ MAX_LENGTH }}</span>
          </div>
        </div>
      </div>

      <div class="ad__preview" aria-live="polite">
        <div class="sg-label">What {{ firstName }} will see</div>
        <template v-if="decision">
          <p class="ad__banner" :class="decision === 'lift' ? 'is-good' : 'is-bad'">
            <strong>
              {{ decision === 'lift' ? 'Your appeal was accepted.' : 'Your appeal was declined.' }}
            </strong>
            {{
              decision === 'lift'
                ? 'Your account is active again.'
                : 'Your account stays suspended.'
            }}
          </p>
          <div class="ad__reply" :class="decision === 'lift' ? 'is-good' : 'is-bad'">
            <span>{{ decision === 'lift' ? 'Accepted today' : 'Declined today' }}</span>
            <p>{{ reply.trim() || 'Your reply shows here.' }}</p>
          </div>
        </template>
        <p v-else class="ds-small ds-muted">Choose a decision to see it.</p>
      </div>

      <div
        v-if="errorMessage"
        class="sg-alert ad__error"
        role="alert"
        data-testid="appeal-decision-error"
      >
        {{ errorMessage }}
      </div>

      <div class="ad__act">
        <span class="ds-small ds-muted">
          This can't be undone. It goes in the action log
          <template v-if="decision === 'keep'">as "Kept a suspension after an appeal"</template>
          <template v-else-if="decision === 'lift'">as "Lifted a suspension"</template>, with your
          reply.
        </span>
        <BaseButton
          type="submit"
          :disabled="!ready || isSaving"
          :aria-busy="isSaving"
          data-testid="appeal-confirm"
        >
          {{ isSaving ? 'Saving…' : buttonWords }}
        </BaseButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.ad__who {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-3);
  margin-top: var(--ds-space-1);
}

.ad__chip {
  padding: 0.0625rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
}

.ad__chip.is-warn {
  background: color-mix(in srgb, var(--ds-warning) 14%, var(--ds-surface));
  color: var(--ds-warning);
}

.ad__chip.is-bad {
  background: color-mix(in srgb, var(--ds-danger) 12%, var(--ds-surface));
  color: var(--ds-danger);
}

.ad__sides {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ds-space-3);
  margin: var(--ds-space-4) 0;
}

@media (min-width: 768px) {
  .ad__sides {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.ad__side {
  padding: var(--ds-space-3) var(--ds-space-4);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
  overflow-wrap: anywhere;
}

.ad__side.is-appeal {
  background: color-mix(in srgb, var(--ds-role-claimer, var(--ds-action)) 10%, var(--ds-surface));
}

.ad__side p {
  margin: var(--ds-space-1) 0 0;
  white-space: pre-line;
}

.ad__head {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-3);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
  font-weight: var(--ds-weight-bold);
}

.ad__side.is-appeal .ad__head span:first-child {
  color: var(--ds-role-claimer, var(--ds-action));
}

.ad__decide {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ds-space-4);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-border);
}

@media (min-width: 992px) {
  .ad__decide {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: var(--ds-space-5);
  }
}

.ad__choices {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ds-space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

@media (min-width: 576px) {
  .ad__choices {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ad__choices legend {
    grid-column: 1 / -1;
  }
}

.ad__choices legend {
  margin-bottom: var(--ds-space-2);
}

.ad__choice {
  display: flex;
  gap: var(--ds-space-3);
  align-items: flex-start;
  padding: var(--ds-space-3) var(--ds-space-4);
  border: 1.5px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
  cursor: pointer;
  transition:
    border-color var(--ds-dur-fast) var(--ds-ease-out),
    background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.ad__choice:hover {
  border-color: var(--ds-border-control);
}

.ad__choice:has(:focus-visible) {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.ad__choice input {
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  margin-top: var(--ds-space-1);
}

.ad__choice b {
  display: block;
}

.ad__choice small {
  display: block;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.ad__choice.is-lift b {
  color: var(--ds-success);
}

.ad__choice.is-keep b {
  color: var(--ds-danger);
}

.ad__choice.is-lift.is-on {
  border-color: var(--ds-success);
  background: color-mix(in srgb, var(--ds-success) 7%, var(--ds-surface));
  accent-color: var(--ds-success);
}

.ad__choice.is-keep.is-on {
  border-color: var(--ds-danger);
  background: color-mix(in srgb, var(--ds-danger) 6%, var(--ds-surface));
  accent-color: var(--ds-danger);
}

.ad__write {
  margin-top: var(--ds-space-3);
  overflow: hidden;
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

.ad__write:focus-within {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.ad__write-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ds-space-1) var(--ds-space-3);
  padding: var(--ds-space-2) var(--ds-space-3);
  border-bottom: 1px solid var(--ds-border);
  background: var(--ds-canvas);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  line-height: var(--ds-leading-caption);
}

.ad__write-top label {
  font-size: var(--ds-size-small);
}

.ad__write-top b {
  color: var(--ds-text);
}

.ad__starts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3) var(--ds-space-3) 0;
}

.ad__starts button {
  min-height: 2rem;
  padding: 0 var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  color: var(--ds-action);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  cursor: pointer;
}

.ad__starts button::before {
  content: '+ ';
  opacity: 0.6;
}

.ad__starts button:hover {
  background: var(--ds-action-wash);
}

.ad__write textarea {
  display: block;
  width: 100%;
  min-height: 5.5rem;
  max-height: 16rem;
  padding: var(--ds-space-3);
  border: 0;
  background: transparent;
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  line-height: var(--ds-leading-body);
  resize: vertical;
}

.ad__write textarea:focus-visible {
  outline: none;
}

.ad__foot {
  display: flex;
  justify-content: space-between;
  gap: var(--ds-space-3);
  padding: 0 var(--ds-space-3) var(--ds-space-2);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
}

.ad__preview {
  padding: var(--ds-space-3);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-canvas);
}

.ad__preview .sg-label {
  margin-bottom: var(--ds-space-2);
}

.ad__banner {
  padding: var(--ds-space-2) var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.ad__banner.is-good,
.ad__reply.is-good {
  background: color-mix(in srgb, var(--ds-success) 14%, var(--ds-surface));
}

.ad__banner.is-bad,
.ad__reply.is-bad {
  background: color-mix(in srgb, var(--ds-danger) 12%, var(--ds-surface));
}

.ad__banner.is-good strong {
  color: var(--ds-success);
}

.ad__banner.is-bad strong {
  color: var(--ds-danger);
}

.ad__reply {
  margin-top: var(--ds-space-2);
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius-surface);
  overflow-wrap: anywhere;
}

.ad__reply span {
  display: inline-block;
  padding: 0.0625rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.ad__reply.is-good span {
  color: var(--ds-success);
}

.ad__reply.is-bad span {
  color: var(--ds-danger);
}

.ad__reply p {
  margin: var(--ds-space-2) 0 0;
  white-space: pre-line;
}

.ad__error {
  grid-column: 1 / -1;
  margin: 0;
}

.ad__act {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
  padding-top: var(--ds-space-3);
  border-top: 1px solid var(--ds-border);
}

.ad__act > span {
  max-width: 46ch;
}

@media (prefers-reduced-motion: reduce) {
  .ad__choice {
    transition: none;
  }
}
</style>
