<script setup>
// /report/lost: details, optional photo, the trail of places, then how sure
// the owner is of the times. Checks and the request body are in utils/trail.js.
// It answers one question: what did I lose, and where have I been? Rebuilt in
// the design system (assets/system.css, class="ds"), in the same column as
// the found report.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import api from '@/api'
import AppFooter from '@/components/ui/AppFooter.vue'
import PageSkeleton from '@/components/ui/PageSkeleton.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import SegmentedToggle from '@/components/ui/SegmentedToggle.vue'
import ReportProgress from '@/components/report/ReportProgress.vue'
import ColourPicker from '@/components/report/ColourPicker.vue'
import TrailStops from '@/components/report/TrailStops.vue'
import LeaveReportDialog from '@/components/report/LeaveReportDialog.vue'
import { PHOTO_HINT, isPhotoUploadEnabled } from '@/services/cloudinary'
import { useItemName } from '@/composables/useItemName'
import { usePhotoUpload } from '@/composables/usePhotoUpload'
import { buildingLabel } from '@/utils/campus-layout'
import { itemNumber } from '@/utils/design'
import { fieldOfError, sortCategories, singaporeDate } from '@/utils/report'
import { useAuthStore } from '@/stores/auth'
import { isConnectionError, mayHaveSent, safeRedirect } from '@/utils/safeguards'
import {
  DEFAULT_TIME_SLACK,
  TIME_SLACK_OPTIONS,
  buildLostItem,
  checkDetails,
  checkTrail,
  formatSlack,
  trailErrorTarget,
  slackExample,
} from '@/utils/trail'

const auth = useAuthStore()
const categories = ref([])
const colours = ref([])
const spots = ref([])
const loadError = ref('')
const isLoading = ref(true)
// A message from outside the step's checks: the photo, the server, the trail
const formError = ref('')
const posting = ref(false)
// After posting: { item, matches }
const posted = ref(null)

const details = ref({
  category: '',
  // The item name; empty means "use the one made from the details"
  title: '',
  // Up to 3, main colour first
  colours: [],
  brand: '',
  description: '',
  // Set once the photo has finished uploading to Cloudinary
  photoUrl: '',
})
// The day and the trail of places (step 3)
const date = ref(singaporeDate(new Date()))
// [{ key, building, spotId, start, end }], edited by TrailStops.vue
const stops = ref([])

// ---- What (step 1) ---------------------------------------------------------

// Item name built from the details until the owner types their own
const { isOther, titleShown, editTitle } = useItemName(details)

// ---- Photo (step 2) --------------------------------------------------------

// Shared with the found report (composables/usePhotoUpload.js)
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
} = usePhotoUpload({
  onChange(url) {
    details.value.photoUrl = url
  },
})

// ---- Steps -----------------------------------------------------------------

const photoEnabled = isPhotoUploadEnabled()
const steps = photoEnabled ? ['what', 'photo', 'trail', 'times'] : ['what', 'trail', 'times']
const stepIndex = ref(0)
const step = computed(() => steps[stepIndex.value])

// The message a failed Continue showed. It stays while that problem is still
// there and goes as soon as it is fixed; a different problem waits for the
// next Continue, so the owner is never told off about a field they haven't reached.
const shownError = ref('')

function checkStep() {
  if (step.value === 'what') return checkDetails(details.value)
  if (step.value === 'trail') return checkTrail(date.value, stops.value)
  return ''
}

function goTo(index) {
  formError.value = ''
  shownError.value = ''
  stepIndex.value = index
  window.scrollTo?.(0, 0)
}

function next() {
  const problem = checkStep()
  if (problem) {
    shownError.value = problem
    return
  }
  goTo(stepIndex.value + 1)
}

function onSubmit() {
  // Neither moving on nor posting while the photo is still uploading
  if (isUploadingPhoto.value) {
    formError.value = 'Wait for the photo to finish uploading.'
    return
  }
  if (step.value === 'times') post()
  else next()
}

// The Continue button's words, and when it can't be pressed yet
const nextLabel = computed(() =>
  step.value === 'photo' && !photoPreview.value ? 'Skip the photo' : 'Continue',
)
const nextDisabled = computed(
  () =>
    (step.value === 'photo' && isUploadingPhoto.value) ||
    (step.value === 'trail' && stops.value.length === 0),
)

