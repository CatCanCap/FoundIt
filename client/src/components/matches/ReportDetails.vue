<script setup>
// The lost report shown under the rail on the Matches page. Folded, it is one
// line: the name, then the category, colours, brand and first place. "Details"
// unfolds the rest: the photo, the description, the report number and where
// the owner had it, with "Edit details" to change the words, category, up to
// 3 colours (WS2's ColourPicker, as on the report forms), the brand and the
// photo. A new photo uploads straight to Cloudinary when it is chosen (WS2's
// services/cloudinary.js) and its link is saved with the rest, so the feed
// shows it too. Saving checks the report against every find again.
//   report      the owner's lost item
//   categories  from GET /api/categories, for the category list
//   colours     from GET /api/colours, for the colour list and swatches
//   spotsById   Map of campus spots, for the trail
//   save        async (fields) => {}, called with only the changed fields;
//               throw to show an error and keep the form open
//   open        whether the details are unfolded (v-model:open), so the page
//               can keep them open from one report to the next
// startEdit() is exposed, for the "Add details" button beside a report with
// no finds.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ColourPicker from '@/components/report/ColourPicker.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import TextField from '@/components/ui/TextField.vue'
import { PHOTO_HINT, checkPhoto, isPhotoUploadEnabled, uploadPhoto } from '@/services/cloudinary'
import { tagPlace } from '@/utils/feed'
import {
  changedFields,
  checkDraft,
  coloursOf,
  draftOf,
  lostCode,
  MAX_COLOURS,
  reportStatus,
  trailStops,
} from '@/utils/matches'

