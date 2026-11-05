<script setup>
// /profile: name, email alerts (students only) and password. Changing the
// password signs out other devices; this one keeps a new token.
// It answers one question: what's on my account, and how do I change it?
// Rebuilt in the design system (assets/system.css, class="ds").
import { computed, ref } from 'vue'
import AppFooter from '@/components/ui/AppFooter.vue'
import AppHeader from '@/components/ui/AppHeader.vue'
import TrailBackdrop from '@/components/feed/TrailBackdrop.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import MascotArt from '@/components/ui/MascotArt.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import { useAuthStore } from '@/stores/auth'
import { initials } from '@/utils/design'
import { errorText, isConnectionError } from '@/utils/safeguards'

const auth = useAuthStore()

const roleWord = computed(() => (auth.isAdmin ? 'Admin' : 'Student'))

// "Alice Tan" -> "AT" for the round avatar; the email's first letter if no name
const avatarLetters = computed(
  () => initials(auth.user?.name) || (auth.user?.email || '?').charAt(0).toUpperCase(),
)

// The email in two parts, so a long one on a phone wraps just before the "@"
// ("ben.lim.2024" / "@business.smu.edu.sg") instead of in the middle of a word
const emailParts = computed(() => {
  const email = auth.user?.email || ''
  const at = email.lastIndexOf('@')
  return at > 0 ? [email.slice(0, at), email.slice(at)] : [email, '']
})

// ---- Name and email alerts ----
const name = ref(auth.user?.name || '')
// The new-match and claim emails (server/alerts/). Accounts start with them on.
const alertsOn = ref(auth.user?.alertsOn !== false)
const detailsError = ref('')
const detailsNotice = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the form keeps its words
const detailsNotSent = ref(false)
const isSavingDetails = ref(false)

const detailsChanged = computed(
  () =>
    name.value.trim() !== (auth.user?.name || '') ||
    (!auth.isAdmin && alertsOn.value !== (auth.user?.alertsOn !== false)),
)

async function saveDetails() {
  detailsError.value = ''
  detailsNotice.value = ''
  detailsNotSent.value = false
  if (!name.value.trim()) {
    detailsError.value = 'Name is required'
    return
  }
  const fields = { name: name.value.trim() }
  if (!auth.isAdmin) fields.alertsOn = alertsOn.value
  isSavingDetails.value = true
  try {
    await auth.updateProfile(fields)
    name.value = auth.user.name
    alertsOn.value = auth.user.alertsOn !== false
    detailsNotice.value = 'Saved.'
  } catch (error) {
    if (isConnectionError(error)) detailsNotSent.value = true
    else detailsError.value = errorText(error)
  } finally {
    isSavingDetails.value = false
  }
}

// ---- Change password ----
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordNotice = ref('')
const passwordNotSent = ref(false)
const isSavingPassword = ref(false)

async function changePassword() {
  passwordError.value = ''
  passwordNotice.value = ''
  passwordNotSent.value = false
  // The same rule as the server and the register page
  if (newPassword.value.length < 8 || newPassword.value.length > 72) {
    passwordError.value = 'New password must be 8 to 72 characters'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'The two new passwords do not match'
    return
  }
  isSavingPassword.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordNotice.value = 'Password changed. Any other device you were signed in on is signed out.'
  } catch (error) {
    if (isConnectionError(error)) passwordNotSent.value = true
    else passwordError.value = errorText(error)
  } finally {
    isSavingPassword.value = false
  }
}
</script>

