<script setup>
// WS2. The found item report, in three steps:
//   1. A photo (optional). It uploads straight away, and the server suggests
//      the category, colour and brand from it.
//   2. The details: category, item name, colours, brand and description.
//   3. Where and when: the building, level and facility, and the date and time.
// Without the photo settings, step 1 is left out. The page is built on the
// design system (assets/system.css, class="ds").
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ItemIcon from '@/components/ui/ItemIcon.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import CampusMap from '@/components/campus/CampusMap.vue'
import ReportProgress from '@/components/report/ReportProgress.vue'
import ColourPicker from '@/components/report/ColourPicker.vue'
import {
  singaporeDate,
  singaporeTime,
  checkItemStep,
  buildFoundItem,
  fieldOfError,
  sortCategories,
} from '@/utils/report'
import { itemTone } from '@/utils/matches'
import { floorsInBuilding, spotsOnFloor, areaLabel } from '@/utils/campus-map'
import { buildingLabel, buildingsFromSpots } from '@/utils/campus-layout'
import { itemNumber } from '@/utils/design'
import { applySuggestions, suggestionBadge } from '@/utils/vision'
import { PHOTO_HINT, isPhotoUploadEnabled, resizedPhotoUrl } from '@/services/cloudinary'
import { useItemName } from '@/composables/useItemName'
import { usePhotoUpload } from '@/composables/usePhotoUpload'
import { useAuthStore } from '@/stores/auth'
import { errorText, isConnectionError, mayHaveSent } from '@/utils/safeguards'

const auth = useAuthStore()

const categories = ref([])
const colours = ref([])
const spots = ref([])
const loadError = ref('')
const isLoading = ref(true)

function emptyForm() {
  const now = new Date()
  return {
    title: '',
    category: '',
    colours: [],
    brand: '',
    description: '',
    building: '',
    floor: '',
    spotId: '',
    date: singaporeDate(now),
    time: singaporeTime(now),
    photoUrl: '',
  }
}

const form = ref(emptyForm())
const errorMessage = ref('')
// Which field the error is about, like 'category'. '' shows it by the buttons.
const errorField = ref('')
const isSubmitting = ref(false)
// Posting got no answer from FoundIt: "Not sent" beside the button, and the
// form keeps everything filled in
const notSent = ref(false)
// The post got no answer in time, so it may have been saved (NotSentNote says so;
// sending again is safe, the server answers with the saved report)
const maybeSent = ref(false)
// The server saves the find, then scores it (with Gemini) before it answers. On
// a cold start that took longer than 10 seconds, and giving up early showed
// "Not sent" for a find that was saved. Wait longer for this one (api.js now
// gives every write 30 seconds too).
const POST_TIMEOUT_MS = 30000
// Set after posting: { item, matches }
const posted = ref(null)
const successPhotoFailed = ref(false)
// The latest date the finder can pick. It is worked out again when the date
// box gets focus, so a page left open past midnight still allows today.
const today = ref(singaporeDate(new Date()))

// ---- Steps -----------------------------------------------------------------

// The steps, and which one is showing
const photoEnabled = isPhotoUploadEnabled()
const steps = photoEnabled ? ['photo', 'details', 'where'] : ['details', 'where']
const stepIndex = ref(0)
const step = computed(() => steps[stepIndex.value])

// Shows an error under its field, then scrolls to the field and puts the
// cursor in it
function showError(message, field = fieldOfError(message)) {
  errorMessage.value = message
  errorField.value = field
  if (!field) return
  nextTick(() => {
    const input = document.getElementById(`report-${field}`)
    input?.scrollIntoView?.({ block: 'center' })
    input?.focus({ preventScroll: true })
  })
}

function clearError() {
  errorMessage.value = ''
  errorField.value = ''
}

// Marks a field with an error, for screen readers
function fieldState(field) {
  return errorField.value === field
    ? { 'aria-invalid': 'true', 'aria-errormessage': `report-${field}-error` }
    : {}
}

// Changing anything in the form clears an error shown under a field
watch(
  form,
  () => {
    if (errorField.value) clearError()
  },
  { deep: true },
)