const props = defineProps({
  report: { type: Object, required: true },
  categories: { type: Array, default: () => [] },
  colours: { type: Array, default: () => [] },
  spotsById: { type: Map, required: true },
  save: { type: Function, required: true },
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open'])

const editing = ref(false)
const draft = ref(draftOf(props.report))
const saving = ref(false)
const formError = ref('')
const savedNote = ref('')
const formEl = ref(null)

// Another report picked: leave edit mode and forget the half-typed form
watch(
  () => props.report.id,
  () => {
    stopPhotoUpload()
    editing.value = false
    formError.value = ''
    savedNote.value = ''
  },
)

const moreId = computed(() => `report-more-${props.report.id}`)
const isOpen = computed(() => props.report.status === 'open')
const status = computed(() => reportStatus(props.report))
// The first place, plus "+ 2 more" when the owner gave several
const place = computed(() =>
  props.report.trail ? tagPlace(props.report, props.spotsById) : { building: '' },
)
const stops = computed(() => trailStops(props.report, props.spotsById))
const changes = computed(() => changedFields(props.report, draft.value))
const hasChanges = computed(() => Object.keys(changes.value).length > 0)

// The report's colours with their swatches, main colour first
const shownColours = computed(() =>
  coloursOf(props.report).map((name) => ({
    name,
    hex: props.colours.find((colour) => colour.name === name)?.hex || null,
  })),
)

// The photo: shown from the draft while editing. The new one uploads as soon
// as it is chosen, and Save waits until it has.
const photoEnabled = isPhotoUploadEnabled()
const photoPreview = ref('')
const photoError = ref('')
const uploadingPhoto = ref(false)
let photoUpload = null

const shownPhoto = computed(() => photoPreview.value || draft.value.photoUrl)

function forgetPreview() {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoPreview.value = ''
}

function stopPhotoUpload() {
  if (photoUpload) photoUpload.abort()
  photoUpload = null
  uploadingPhoto.value = false
  photoError.value = ''
  forgetPreview()
}
onBeforeUnmount(stopPhotoUpload)

async function choosePhoto(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  photoError.value = checkPhoto(file) || ''
  if (photoError.value) return
  stopPhotoUpload()

  photoPreview.value = URL.createObjectURL(file)
  uploadingPhoto.value = true
  const upload = new AbortController()
  photoUpload = upload
  try {
    draft.value.photoUrl = await uploadPhoto(file, { signal: upload.signal })
  } catch (error) {
    if (error.name === 'AbortError') return
    photoError.value = error.message
    forgetPreview()
  } finally {
    if (photoUpload === upload) {
      uploadingPhoto.value = false
      photoUpload = null
    }
  }
}

function removePhoto() {
  stopPhotoUpload()
  draft.value.photoUrl = ''
}

// The category list, with the report's own category kept even if it is
// missing from the list
const categoryNames = computed(() => {
  const names = props.categories.map((category) => category.name)
  return names.includes(props.report.category) ? names : [props.report.category, ...names]
})

// Opens the form, unfolding the details first. From "Add details" the form
// may be off screen, so it is brought into view with the name field focused.
function startEdit({ reveal = false } = {}) {
  draft.value = draftOf(props.report)
  formError.value = ''
  savedNote.value = ''
  editing.value = true
  emit('update:open', true)
  if (!reveal) return
  nextTick(() => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    formEl.value?.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    formEl.value?.querySelector('input')?.focus({ preventScroll: true })
  })
}

defineExpose({ startEdit })

function cancelEdit() {
  stopPhotoUpload()
  editing.value = false
  formError.value = ''
}

async function submit() {
  formError.value = uploadingPhoto.value
    ? 'Wait for the photo to finish uploading.'
    : checkDraft(draft.value)
  if (formError.value) return
  if (!hasChanges.value) {
    editing.value = false
    return
  }
  saving.value = true
  try {
    await props.save(changes.value)
    forgetPreview()
    editing.value = false
    savedNote.value = 'Saved. We checked your report against every find again.'
  } catch (error) {
    formError.value =
      error.response?.data?.error || 'Could not save your changes. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <article class="report" data-testid="report-details">
    <!-- Folded: the name and one line of facts, with "Details" at the end -->
    <div class="report__head">
      <div class="report__heading">
        <h2 class="report__title" data-testid="report-title">{{ report.title }}</h2>
        <p class="report__facts">
          <span v-if="status.state !== 'open'" class="report__status" data-testid="report-status">{{
            status.label
          }}</span>
          <span class="report__fact">{{ report.category }}</span>
          <span v-if="shownColours.length" class="report__fact" data-testid="report-colours">
            <span v-for="colour in shownColours" :key="colour.name" class="report__colour">
              <span
                v-if="colour.hex"
                class="report__swatch"
                :style="{ background: colour.hex }"
                aria-hidden="true"
              ></span>
              {{ colour.name }}
            </span>
          </span>
          <span v-if="report.brand" class="report__fact">{{ report.brand }}</span>
          <span v-if="place.building" class="report__fact"
            >{{ place.building }}<template v-if="place.detail"> {{ place.detail }}</template></span
          >
        </p>
      </div>
      <button
        v-if="!editing"
        type="button"
        class="report__toggle ds-btn ds-btn--tertiary"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="moreId"
        data-testid="report-more"
        @click="emit('update:open', !open)"
      >
        Details
        <svg class="report__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>

    <p v-if="savedNote" class="report__saved" role="status" data-testid="report-saved">
      {{ savedNote }}
    </p>

    <div v-if="open || editing" :id="moreId" class="report__more">
      <!-- Reading: what it looks like on the left, where the owner had it on the right -->
      <template v-if="!editing">
        <div class="report__about">
          <img
            v-if="report.photoUrl"
            class="report__photo-shown"
            :src="report.photoUrl"
            :alt="report.title"
          />
          <div class="report__about-text">
            <p class="report__description">
              {{ report.description || 'No description yet.' }}
            </p>
            <p class="report__code">
              Lost report <span class="ds-num">{{ lostCode(report.id) }}</span>
            </p>
            <BaseButton
              v-if="isOpen"
              variant="secondary"
              size="sm"
              class="report__edit"
              data-testid="edit-report"
              @click="startEdit()"
            >
              Edit details
            </BaseButton>
          </div>
        </div>

        <section class="report__trail" :aria-labelledby="`${moreId}-trail`">
          <h3 :id="`${moreId}-trail`" class="report__subhead">Where you had it</h3>
          <ol class="report__stops" data-testid="report-trail">
            <li v-for="(stop, index) in stops" :key="index" class="report__stop">
              <span class="report__stop-number">{{ index + 1 }}</span>
              <span class="report__stop-text">
                <span class="report__stop-place"
                  ><strong>{{ stop.place }}</strong
                  ><template v-if="stop.area"> · {{ stop.area }}</template></span
                >
                <span v-if="stop.when" class="report__stop-when">{{ stop.when }}</span>
              </span>
            </li>
          </ol>
        </section>
      </template>

      <!-- Editing. Bootstrap grid: one field per line on a phone; the category
           takes half the width from sm (576px) -->
      <form
        v-else
        ref="formEl"
        class="report__form row g-3"
        data-testid="edit-form"
        @submit.prevent="submit"
      >
        <div class="col-12">
          <TextField v-model="draft.title" label="Name" maxlength="100" data-testid="edit-title" />
        </div>
        <div class="report__control col-12 col-sm-6">
          <label class="report__label" :for="`${moreId}-category`">Category</label>
          <BaseSelect
            :id="`${moreId}-category`"
            v-model="draft.category"
            size="lg"
            data-testid="edit-category"
          >
            <option v-for="name in categoryNames" :key="name" :value="name">{{ name }}</option>
          </BaseSelect>
        </div>
        <fieldset class="report__control col-12">
          <legend class="report__label">Colours</legend>
          <ColourPicker
            v-model="draft.colours"
            :colours="colours"
            :max="MAX_COLOURS"
            name="edit-colour"
          />
        </fieldset>
        <div class="col-12">
          <TextField
            v-model="draft.brand"
            label="Brand"
            maxlength="50"
            placeholder="e.g. Hydro Flask"
            data-testid="edit-brand"
          />
        </div>
        <div class="report__control col-12">
          <label class="report__label" :for="`${moreId}-description`">Description</label>
          <textarea
            :id="`${moreId}-description`"
            v-model="draft.description"
            class="report__input report__textarea"
            rows="4"
            maxlength="2000"
            placeholder="Stickers, scratches, what was inside…"
            data-testid="edit-description"
          ></textarea>
        </div>

        <fieldset v-if="photoEnabled" class="report__control col-12" data-testid="edit-photo">
          <legend class="report__label">Photo</legend>
          <div class="report__photo">
            <img
              v-if="shownPhoto"
              class="report__photo-preview"
              :src="shownPhoto"
              alt="Your report's photo"
              data-testid="edit-photo-preview"
            />
            <div class="report__photo-text">
              <p class="report__hint" role="status" data-testid="edit-photo-status">
                <template v-if="uploadingPhoto">Uploading…</template>
                <template v-else-if="shownPhoto">
                  It shows on your report and in the feed.
                </template>
                <template v-else>No photo yet. An old photo helps finders recognise it.</template>
              </p>
              <p class="report__hint" data-testid="edit-photo-limit">{{ PHOTO_HINT }}</p>
              <div class="report__photo-actions">
                <label :for="`${moreId}-photo`" class="report__photo-choose ds-link">
                  {{ shownPhoto ? 'Replace photo' : 'Add a photo' }}
                </label>
                <button
                  v-if="shownPhoto"
                  type="button"
                  class="report__photo-remove ds-link"
                  data-testid="edit-photo-remove"
                  @click="removePhoto"
                >
                  Remove
                </button>
              </div>
            </div>
            <input
              :id="`${moreId}-photo`"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              class="visually-hidden"
              data-testid="edit-photo-input"
              @change="choosePhoto"
            />
          </div>
          <p v-if="photoError" class="report__error" role="alert" data-testid="edit-photo-error">
            {{ photoError }}
          </p>
        </fieldset>

        <div v-if="formError" class="col-12">
          <p class="report__error" role="alert" data-testid="edit-error">{{ formError }}</p>
        </div>

        <!-- Phones: "Save changes" across the width, where a thumb reaches it -->
        <div class="report__form-actions col-12">
          <BaseButton
            type="submit"
            :disabled="saving || uploadingPhoto || !hasChanges"
            :aria-busy="saving ? 'true' : undefined"
            data-testid="save-report"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
          </BaseButton>
          <BaseButton
            variant="link"
            :disabled="saving"
            data-testid="cancel-edit"
            @click="cancelEdit"
          >
            Cancel
          </BaseButton>
          <span class="report__hint">Saving checks your report against every find again.</span>
        </div>
      </form>
    </div>
  </article>
</template>

<style scoped>
.report {
  display: grid;
  gap: var(--ds-space-3);
}

/* The name and its facts, with "Details" at the right end */
/* The name with "Details" beside it, and the facts the full width under both */
.report__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--ds-space-1) var(--ds-space-3);
}

.report__heading {
  display: contents;
}

.report__title {
  grid-column: 1;
  grid-row: 1;
  font-size: var(--ds-size-h3);
  line-height: var(--ds-leading-h3);
}

/* "Water Bottle · Navy · Hydro Flask · SCIS 1 + 1 more". Each dot sits in
   the gap before its fact; at the start of a line it falls outside the box
   and is cut off, so no line starts with a dot. */
.report__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  grid-column: 1 / -1;
  grid-row: 2;
  column-gap: var(--ds-space-4);
  row-gap: var(--ds-space-1);
  overflow: hidden;
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.report__fact {
  position: relative;
}

.report__fact::before {
  content: '·';
  position: absolute;
  right: 100%;
  width: var(--ds-space-4);
  text-align: center;
}

.report__status {
  padding: 0.125rem var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-action-wash);
  color: var(--ds-action);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
}