<template>
  <div class="ds profile-page">
    <TrailBackdrop />
    <AppHeader />

    <main class="ds-wrap profile-main">
      <div class="profile-column">
        <!-- Who you are here: the avatar, your name, your SMU email and account -->
        <header class="profile-head">
          <span class="profile-avatar" aria-hidden="true" data-testid="profile-avatar">
            {{ avatarLetters }}
          </span>
          <div class="profile-who">
            <h1 class="ds-h2 profile-name">{{ auth.user?.name || 'Your profile' }}</h1>
            <p class="profile-facts">
              <span class="ds-muted profile-email" data-testid="profile-email"
                ><span>{{ emailParts[0] }}</span
                ><wbr /><span>{{ emailParts[1] }}</span></span
              >
              <span class="profile-role" data-testid="profile-role">{{ roleWord }}</span>
            </p>
          </div>
          <!-- The shy lion, on the right where there is room -->
          <MascotArt variant="shy" :size="88" class="profile-lion" aria-hidden="true" />
        </header>

        <section class="profile-panel" aria-labelledby="profile-details-title">
          <h2 id="profile-details-title" class="ds-h3">Details</h2>

          <form
            class="profile-form"
            data-testid="profile-details-form"
            @submit.prevent="saveDetails"
          >
            <div class="profile-field">
              <label for="profile-name" class="profile-label">Name</label>
              <input
                id="profile-name"
                v-model="name"
                type="text"
                maxlength="100"
                autocomplete="name"
                required
                class="profile-input"
                data-testid="profile-name"
              />
            </div>

            <!-- Email alerts: an on/off switch (a checkbox underneath, so it works everywhere) -->
            <label v-if="!auth.isAdmin" class="profile-switch">
              <span class="profile-switch__words">
                <span class="profile-label">Email alerts</span>
                <span class="ds-small ds-muted">
                  Email me when a find might be my lost item, or someone claims what I found
                </span>
              </span>
              <input
                v-model="alertsOn"
                type="checkbox"
                role="switch"
                class="profile-switch__input"
                data-testid="profile-alerts"
              />
            </label>

            <p
              v-if="detailsError"
              class="profile-message profile-message--error"
              role="alert"
              data-testid="profile-details-error"
            >
              {{ detailsError }}
            </p>
            <p
              v-if="detailsNotice"
              class="profile-message profile-message--done"
              role="status"
              data-testid="profile-details-notice"
            >
              {{ detailsNotice }}
            </p>

            <div class="profile-actions">
              <BaseButton
                type="submit"
                :disabled="isSavingDetails || !detailsChanged"
                :aria-busy="isSavingDetails"
                data-testid="profile-details-save"
              >
                {{ isSavingDetails ? 'Saving…' : 'Save changes' }}
              </BaseButton>
              <NotSentNote v-if="detailsNotSent" :busy="isSavingDetails" @retry="saveDetails" />
            </div>
          </form>
        </section>

        <section class="profile-panel" aria-labelledby="profile-password-title">
          <h2 id="profile-password-title" class="ds-h3">Change password</h2>

          <form
            class="profile-form"
            data-testid="profile-password-form"
            @submit.prevent="changePassword"
          >
            <!-- Hidden, so password managers know which account this password is for -->
            <input
              type="text"
              name="username"
              autocomplete="username"
              :value="auth.user?.email || ''"
              readonly
              hidden
            />
            <div class="profile-field">
              <label for="profile-current" class="profile-label">Current password</label>
              <input
                id="profile-current"
                v-model="currentPassword"
                type="password"
                autocomplete="current-password"
                required
                class="profile-input"
                data-testid="profile-current-password"
              />
            </div>
            <div class="profile-field">
              <label for="profile-new" class="profile-label">New password</label>
              <input
                id="profile-new"
                v-model="newPassword"
                type="password"
                autocomplete="new-password"
                minlength="8"
                maxlength="72"
                required
                aria-describedby="profile-new-help"
                class="profile-input"
                data-testid="profile-new-password"
              />
              <p id="profile-new-help" class="ds-small ds-muted">At least 8 characters.</p>
            </div>
            <div class="profile-field">
              <label for="profile-confirm" class="profile-label">New password again</label>
              <input
                id="profile-confirm"
                v-model="confirmPassword"
                type="password"
                autocomplete="new-password"
                required
                class="profile-input"
                data-testid="profile-confirm-password"
              />
            </div>

            <p
              v-if="passwordError"
              class="profile-message profile-message--error"
              role="alert"
              data-testid="profile-password-error"
            >
              {{ passwordError }}
            </p>
            <p
              v-if="passwordNotice"
              class="profile-message profile-message--done"
              role="status"
              data-testid="profile-password-notice"
            >
              {{ passwordNotice }}
            </p>

            <div class="profile-actions">
              <BaseButton
                type="submit"
                variant="secondary"
                :disabled="isSavingPassword"
                :aria-busy="isSavingPassword"
                data-testid="profile-password-save"
              >
                {{ isSavingPassword ? 'Changing…' : 'Change password' }}
              </BaseButton>
              <NotSentNote
                v-if="passwordNotSent"
                :busy="isSavingPassword"
                @retry="changePassword"
              />
            </div>
          </form>
        </section>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
/* One narrow column, like the report forms: the heading, then two flat
   panels (details, then password) */
.profile-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  /* The wave wallpaper, with its moving trail (TrailBackdrop) */
  background: var(--fi-backdrop);
  isolation: isolate;
}

.profile-main {
  flex: 1 0 auto;
  padding-block: var(--ds-space-6) var(--ds-space-8);
}

.profile-column {
  display: grid;
  gap: var(--ds-space-5);
  max-width: 36rem;
  margin-inline: auto;
}

.profile-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ds-space-5);
  padding: var(--ds-space-5);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-surface);
  background: var(--ds-surface);
}