// Moves to a step and scrolls to the top
function goTo(index) {
  clearError()
  stepIndex.value = index
  window.scrollTo?.(0, 0)
}

// "Continue": checks the step first
function next() {
  if (step.value === 'photo' && isUploadingPhoto.value) {
    showError('Wait for the photo to finish uploading.')
    return
  }
  if (step.value === 'details') {
    const problem = checkItemStep(form.value)
    if (problem) return showError(problem)
  }
  goTo(stepIndex.value + 1)
}

// ---- Photo (step 1) --------------------------------------------------------

// The fields the photo filled in: [{ field, label, value, confidence }]
const tags = ref([])
const isSuggesting = ref(false)
// Counts the requests, so the answer for an older photo is ignored
let latestSuggestion = 0

// Asks the server what the photo shows, and fills in the empty fields
async function suggestFromPhoto(photoUrl) {
  latestSuggestion++
  const request = latestSuggestion
  isSuggesting.value = true
  try {
    const response = await api.post('/vision/suggest', { photoUrl })
    if (request !== latestSuggestion) return
    // The suggested colour becomes the main colour only if none is picked yet
    const { values, tags: suggested } = applySuggestions(
      { ...form.value, colour: form.value.colours[0] || '' },
      response.data,
    )
    if (values.category) form.value.category = values.category
    if (values.brand) form.value.brand = values.brand
    if (values.colour) form.value.colours = [values.colour]
    tags.value = suggested
  } catch {
    // The photo couldn't be read: the finder fills in the fields themselves
  } finally {
    if (request === latestSuggestion) isSuggesting.value = false
  }
}

// When the photo goes: forget its suggestions and empty the fields that still
// hold them
function clearSuggestions() {
  latestSuggestion++
  isSuggesting.value = false
  for (const tag of tags.value) {
    if (tag.field === 'colour') {
      form.value.colours = form.value.colours.filter((name) => name !== tag.value)
    } else if (form.value[tag.field] === tag.value) {
      form.value[tag.field] = ''
    }
  }
  tags.value = []
}

// The "From photo" or "Unsure" label beside a field that still holds a
// suggested value
function badgeFor(field) {
  const tag = tags.value.find((t) => t.field === field)
  const value = field === 'colour' ? form.value.colours[0] : form.value[field]
  return tag && value === tag.value ? suggestionBadge(tag.confidence) : ''
}

// The photo upload, shared with the lost report. A new photo asks for
// suggestions; removing it takes its suggestions away.
const {
  photoPreview,
  photoName,
  photoPreviewFailed,
  isUploadingPhoto,
  photoError,
  isDragging,
  choosePhoto,
  dropPhoto,
  removePhoto,
  clearPhoto,
} = usePhotoUpload({
  onChange(url) {
    if (!url) clearSuggestions()
    form.value.photoUrl = url
    if (url) suggestFromPhoto(url)
  },
})

// ---- Details (step 2) ------------------------------------------------------

// The item name is made from the details until the finder types their own.
// For Other, the finder has to type one.
const { isOther, titleShown, editTitle, resetTitle } = useItemName(form)

// ---- Where and when (step 3) -----------------------------------------------

// The lists for the Building, Level and Facility dropdowns
// The buildings A to Z by their short names, as on the map
const buildings = computed(() =>
  [...buildingsFromSpots(spots.value)].sort((a, b) =>
    buildingLabel(a).localeCompare(buildingLabel(b)),
  ),
)
const buildingFloors = computed(() => floorsInBuilding(spots.value, form.value.building))
const floorSpots = computed(() =>
  form.value.floor ? spotsOnFloor(spots.value, form.value.building, form.value.floor) : [],
)

// Picking a level. If it has only one facility, that one is picked too.
function pickFloor(floor) {
  form.value.floor = floor
  const here = floor ? spotsOnFloor(spots.value, form.value.building, floor) : []
  form.value.spotId = here.length === 1 ? String(here[0].id) : ''
  clearError()
}

// Picking a building. If it has only one level, that one is picked too.
function pickBuilding(building) {
  form.value.building = building
  const floors = floorsInBuilding(spots.value, building)
  pickFloor(floors.length === 1 ? floors[0] : '')
}