.report__colour {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
}

.report__colour + .report__colour {
  margin-left: var(--ds-space-2);
}

.report__swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--ds-border-control);
}

.report__toggle {
  grid-column: 2;
  grid-row: 1;
  margin-right: calc(-1 * var(--ds-space-3));
}

.report__chevron {
  width: 1.125rem;
  height: 1.125rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--ds-dur-base) var(--ds-ease-out);
}

.report__toggle[aria-expanded='true'] .report__chevron {
  transform: rotate(180deg);
}

.report__saved {
  color: var(--ds-success);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

/* Unfolded: a sunken well under the line, so it reads as part of it */
.report__more {
  display: grid;
  gap: var(--ds-space-5);
  padding: var(--ds-space-5);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
  animation: report-unfold var(--ds-dur-base) var(--ds-ease-out);
}

@keyframes report-unfold {
  from {
    opacity: 0;
    translate: 0 calc(-1 * var(--ds-space-2));
  }
}

.report__about {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-4);
}

.report__photo-shown {
  flex-shrink: 0;
  width: 6rem;
  height: 6rem;
  border-radius: var(--ds-radius-control);
  object-fit: cover;
}

.report__about-text {
  display: grid;
  justify-items: start;
  gap: var(--ds-space-2);
  min-width: 0;
}