// The message under the step: the one from the last failed Continue while
// that problem is still there, else any other message (photo, server)
const errorMessage = computed(
  () =>
    (shownError.value && checkStep() === shownError.value && shownError.value) || formError.value,
)

// The step 1 field the message is about ('category', 'title' or 'brand'), so
// the message shows under that field with a red edge, as on the found report.
// '' leaves it in the box above the buttons.
const errorField = computed(() =>
  step.value === 'what' && errorMessage.value ? fieldOfError(errorMessage.value) : '',
)

// Marks a field with an error, for screen readers too
function fieldState(field) {
  return errorField.value === field
    ? { 'aria-invalid': 'true', 'aria-errormessage': 'lost-error-message' }
    : {}
}

// On the trail step: which stop and field the message is about (utils/trail.js)
const trailTarget = computed(() =>
  step.value === 'trail' ? trailErrorTarget(errorMessage.value) : null,
)

// ---- Times (step 4) --------------------------------------------------------

const SLACK_OPTIONS = TIME_SLACK_OPTIONS.map((minutes) => ({
  value: String(minutes),
  label: formatSlack(minutes),
}))
const slack = ref(String(DEFAULT_TIME_SLACK))

const example = computed(() => {
  const last = stops.value.at(-1)
  return slackExample(last, last ? buildingLabel(last.building) : '', Number(slack.value))
})

// Posting got no answer from FoundIt: "Not sent" beside the button, and the
// form keeps everything filled in
const notSent = ref(false)
// The post got no answer in time, so it may have been saved (NotSentNote says so;
// sending again is safe, the server answers with the saved report)
const maybeSent = ref(false)

// The server saves the report, then scores it (with Gemini) before it answers.
// On a cold start that took longer than 10 seconds, and giving up early showed
// "Not sent" for a report that was saved. Wait longer for this one (api.js now
// gives every write 30 seconds too).
const POST_TIMEOUT_MS = 30000

async function post() {
  // The form is not shown to a suspended account; the server refuses anyway
  if (auth.isSuspended) return
  notSent.value = false
  const { body, error } = buildLostItem(
    details.value,
    date.value,
    stops.value,
    new Date(),
    Number(slack.value),
  )
  if (error) {
    formError.value = error
    return
  }
  formError.value = ''
  posting.value = true
  try {
    const { data } = await api.post('/items', body, { timeout: POST_TIMEOUT_MS })
    posted.value = data
    window.scrollTo?.(0, 0)
  } catch (error) {
    if (isConnectionError(error)) {
      notSent.value = true
      maybeSent.value = mayHaveSent(error)
    } else formError.value = error.response?.data?.error || 'Could not post the report. Try again.'
  } finally {
    posting.value = false
  }
}

// ---- Leaving -----------------------------------------------------------------

// Optional ?redirect= back to the page that sent the owner here
const route = useRoute()
const returnTo = computed(() => safeRedirect(route.query.redirect, ''))

// Anything typed, picked or uploaded that leaving would throw away
const hasContent = computed(
  () =>
    Boolean(
      details.value.category ||
      details.value.title ||
      details.value.colours.length ||
      details.value.brand.trim() ||
      details.value.description.trim() ||
      details.value.photoUrl,
    ) || stops.value.length > 0,
)

// Ask before leaving with unsaved input, in the page's own dialog
// (LeaveReportDialog). The route change waits until the owner answers.
// Logging out (or a login that ran out) leaves without asking, since the
// form can no longer be posted.
// While the dialog is open, this holds the function that answers the route change
const answerLeave = ref(null)

onBeforeRouteLeave(() => {
  if (posted.value || !hasContent.value || !auth.isLoggedIn) return true
  // A second click while the dialog is open: stay on the first question
  if (answerLeave.value) return false
  return new Promise((resolve) => {
    answerLeave.value = resolve
  })
})

// true leaves, false keeps the owner on the form
function answerLeaving(leave) {
  const resolve = answerLeave.value
  answerLeave.value = null
  resolve?.(leave)
}

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