// Loads the lists the form needs
async function loadForm() {
  isLoading.value = true
  loadError.value = ''
  try {
    const [categoryRes, colourRes, spotRes] = await Promise.all([
      api.get('/categories'),
      api.get('/colours'),
      api.get('/spots'),
    ])
    categories.value = sortCategories(categoryRes.data)
    colours.value = colourRes.data
    spots.value = spotRes.data
  } catch {
    loadError.value = 'We couldn’t load the form. Check your connection and try again.'
  } finally {
    isLoading.value = false
  }
}
onMounted(loadForm)

// Asks before leaving a form that has something filled in, so the back
// button doesn't lose it
const hasContent = computed(() => {
  const f = form.value
  return Boolean(
    f.category ||
    f.title.trim() ||
    f.brand.trim() ||
    f.description.trim() ||
    f.colours.length ||
    f.photoUrl ||
    f.building ||
    photoPreview.value,
  )
})
// Logging out (or a login that ran out) leaves the page without asking, since
// the form can no longer be posted.
onBeforeRouteLeave(() => {
  if (posted.value || !hasContent.value || !auth.isLoggedIn) return true
  return window.confirm('Leave this report? What you’ve filled in will be lost.')
})

// Refreshing or closing the tab can't use the question above, so the browser
// shows its own "Leave site?" warning instead
function warnBeforeUnload(event) {
  if (posted.value || !hasContent.value) return
  event.preventDefault()
  // Older browsers need returnValue set to show the warning
  event.returnValue = ''
}
window.addEventListener('beforeunload', warnBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

// "Post it": checks the form and sends it
async function submit() {
  // A suspended account can't post (the form isn't shown to them anyway)
  if (auth.isSuspended) return
  clearError()
  notSent.value = false
  if (isUploadingPhoto.value) {
    showError('Wait for the photo to finish uploading.')
    return
  }
  if (form.value.building && !form.value.floor) {
    showError(`Pick the level in ${form.value.building}.`, 'level')
    return
  }
  if (form.value.floor && !form.value.spotId) {
    showError(`Pick the facility on ${form.value.floor} of ${form.value.building}.`, 'facility')
    return
  }
  const { body, error } = buildFoundItem(form.value)
  if (error) {
    showError(error)
    return
  }

  isSubmitting.value = true
  try {
    const response = await api.post('/items', body, { timeout: POST_TIMEOUT_MS })
    posted.value = response.data
    window.scrollTo?.(0, 0)
  } catch (error) {
    if (isConnectionError(error)) {
      notSent.value = true
      maybeSent.value = mayHaveSent(error)
    } else showError(errorText(error), '')
  } finally {
    isSubmitting.value = false
  }
}

// The form's submit button: Continue on steps 1 and 2, Post on step 3
function onSubmit() {
  if (step.value === 'where') submit()
  else next()
}

// After posting: how many lost reports look like this item
const ownersLine = computed(() => {
  const count = posted.value?.matches.length || 0
  return count === 1
    ? '1 lost report looks like this. Its owner will see it in their matches.'
    : `${count} lost reports look like this. Their owners will see it in their matches.`
})

// "Report another item": starts again with an empty form
function reportAnother() {
  posted.value = null
  successPhotoFailed.value = false
  photoError.value = ''
  clearPhoto()
  form.value = emptyForm()
  resetTitle()
  today.value = singaporeDate(new Date())
  goTo(0)
}
</script>

<template>
  <div class="ds found-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap found-main" data-testid="report-found">
      <div class="found-column">
        <!-- After posting -->
        <section v-if="posted" class="found-step ds-arrive" data-testid="report-success">
          <header class="found-head">
            <h1 class="ds-h1">Thanks. It’s on the feed.</h1>
            <p class="ds-lead ds-muted">
              We’ll tell the owner. Keep it safe until they message you, and ask about the detail
              you left out.
            </p>
          </header>

          <div class="found-panel">
            <div class="found-posted">
              <div class="found-posted__picture">
                <img
                  v-if="posted.item.photoUrl && !successPhotoFailed"
                  :src="resizedPhotoUrl(posted.item.photoUrl, 480)"
                  :alt="posted.item.title"
                  data-testid="report-success-photo"
                  @error="successPhotoFailed = true"
                />
                <ItemIcon
                  v-else
                  :category="posted.item.category"
                  :size="56"
                  :tone="itemTone(posted.item)"
                />
              </div>
              <div class="found-posted__words">
                <p class="ds-caption ds-muted ds-num">{{ itemNumber(posted.item) }}</p>
                <p class="ds-title">{{ posted.item.title }}</p>
              </div>
            </div>

            <div class="found-owners">
              <h2 class="ds-h3">Possible owners</h2>
              <p
                v-if="posted.matches.length === 0"
                class="ds-muted"
                data-testid="report-no-matches"
              >
                No matching lost reports yet. We’ll let you know when one appears.
              </p>
              <p v-else data-testid="report-matches">{{ ownersLine }}</p>
            </div>

            <div class="found-nav">
              <BaseButton variant="secondary" data-testid="report-another" @click="reportAnother">
                Report another item
              </BaseButton>
              <BaseButton :to="`/items/${posted.item.id}/record`" data-testid="report-view-record">
                See your report
                <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </BaseButton>
            </div>
          </div>
        </section>

        <!-- A suspended account can't post, so it's told before filling anything in -->
        <div
          v-else-if="auth.isSuspended"
          class="found-message"
          role="status"
          data-testid="report-suspended"
        >
          <p>
            Your account is suspended, so you can’t report a found item. You can still browse the
            feed.
          </p>
          <div class="d-flex flex-wrap gap-2">
            <BaseButton to="/appeal" data-testid="report-appeal">Appeal the suspension</BaseButton>
            <BaseButton variant="secondary" to="/feed">Browse the feed</BaseButton>
          </div>
        </div>

        <PageSkeleton v-else-if="isLoading" kind="form" :count="4" data-testid="report-loading" />

        <div
          v-else-if="loadError"
          class="found-message"
          role="alert"
          data-testid="report-load-error"
        >
          <p>{{ loadError }}</p>
          <BaseButton variant="secondary" data-testid="report-retry" @click="loadForm">
            Try again
          </BaseButton>
        </div>

        <form
          v-else
          class="found-step ds-arrive"
          novalidate
          data-testid="report-form"
          @submit.prevent="onSubmit"
        >
          <ReportProgress kind="found" :step="stepIndex" :count="steps.length" />

          <!-- Step 1: a photo (optional) -->
          <template v-if="step === 'photo'">
            <header class="found-head">
              <h1 class="ds-h1">First, a photo of it.</h1>
              <p class="ds-lead ds-muted">
                Owners spot their things by the photo. It’s optional, and we’ll suggest the details
                from it.
              </p>
            </header>
            <div class="found-panel" data-testid="report-photo">
              <div
                class="found-drop"
                :class="{ 'is-dragging': isDragging, 'has-photo': photoPreview }"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="dropPhoto"
              >
                <template v-if="photoPreview">
                  <div class="found-drop__preview">
                    <img
                      v-if="!photoPreviewFailed"
                      :src="photoPreview"
                      alt="The photo you chose"
                      data-testid="report-photo-preview"
                      @error="photoPreviewFailed = true"
                    />
                    <span v-else class="ds-small ds-muted">No preview for this photo type.</span>
                  </div>
                  <div class="found-drop__info">
                    <p class="found-drop__name" data-testid="report-photo-name">
                      {{ photoName }}
                    </p>
                    <p class="ds-small ds-muted" role="status" data-testid="report-photo-status">
                      {{
                        isUploadingPhoto
                          ? 'Uploading…'
                          : isSuggesting
                            ? 'Reading your photo…'
                            : 'Photo added'
                      }}
                    </p>
                    <div class="found-drop__actions">
                      <label
                        for="report-photo-input"
                        class="found-link"
                        data-testid="report-photo-retake"
                      >
                        Replace
                      </label>
                      <button
                        type="button"
                        class="found-link"
                        data-testid="report-photo-remove"
                        @click="removePhoto"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <svg class="found-drop__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4 4 0 0 1-1 9 M12 12v8 M9 15l3-3 3 3"
                    />
                  </svg>
                  <span class="ds-muted">Drop a photo here, or</span>
                  <label
                    for="report-photo-input"
                    class="ds-btn ds-btn--secondary found-choose"
                    data-testid="report-photo-add"
                  >
                    Choose a photo
                  </label>
                  <span class="found-drop__limit ds-small ds-muted">{{ PHOTO_HINT }}</span>
                </template>
                <input
                  id="report-photo-input"
                  type="file"
                  class="visually-hidden"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  data-testid="report-photo-input"
                  @change="choosePhoto"
                />
              </div>
              <p v-if="photoError" class="found-error-text" data-testid="report-photo-error">
                {{ photoError }}
              </p>
              <p class="ds-small ds-muted">
                Pick a photo that doesn’t show stickers, engravings or what’s inside.
              </p>
              <p
                v-if="errorMessage && !errorField"
                class="found-error"
                role="alert"
                data-testid="report-error"
              >
                {{ errorMessage }}
              </p>
              <div class="found-nav">
                <!-- Back to "What happened?" -->
                <BaseButton variant="secondary" to="/report" data-testid="report-back">
                  <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M13 8H3M7 4 3 8l4 4" />
                  </svg>
                  Back
                </BaseButton>
                <div class="found-nav__right">
                  <span class="ds-small ds-muted">Takes about a minute</span>
                  <BaseButton type="submit" :disabled="isUploadingPhoto" data-testid="report-next">
                    {{ photoPreview ? 'Continue' : 'Skip the photo' }}
                    <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </BaseButton>
                </div>
              </div>
            </div>
          </template>

          <!-- Step 2: the details -->
          <template v-else-if="step === 'details'">
            <header class="found-head">
              <h1 class="ds-h1">
                {{ tags.length ? 'Did we get it right?' : 'What did you find?' }}
              </h1>
              <p class="ds-lead ds-muted" data-testid="report-details-lede">
                {{
                  tags.length
                    ? 'We filled these in from your photo. Fix anything that’s off.'
                    : isSuggesting
                      ? 'Reading your photo… you can start filling these in.'
                      : 'Tell us what it is.'
                }}
              </p>
            </header>
            <div class="found-panel">
              <div class="found-field">
                <label for="report-category" class="found-label found-label--strong">
                  Category
                  <span
                    v-if="badgeFor('category')"
                    class="found-badge"
                    data-testid="report-badge-category"
                  >
                    {{ badgeFor('category') }}
                  </span>
                </label>
                <BaseSelect
                  id="report-category"
                  v-model="form.category"
                  placeholder="Pick one"
                  required
                  aria-describedby="report-category-help"
                  v-bind="fieldState('category')"
                  data-testid="report-category"
                >
                  <option
                    v-for="category in categories"
                    :key="category.name"
                    :value="category.name"
                  >
                    {{ category.name }}
                  </option>
                </BaseSelect>
                <p id="report-category-help" class="ds-small ds-muted">
                  Doesn’t fit the list? Pick Other and name it below.
                </p>
                <p
                  v-if="errorField === 'category'"
                  id="report-category-error"
                  class="found-error-text"
                  role="alert"
                  data-testid="report-error"
                >
                  {{ errorMessage }}
                </p>
              </div>

              <div class="found-field">
                <label for="report-title" class="found-label found-label--strong">
                  {{ isOther ? 'What is it?' : 'Item name' }}
                </label>
                <input
                  id="report-title"
                  :value="titleShown"
                  type="text"
                  class="found-input"
                  maxlength="100"
                  :required="isOther"
                  :placeholder="
                    isOther
                      ? 'For example, a silver ring'
                      : 'Filled in from the category and colour'
                  "
                  v-bind="fieldState('title')"
                  data-testid="report-title"
                  @input="editTitle"
                />
                <p
                  v-if="errorField === 'title'"
                  id="report-title-error"
                  class="found-error-text"
                  role="alert"
                  data-testid="report-error"
                >
                  {{ errorMessage }}
                </p>
              </div>

              <fieldset class="found-field found-colours">
                <legend class="found-label">
                  Colours
                  <span
                    v-if="badgeFor('colour')"
                    class="found-badge"
                    data-testid="report-badge-colour"
                  >
                    {{ badgeFor('colour') }}
                  </span>
                </legend>
                <ColourPicker v-model="form.colours" :colours="colours" name="report-colour" />
              </fieldset>

              <div class="found-field">
                <label for="report-brand" class="found-label">
                  Brand
                  <span
                    v-if="badgeFor('brand')"
                    class="found-badge"
                    data-testid="report-badge-brand"
                  >
                    {{ badgeFor('brand') }}
                  </span>
                </label>
                <input
                  id="report-brand"
                  v-model="form.brand"
                  type="text"
                  class="found-input"
                  maxlength="50"
                  placeholder="If you can tell"
                  v-bind="fieldState('brand')"
                  data-testid="report-brand"
                />
                <p
                  v-if="errorField === 'brand'"
                  id="report-brand-error"
                  class="found-error-text"
                  role="alert"
                  data-testid="report-error"
                >
                  {{ errorMessage }}
                </p>
              </div>

              <div class="found-field">
                <label for="report-description" class="found-label">Description</label>
                <textarea
                  id="report-description"
                  v-model="form.description"
                  class="found-input found-input--area"
                  rows="3"
                  maxlength="2000"
                  placeholder="What it looks like, and anything that stands out."
                  aria-describedby="report-description-help"
                  data-testid="report-description"
                ></textarea>
                <!-- The one piece of advice that keeps a false claim out -->
                <p
                  id="report-description-help"
                  class="found-note ds-small"
                  data-testid="report-leave-out-hint"
                >
                  <svg class="found-note__icon" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                  <span>
                    Leave out one detail only the owner would know. You can ask about it in chat.
                  </span>
                </p>
              </div>

              <p
                v-if="errorMessage && !errorField"
                class="found-error"
                role="alert"
                data-testid="report-error"
              >
                {{ errorMessage }}
              </p>
              <div class="found-nav">
                <BaseButton
                  v-if="stepIndex > 0"
                  variant="secondary"
                  data-testid="report-back"
                  @click="goTo(stepIndex - 1)"
                >
                  <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M13 8H3M7 4 3 8l4 4" />
                  </svg>
                  Back
                </BaseButton>
                <BaseButton v-else variant="secondary" to="/report" data-testid="report-back">
                  <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M13 8H3M7 4 3 8l4 4" />
                  </svg>
                  Back
                </BaseButton>
                <BaseButton type="submit" data-testid="report-next">
                  Continue
                  <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </BaseButton>
              </div>
            </div>
          </template>

          <!-- Step 3: where and when -->
          <template v-else>
            <header class="found-head">
              <h1 class="ds-h1">Where did you find it?</h1>
              <p class="ds-lead ds-muted">
                Pick the building and roughly when. It helps us match it to someone’s trail.
              </p>
            </header>
            <div class="found-panel">
              <CampusMap
                :spots="spots"
                :selected="form.building"
                clickable
                @select="pickBuilding"
              />
              <div class="found-row found-row--3">
                <div class="found-field">
                  <label for="report-building" class="found-label">Building</label>
                  <BaseSelect
                    id="report-building"
                    :model-value="form.building"
                    placeholder="Tap the map or pick one"
                    required
                    v-bind="fieldState('building')"
                    data-testid="report-building"
                    @update:model-value="pickBuilding"
                  >
                    <option v-for="building in buildings" :key="building" :value="building">
                      {{ buildingLabel(building) }}
                    </option>
                  </BaseSelect>
                  <p
                    v-if="errorField === 'building'"
                    id="report-building-error"
                    class="found-error-text"
                    role="alert"
                    data-testid="report-error"
                  >
                    {{ errorMessage }}
                  </p>
                </div>
                <div class="found-field">
                  <label for="report-level" class="found-label">Level</label>
                  <BaseSelect
                    id="report-level"
                    :model-value="form.floor"
                    :placeholder="form.building ? 'Pick one' : 'Pick the building first'"
                    :disabled="!form.building"
                    required
                    v-bind="fieldState('level')"
                    data-testid="report-level"
                    @update:model-value="pickFloor"
                  >
                    <option v-for="floor in buildingFloors" :key="floor" :value="floor">
                      {{ floor }}
                    </option>
                  </BaseSelect>
                  <p
                    v-if="errorField === 'level'"
                    id="report-level-error"
                    class="found-error-text"
                    role="alert"
                    data-testid="report-error"
                  >
                    {{ errorMessage }}
                  </p>
                </div>
                <div class="found-field">
                  <label for="report-facility" class="found-label">Facility</label>
                  <BaseSelect
                    id="report-facility"
                    v-model="form.spotId"
                    :placeholder="form.floor ? 'Pick one' : 'Pick the level first'"
                    :disabled="!form.floor"
                    required
                    v-bind="fieldState('facility')"
                    data-testid="report-facility"
                  >
                    <option v-for="spot in floorSpots" :key="spot.id" :value="String(spot.id)">
                      {{ areaLabel(spot.area) }}
                    </option>
                  </BaseSelect>
                  <p
                    v-if="errorField === 'facility'"
                    id="report-facility-error"
                    class="found-error-text"
                    role="alert"
                    data-testid="report-error"
                  >
                    {{ errorMessage }}
                  </p>
                </div>
              </div>
              <div class="found-row found-row--2">
                <div class="found-field">
                  <label for="report-date" class="found-label">Date</label>
                  <input
                    id="report-date"
                    v-model="form.date"
                    type="date"
                    class="found-input"
                    :max="today"
                    required
                    @focus="today = singaporeDate(new Date())"
                    v-bind="fieldState('date')"
                    data-testid="report-date"
                  />
                  <p
                    v-if="errorField === 'date'"
                    id="report-date-error"
                    class="found-error-text"
                    role="alert"
                    data-testid="report-error"
                  >
                    {{ errorMessage }}
                  </p>
                </div>
                <div class="found-field">
                  <label for="report-time" class="found-label">Time</label>
                  <input
                    id="report-time"
                    v-model="form.time"
                    type="time"
                    class="found-input"
                    required
                    data-testid="report-time"
                  />
                </div>
              </div>
              <p
                v-if="errorMessage && !errorField"
                class="found-error"
                role="alert"
                data-testid="report-error"
              >
                {{ errorMessage }}
              </p>
              <div class="found-nav">
                <BaseButton
                  variant="secondary"
                  data-testid="report-back"
                  @click="goTo(stepIndex - 1)"
                >
                  <svg class="found-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M13 8H3M7 4 3 8l4 4" />
                  </svg>
                  Back
                </BaseButton>
                <BaseButton
                  type="submit"
                  :disabled="isSubmitting || isUploadingPhoto"
                  data-testid="report-submit"
                >
                  {{ isSubmitting ? 'Posting…' : 'Post it' }}
                </BaseButton>
              </div>
              <NotSentNote
                v-if="notSent"
                :busy="isSubmitting"
                :maybe-sent="maybeSent"
                @retry="submit"
              />
            </div>
          </template>
        </form>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* One column of the design system (assets/system.css): the kind of report,
   a plain heading and line, then the step's fields in a flat panel. Colours,
   sizes and motion all come from the --ds-* tokens, so night mode follows. */
.found-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.found-main {
  flex: 1 0 auto;
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

.found-column {
  max-width: 42rem;
  margin-inline: auto;
}

.found-step {
  display: grid;
  gap: var(--ds-space-5);
}

.found-head {
  display: grid;
  gap: var(--ds-space-2);
}

/* "Found item report": its own width, at the start of the column */
.found-kind {
  justify-self: start;
}

/* ---- The panel that holds a step's fields: flat, on the surface ---- */
.found-panel {
  display: grid;
  gap: var(--ds-space-5);
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

@media (max-width: 575.98px) {
  .found-panel {
    padding: var(--ds-space-4);
  }
}

/* ---- Fields ---- */
.found-field {
  display: grid;
  gap: var(--ds-space-2);
  min-width: 0;
}

/* The colours sit in a fieldset with no border */
.found-colours {
  margin: 0;
  padding: 0;
  border: 0;
}

.found-colours legend {
  margin-bottom: var(--ds-space-2);
  padding: 0;
}

.found-label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-2);
  margin: 0;
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.found-label--strong {
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
}

/* "From photo" or "Unsure" beside a field the photo filled in */
.found-badge {
  padding: 0 var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
}

.found-input {
  width: 100%;
  min-height: var(--ds-control-h);
  padding: 0 var(--ds-space-3);
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-control);
  background-color: var(--ds-surface);
  color: var(--ds-text);
  font: inherit;
  transition: border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.found-input:hover:not(:disabled) {
  border-color: var(--ds-text-muted);
}

.found-input:focus {
  border-color: var(--ds-action);
}

.found-input::placeholder {
  color: var(--ds-text-muted);
}

.found-input:disabled {
  background-color: var(--ds-surface-sunken);
  color: var(--ds-text-muted);
  cursor: not-allowed;
}

/* A field with an error gets a red edge */
.found-input[aria-invalid='true'] {
  border-color: var(--ds-danger);
}

.found-input--area {
  min-height: 6rem;
  padding-block: var(--ds-space-3);
  resize: vertical;
}

/* "Leave out one detail only the owner would know": a quiet box, so it is
   read rather than skipped like small grey hint text */
.found-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
}

.found-note__icon {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  margin-top: 0.15em;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Rows of fields: one column on a phone, side by side from 576px */
.found-row {
  display: grid;
  gap: var(--ds-space-4);
}

@media (min-width: 576px) {
  .found-row--3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .found-row--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ---- Errors ---- */
.found-error-text {
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.found-error {
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  background: color-mix(in srgb, var(--ds-danger) 10%, transparent);
  color: var(--ds-danger);
  font-weight: var(--ds-weight-medium);
}

/* ---- The buttons at the bottom of a step ---- */
.found-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
  padding-top: var(--ds-space-2);
}

/* "Takes about a minute" beside the main button, on the right */
.found-nav__right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ds-space-3) var(--ds-space-4);
  margin-left: auto;
}

/* On a phone, "Takes about a minute" goes on its own line above the buttons */
@media (max-width: 575.98px) {
  .found-nav__right {
    display: contents;
  }

  .found-nav__right .ds-muted {
    order: -1;
    width: 100%;
  }
}

.found-arrow {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- The photo drop zone ---- */
.found-drop__limit {
  flex-basis: 100%;
}

.found-drop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-3);
  min-height: 9rem;
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface-sunken);
  text-align: center;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.found-drop.is-dragging {
  border-color: var(--ds-action);
  background: var(--ds-action-wash);
}