.report__description {
  max-width: 60ch;
  white-space: pre-line;
}

.report__code {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
}

.report__edit {
  margin-top: var(--ds-space-1);
}

.report__subhead {
  margin-bottom: var(--ds-space-3);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0;
}

.report__stops {
  display: grid;
  gap: var(--ds-space-3);
}

.report__stop {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-3);
}

.report__stop-number {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface);
  box-shadow: inset 0 0 0 1px var(--ds-border-control);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-bold);
  font-variant-numeric: tabular-nums;
}

.report__stop-text {
  display: grid;
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.report__stop-place strong {
  font-weight: var(--ds-weight-medium);
}

.report__stop-when {
  color: var(--ds-text-muted);
  font-variant-numeric: tabular-nums;
}

/* The edit form */
.report__control {
  display: grid;
  gap: var(--ds-space-2);
  min-width: 0;
  margin: 0;
  padding-block: 0;
  border: 0;
}

.report__label {
  margin: 0;
  padding: 0;
  float: none;
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
  line-height: var(--ds-leading-small);
}

.report__input {
  width: 100%;
  min-height: var(--ds-control-h-lg);
  padding: 0 var(--ds-space-4);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface);
  color: var(--ds-text);
  font-family: var(--ds-font-text);
  font-size: var(--ds-size-body);
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.report__input:hover {
  border-color: var(--ds-text-muted);
}

.report__input:focus {
  border-color: var(--ds-action);
  outline: 3px solid var(--ds-focus);
  outline-offset: 1px;
}

.report__input::placeholder {
  color: var(--ds-text-muted);
}

.report__textarea {
  padding-block: var(--ds-space-3);
  resize: vertical;
}

.report__photo {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
}

.report__photo-preview {
  flex-shrink: 0;
  width: 5rem;
  height: 5rem;
  border-radius: var(--ds-radius-control);
  object-fit: cover;
}

.report__photo-text {
  display: grid;
  gap: var(--ds-space-1);
}

.report__photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-4);
}

.report__photo-choose,
.report__photo-remove {
  position: relative;
  padding: 0;
  border: 0;
  background: none;
  font-size: var(--ds-size-small);
  cursor: pointer;
}

/* A 44px tap target around the words */
.report__photo-choose::after,
.report__photo-remove::after {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  height: var(--ds-control-h);
  translate: 0 -50%;
}

.report__photo:has(:focus-visible) .report__photo-choose {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.report__photo-remove {
  color: var(--ds-danger);
}

.report__hint {
  color: var(--ds-text-muted);
  font-size: var(--ds-size-small);
  line-height: var(--ds-leading-small);
}

.report__error {
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.report__form-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ds-space-2);
}

/* sm (576px) and up: the buttons side by side */
@media (min-width: 576px) {
  .report__form-actions {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--ds-space-4);
  }
}

/* md (768px) and up: what it looks like and where it was, side by side */
@media (min-width: 768px) {
  .report__more:not(:has(form)) {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}

@media (max-width: 575.98px) {
  .report__more {
    padding: var(--ds-space-4);
  }

  .report__photo-shown {
    width: 4.5rem;
    height: 4.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .report__more {
    animation: none;
  }

  .report__chevron {
    transition: none;
  }
}
</style>