async function loadForm() {
  isLoading.value = true
  loadError.value = ''
  try {
    const [categoriesResponse, coloursResponse, spotsResponse] = await Promise.all([
      api.get('/categories'),
      api.get('/colours'),
      api.get('/spots'),
    ])
    categories.value = sortCategories(categoriesResponse.data)
    colours.value = coloursResponse.data
    spots.value = spotsResponse.data
  } catch {
    loadError.value = 'We couldn’t load the form. Check your connection and try again.'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadForm)
</script>

<template>
  <div class="ds lost-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap lost-main" data-testid="report-lost">
      <div class="lost-column" :class="{ 'is-wide': step === 'trail' && !posted }">
        <!-- After posting -->
        <section v-if="posted" class="lost-step ds-arrive" data-testid="lost-posted">
          <header class="lost-head lost-head--posted">
            <div class="lost-head__words">
              <h1 class="ds-h1">We’re watching for it.</h1>
              <p class="ds-lead ds-muted">
                Every new find is checked against your trail. We’ll email you when one looks like
                yours.
              </p>
            </div>
            <!-- The lion cheering: the report is in -->
            <MascotArt variant="cheer" :size="112" class="lost-head__lion" aria-hidden="true" />
          </header>

          <div class="lost-panel">
            <div class="lost-posted">
              <p class="ds-caption ds-muted ds-num">{{ itemNumber(posted.item) }}</p>
              <p class="ds-title">{{ posted.item?.title }}</p>
            </div>
            <p class="lost-posted__matches" data-testid="lost-posted-matches">
              <template v-if="posted.matches?.length">
                {{ posted.matches.length }} find{{
                  posted.matches.length === 1 ? ' already looks' : 's already look'
                }}
                like yours.
              </template>
              <template v-else>Nothing matches yet.</template>
            </p>
            <div class="lost-nav">
              <template v-if="returnTo">
                <BaseButton variant="secondary" to="/matches" data-testid="lost-see-matches">
                  See my matches
                </BaseButton>
                <BaseButton :to="returnTo" data-testid="lost-return">
                  {{ returnTo.endsWith('/dispute') ? 'Back to the dispute' : 'Continue' }}
                  <svg class="lost-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </BaseButton>
              </template>
              <template v-else>
                <BaseButton variant="secondary" to="/feed">Back to the feed</BaseButton>
                <BaseButton to="/matches" data-testid="lost-see-matches">
                  See my matches
                  <svg class="lost-arrow" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </BaseButton>
              </template>
            </div>
          </div>
        </section>

        <!-- Suspended accounts can't post -->
        <div
          v-else-if="auth.isSuspended"
          class="lost-message"
          role="status"
          data-testid="lost-suspended"
        >
          <p>
            Your account is suspended, so you can’t post a lost report. You can still browse the
            feed for your item.
          </p>
          <div class="d-flex flex-wrap gap-2">
            <BaseButton to="/appeal" data-testid="lost-appeal">Appeal the suspension</BaseButton>
            <BaseButton variant="secondary" to="/feed">Browse the feed</BaseButton>
          </div>
        </div>

        <PageSkeleton v-else-if="isLoading" kind="form" :count="4" />

        <div v-else-if="loadError" class="lost-message" role="alert" data-testid="lost-load-error">
          <MascotArt variant="oops" :size="96" aria-hidden="true" />
          <p>{{ loadError }}</p>
          <BaseButton variant="secondary" data-testid="lost-retry" @click="loadForm">
            Try again
          </BaseButton>
        </div>

        <form v-else class="lost-step ds-arrive" novalidate @submit.prevent="onSubmit">
          <!-- The kind of report, then how far along: shared with the found report -->
          <ReportProgress kind="lost" :step="stepIndex" :count="steps.length" />

          <!-- Each step's heading -->
          <header class="lost-head">
            <template v-if="step === 'what'">
              <h1 class="ds-h1">What did you lose?</h1>
              <p class="ds-lead ds-muted">
                Tell us what it looks like. We check every new find against it.
              </p>
            </template>
            <template v-else-if="step === 'photo'">
              <h1 class="ds-h1">Got a photo of it?</h1>
              <p class="ds-lead ds-muted">
                Optional. An old photo helps finders recognise it. Only you and admins see it.
              </p>
            </template>
            <template v-else-if="step === 'trail'">
              <h1 class="ds-h1">Where have you been?</h1>
              <p class="ds-lead ds-muted">
                Tap the buildings you passed through, in order. Finds near your trail come to you
                first.
              </p>
            </template>
            <template v-else>
              <h1 class="ds-h1">How sure are you of the times?</h1>
              <p class="ds-lead ds-muted">
                We’ll still match finds a little outside your times, by how much you choose.
              </p>
            </template>
          </header>

          <!-- One panel: the step's fields, then the message and the buttons -->
          <div class="lost-panel" :data-testid="step === 'photo' ? 'lost-photo' : undefined">
            <!-- Step 1: what it is -->
            <template v-if="step === 'what'">
              <div class="lost-field">
                <label for="lost-category" class="lost-label lost-label--strong">Category</label>
                <BaseSelect
                  id="lost-category"
                  v-model="details.category"
                  placeholder="Pick one"
                  required
                  aria-describedby="lost-category-help"
                  v-bind="fieldState('category')"
                  data-testid="lost-category"
                >
                  <option v-for="entry in categories" :key="entry.name" :value="entry.name">
                    {{ entry.name }}
                  </option>
                </BaseSelect>
                <p id="lost-category-help" class="ds-small ds-muted">
                  Doesn’t fit the list? Pick Other and name it below.
                </p>
                <p
                  v-if="errorField === 'category'"
                  id="lost-error-message"
                  class="lost-error-text"
                  role="alert"
                  data-testid="lost-error"
                >
                  {{ errorMessage }}
                </p>
              </div>

              <div class="lost-field">
                <label for="lost-title" class="lost-label lost-label--strong">
                  {{ isOther ? 'What is it?' : 'Item name' }}
                </label>
                <input
                  id="lost-title"
                  :value="titleShown"
                  type="text"
                  class="lost-input"
                  maxlength="100"
                  :required="isOther"
                  :placeholder="
                    isOther ? 'For example, a silver ring' : 'We’ll fill this in for you'
                  "
                  autocomplete="off"
                  v-bind="fieldState('title')"
                  data-testid="lost-title"
                  @input="editTitle"
                />
                <p
                  v-if="errorField === 'title'"
                  id="lost-error-message"
                  class="lost-error-text"
                  role="alert"
                  data-testid="lost-error"
                >
                  {{ errorMessage }}
                </p>
              </div>

              <fieldset class="lost-field lost-colours">
                <legend class="lost-label">Colours</legend>
                <ColourPicker v-model="details.colours" :colours="colours" name="lost-colour" />
              </fieldset>

              <div class="lost-field">
                <label for="lost-brand" class="lost-label">Brand</label>
                <input
                  id="lost-brand"
                  v-model="details.brand"
                  type="text"
                  class="lost-input"
                  maxlength="50"
                  placeholder="If you know it"
                  autocomplete="off"
                  v-bind="fieldState('brand')"
                  data-testid="lost-brand"
                />
                <p
                  v-if="errorField === 'brand'"
                  id="lost-error-message"
                  class="lost-error-text"
                  role="alert"
                  data-testid="lost-error"
                >
                  {{ errorMessage }}
                </p>
              </div>

              <div class="lost-field">
                <label for="lost-description" class="lost-label">Description</label>
                <textarea
                  id="lost-description"
                  v-model="details.description"
                  class="lost-input lost-input--area"
                  rows="3"
                  maxlength="2000"
                  placeholder="Anything that tells it apart: stickers, scratches, what was inside"
                  data-testid="lost-description"
                ></textarea>
              </div>
            </template>

            <!-- Step 2: an old photo, optional -->
            <template v-else-if="step === 'photo'">
              <div
                class="lost-drop"
                :class="{ 'is-dragging': isDragging, 'has-photo': photoPreview }"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="dropPhoto"
              >
                <template v-if="photoPreview">
                  <div class="lost-drop__preview">
                    <img
                      v-if="!photoPreviewFailed"
                      :src="photoPreview"
                      alt="The photo you chose"
                      data-testid="lost-photo-preview"
                      @error="photoPreviewFailed = true"
                    />
                    <span v-else class="ds-small ds-muted">No preview for this photo type.</span>
                  </div>
                  <div class="lost-drop__info">
                    <p class="lost-drop__name">{{ photoName }}</p>
                    <p class="ds-small ds-muted" role="status" data-testid="lost-photo-status">
                      {{ isUploadingPhoto ? 'Uploading…' : 'Photo added' }}
                    </p>
                    <div class="lost-drop__actions">
                      <label for="lost-photo-input" class="lost-link">Replace</label>
                      <button
                        type="button"
                        class="lost-link"
                        data-testid="lost-photo-remove"
                        @click="removePhoto"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <svg class="lost-drop__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4 4 0 0 1-1 9 M12 12v8 M9 15l3-3 3 3"
                    />
                  </svg>
                  <span class="ds-muted">Drop a photo here, or</span>
                  <label for="lost-photo-input" class="ds-btn ds-btn--secondary lost-choose">
                    Choose a photo
                  </label>
                  <span class="lost-drop__limit ds-small ds-muted">{{ PHOTO_HINT }}</span>
                </template>
                <input
                  id="lost-photo-input"
                  type="file"
                  class="visually-hidden"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  data-testid="lost-photo-input"
                  @change="choosePhoto"
                />
              </div>
              <p v-if="photoError" class="lost-error-text" data-testid="lost-photo-error">
                {{ photoError }}
              </p>
            </template>

            <!-- Step 3: the trail -->
            <template v-else-if="step === 'trail'">
              <TrailStops
                v-model:date="date"
                v-model:stops="stops"
                :spots="spots"
                :invalid="trailTarget"
                error-id="lost-error-message"
                @error="formError = $event"
              />
            </template>

            <!-- Step 4: how sure of the times -->
            <template v-else>
              <SegmentedToggle
                v-model="slack"
                class="lost-slack"
                :options="SLACK_OPTIONS"
                label="How far outside your times"
                data-testid="lost-slack"
              />
              <p class="ds-muted" data-testid="lost-slack-example">{{ example }}</p>
            </template>

            <p
              v-if="errorMessage && !errorField"
              id="lost-error-message"
              class="lost-error"
              role="alert"
              data-testid="lost-error"
            >
              {{ errorMessage }}
            </p>
            <div class="lost-nav">
              <BaseButton
                v-if="stepIndex === 0"
                variant="secondary"
                to="/report"
                data-testid="lost-back"
              >
                <svg class="lost-arrow" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M13 8H3M7 4 3 8l4 4" />
                </svg>
                Back
              </BaseButton>
              <BaseButton
                v-else
                variant="secondary"
                data-testid="lost-back"
                @click="goTo(stepIndex - 1)"
              >
                <svg class="lost-arrow" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M13 8H3M7 4 3 8l4 4" />
                </svg>
                Back
              </BaseButton>
              <BaseButton
                v-if="step === 'times'"
                type="submit"
                :disabled="posting"
                :aria-busy="posting"
                data-testid="lost-post"
              >
                {{ posting ? 'Posting…' : 'Start watching for it' }}
              </BaseButton>
              <BaseButton v-else type="submit" :disabled="nextDisabled" data-testid="lost-next">
                {{ nextLabel }}
                <svg class="lost-arrow" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </BaseButton>
            </div>
            <NotSentNote
              v-if="notSent && step === 'times'"
              :busy="posting"
              :maybe-sent="maybeSent"
              @retry="post"
            />
          </div>

          <!-- The lion watching beside the form, only where there is room -->
          <MascotArt
            v-if="step === 'what' || step === 'times'"
            variant="watching"
            :size="120"
            class="lost-mascot"
            aria-hidden="true"
          />
        </form>
      </div>
    </main>

    <AppFooter />

    <LeaveReportDialog
      v-if="answerLeave"
      @stay="answerLeaving(false)"
      @leave="answerLeaving(true)"
    />
  </div>
</template>

<style scoped>
/* One column of the design system, the same as the found report: the kind of
   report and the step, a plain heading and line, then the step's fields in a
   flat panel. The trail step is wider, for the map beside the list. */
.lost-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.lost-main {
  flex: 1 0 auto;
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

.lost-column {
  position: relative;
  max-width: 42rem;
  margin-inline: auto;
}

.lost-column.is-wide {
  max-width: var(--ds-page-max);
}

.lost-step {
  position: relative;
  display: grid;
  gap: var(--ds-space-5);
}

.lost-head {
  display: grid;
  gap: var(--ds-space-2);
}

/* ---- The panel that holds a step's fields: flat, on the surface ---- */
.lost-panel {
  display: grid;
  gap: var(--ds-space-5);
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

/* ---- Fields ---- */
.lost-field {
  display: grid;
  gap: var(--ds-space-2);
  min-width: 0;
}

/* The colours sit in a fieldset with no border */
.lost-colours {
  margin: 0;
  padding: 0;
  border: 0;
}

.lost-colours legend {
  margin-bottom: var(--ds-space-2);
  padding: 0;
}

.lost-label {
  margin: 0;
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.lost-label--strong {
  font-size: var(--ds-size-body);
  font-weight: var(--ds-weight-bold);
}

.lost-input {
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

.lost-input:hover:not(:disabled) {
  border-color: var(--ds-text-muted);
}

.lost-input:focus {
  border-color: var(--ds-action);
}

/* The field the message is about gets a red edge, as on the found report */
.lost-input[aria-invalid='true'] {
  border-color: var(--ds-danger);
}

.lost-input::placeholder {
  color: var(--ds-text-muted);
}

.lost-input--area {
  min-height: 6rem;
  padding-block: var(--ds-space-3);
  resize: vertical;
}

/* ---- Errors ---- */
.lost-error-text {
  color: var(--ds-danger);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.lost-error {
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  background: color-mix(in srgb, var(--ds-danger) 10%, transparent);
  color: var(--ds-danger);
  font-weight: var(--ds-weight-medium);
}

/* ---- The buttons at the bottom of a step ---- */
.lost-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
  padding-top: var(--ds-space-2);
}

.lost-arrow {
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
.lost-drop__limit {
  flex-basis: 100%;
}

.lost-drop {
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

.lost-drop.is-dragging {
  border-color: var(--ds-action);
  background: var(--ds-action-wash);
}

.lost-drop.has-photo {
  justify-content: flex-start;
  text-align: left;
}

.lost-drop__icon {
  width: 1.75rem;
  height: 1.75rem;
  fill: none;
  stroke: var(--ds-text-muted);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* The file input is hidden, so its label shows the focus ring instead */
.lost-choose:focus-within,
.lost-drop__actions label:focus-within {
  outline: 3px solid var(--ds-focus);
  outline-offset: 2px;
}

.lost-drop__preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 9rem;
  height: 9rem;
  overflow: hidden;
  border-radius: var(--ds-radius-control);
  background: var(--ds-surface-tile);
}

.lost-drop__preview img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lost-drop__info {
  display: grid;
  gap: var(--ds-space-1);
  min-width: 0;
}

.lost-drop__name {
  overflow: hidden;
  font-weight: var(--ds-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lost-drop__actions {
  display: flex;
  gap: var(--ds-space-4);
  margin-top: var(--ds-space-1);
}

/* "Replace" and "Remove": underlined words, never a box, with a full tap area */
.lost-link {
  position: relative;
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

.lost-link::after {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--ds-space-3)) calc(-1 * var(--ds-space-1));
}

.lost-link:hover {
  color: var(--ds-action-hover);
  text-decoration-thickness: 2px;
}

/* ---- Times step ---- */
.lost-slack {
  justify-self: start;
}

.lost-slack :deep(.fi-toggle__legend) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

/* ---- After posting ---- */
.lost-posted {
  display: grid;
  gap: var(--ds-space-1);
}

.lost-posted__matches {
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-border);
  font-weight: var(--ds-weight-medium);
}

/* Suspended and couldn't-load: a quiet dashed panel with one way on */
.lost-message {
  display: grid;
  justify-items: center;
  gap: var(--ds-space-4);
  padding: var(--ds-space-7) var(--ds-space-4);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
  color: var(--ds-text-muted);
  text-align: center;
}

/* After posting: the words, with the cheering lion on the right */
.lost-head--posted {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ds-space-4);
}

.lost-head__words {
  display: grid;
  gap: var(--ds-space-2);
}

/* On a phone the lion goes above the words, smaller, so the heading keeps its width */
@media (max-width: 479.98px) {
  .lost-head--posted {
    grid-template-columns: minmax(0, 1fr);
  }

  .lost-head__lion {
    order: -1;
    width: auto;
    height: var(--ds-space-8);
  }
}

/* The lion stands beside the panel where the page has room for it */
.lost-mascot {
  display: none;
}

@media (max-width: 575.98px) {
  .lost-panel {
    padding: var(--ds-space-4);
  }
}

@media (min-width: 1200px) {
  .lost-mascot {
    position: absolute;
    bottom: 0;
    left: calc(100% + var(--ds-space-6));
    display: block;
  }
}
</style>