.found-drop.has-photo {
  justify-content: flex-start;
  text-align: left;
}

.found-drop__icon {
  width: 1.75rem;
  height: 1.75rem;
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.found-choose {
  cursor: pointer;
}

/* The file input is hidden, so its label shows the focus ring instead */
.found-choose:focus-within,
.found-drop__actions label:focus-within {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.found-drop__preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 9rem;
  height: 9rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.found-drop__preview img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.found-drop__info {
  display: grid;
  gap: var(--ds-space-1);
  min-width: 0;
}

.found-drop__name {
  overflow: hidden;
  font-weight: var(--ds-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.found-drop__actions {
  display: flex;
  gap: var(--ds-space-4);
  margin-top: var(--ds-space-1);
}

/* "Replace" and "Remove": underlined words, never a box */
.found-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-action);
  font-weight: var(--ds-weight-medium);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: pointer;
}

.found-link:hover {
  color: var(--ds-action-hover);
  text-decoration-thickness: 2px;
}

/* ---- After posting ---- */
.found-posted {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
}

.found-posted__picture {
  position: relative;
  display: grid;
  place-items: center;
  width: 5.5rem;
  height: 5.5rem;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
  color: var(--ds-text-muted);
}

.found-posted__picture img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.found-posted__words {
  display: grid;
  gap: var(--ds-space-1);
  min-width: 0;
}

.found-owners {
  display: grid;
  gap: var(--ds-space-2);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-border);
}

/* Suspended and couldn't-load: a quiet dashed panel with one way on */
.found-message {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-4);
  padding: var(--ds-space-7) var(--ds-space-4);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
  text-align: center;
}
</style>