/* ---- Who you are: round initials, then the name and the facts ---- */
.profile-head {
  display: flex;
  align-items: center;
  gap: var(--ds-space-4);
  min-width: 0;
}

.profile-avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: var(--ds-space-8);
  height: var(--ds-space-8);
  border-radius: var(--ds-radius-round);
  background: var(--ds-action);
  color: var(--ds-on-action);
  font-family: var(--ds-font-display);
  font-size: var(--ds-size-h3);
  font-weight: var(--ds-weight-bold);
  letter-spacing: 0.02em;
}

/* Pushed to the far right; left out on a phone, where the name needs the room */
.profile-lion {
  display: none;
  margin-left: auto;
}

@media (min-width: 576px) {
  .profile-lion {
    display: block;
  }
}

.profile-who {
  display: grid;
  gap: var(--ds-space-1);
  min-width: 0;
}

.profile-name {
  overflow-wrap: anywhere;
}

.profile-facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-1) var(--ds-space-3);
  overflow-wrap: anywhere;
}

/* Break only at the <wbr> before the "@"; each half breaks mid-word only if it
   is wider than the whole line on its own */
.profile-email > span {
  overflow-wrap: break-word;
}

.profile-email {
  overflow-wrap: normal;
}

/* "Student" or "Admin": a small status pill */
.profile-role {
  padding: 0 var(--ds-space-2);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  color: var(--ds-text);
  font-size: var(--ds-size-caption);
  font-weight: var(--ds-weight-medium);
  line-height: var(--ds-leading-small);
}

/* ---- Fields ---- */
.profile-form {
  display: grid;
  gap: var(--ds-space-4);
}

.profile-field {
  display: grid;
  gap: var(--ds-space-2);
  min-width: 0;
}

.profile-label {
  color: var(--ds-text);
  font-size: var(--ds-size-small);
  font-weight: var(--ds-weight-medium);
}

.profile-input {
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

.profile-input:hover {
  border-color: var(--ds-text-muted);
}

.profile-input:focus {
  border-color: var(--ds-action);
}

/* Email alerts: the words on the left, the switch on the right; the whole
   row is the tap target */
.profile-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-4);
  min-height: var(--ds-control-h);
  padding: var(--ds-space-3) 0;
  border-top: 1px solid var(--ds-border);
  cursor: pointer;
}

.profile-switch__words {
  display: grid;
  gap: var(--ds-space-1);
  min-width: 0;
}

/* The track; the knob is drawn with ::before and slides across when on */
.profile-switch__input {
  position: relative;
  flex-shrink: 0;
  width: var(--ds-control-h);
  height: var(--ds-space-5);
  margin: 0;
  border: 1px solid var(--ds-border-control);
  border-radius: var(--ds-radius-round);
  background: var(--ds-surface-sunken);
  cursor: pointer;
  appearance: none;
  transition:
    background-color var(--ds-dur-fast) var(--ds-ease-out),
    border-color var(--ds-dur-fast) var(--ds-ease-out);
}

.profile-switch__input::before {
  content: '';
  position: absolute;
  top: 50%;
  left: var(--ds-space-1);
  width: var(--ds-space-4);
  height: var(--ds-space-4);
  border-radius: var(--ds-radius-round);
  background: var(--ds-text-muted);
  translate: 0 -50%;
  transition:
    translate var(--ds-dur-base) var(--ds-ease-press),
    background-color var(--ds-dur-fast) var(--ds-ease-out);
}

.profile-switch:hover .profile-switch__input {
  border-color: var(--ds-text-muted);
}

.profile-switch__input:checked {
  border-color: var(--ds-action);
  background: var(--ds-action);
}

.profile-switch__input:checked::before {
  background: var(--ds-on-action);
  /* Across the track, less the knob, its two gaps and the 1px border on each side */
  translate: calc(var(--ds-control-h) - var(--ds-space-4) - 2 * var(--ds-space-1) - 2px) -50%;
}

/* ---- Messages, just above the button that caused them ---- */
.profile-message {
  padding: var(--ds-space-3);
  border-radius: var(--ds-radius-control);
  font-weight: var(--ds-weight-medium);
}

.profile-message--error {
  background: color-mix(in srgb, var(--ds-danger) 10%, transparent);
  color: var(--ds-danger);
}

.profile-message--done {
  background: color-mix(in srgb, var(--ds-success) 10%, transparent);
  color: var(--ds-success);
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-3);
  padding-top: var(--ds-space-1);
}

@media (max-width: 575.98px) {
  .profile-panel {
    padding: var(--ds-space-4);
  }

  /* Full-width buttons are easier to reach with a thumb */
  .profile-actions :deep(.fi-button) {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-input,
  .profile-switch__input,
  .profile-switch__input::before {
    transition: none;
  }
}
</style>
