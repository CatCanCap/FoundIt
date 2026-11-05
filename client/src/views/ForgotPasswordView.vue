<script setup>
// Forgot password, in the same navy band as sign-in (Figma V01). The Figma file
// has no forgot-password screen, so this page reuses the sign-in look and its
// parts (AuthLayout, TextField, BaseButton, auth-form.css).
//
// Two steps on one page:
//   1. the SMU email; the server emails a 6-digit code if it has an account
//   2. the code and a new password; a right code logs the person in
// The server answers step 1 the same way whether or not the email has an
// account, so this page never says which; nor does a wrong code in step 2.
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import TextField from '@/components/ui/TextField.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import { errorText, isConnectionError } from '@/utils/safeguards'
import '@/assets/auth-form.css'

const auth = useAuthStore()
const router = useRouter()

const step = ref('email') // 'email', then 'code'
const email = ref('')
const sentTo = ref('')
const code = ref('')
const password = ref('')
const confirm = ref('')
const errorMessage = ref('')
const notice = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the form keeps its words
const notSent = ref(false)
const isSubmitting = ref(false)
const isResending = ref(false)

// The server's own words, or the "Not sent" line when nothing came back
function showFailure(error) {
  if (isConnectionError(error)) notSent.value = true
  else errorMessage.value = errorText(error)
}

async function sendCode() {
  errorMessage.value = ''
  notSent.value = false
  isSubmitting.value = true
  try {
    const address = email.value.trim()
    await auth.forgotPassword(address)
    email.value = address
    sentTo.value = address
    step.value = 'code'
  } catch (error) {
    showFailure(error)
  } finally {
    isSubmitting.value = false
  }
}

async function resend() {
  errorMessage.value = ''
  notice.value = ''
  isResending.value = true
  try {
    await auth.forgotPassword(sentTo.value)
    code.value = ''
    notice.value =
      'If an account exists for that email, a new code is on its way. We send at most one a minute.'
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    isResending.value = false
  }
}

async function savePassword() {
  errorMessage.value = ''
  notice.value = ''
  notSent.value = false
  if (password.value !== confirm.value) {
    errorMessage.value = 'The two passwords don’t match.'
    return
  }
  isSubmitting.value = true
  try {
    await auth.resetPassword(sentTo.value, code.value.trim(), password.value)
    // Signed in with the new password: the same landing pages as sign-in
    router.push(auth.isAdmin ? '/admin' : '/feed')
  } catch (error) {
    showFailure(error)
  } finally {
    isSubmitting.value = false
  }
}

function useDifferentEmail() {
  step.value = 'email'
  code.value = ''
  password.value = ''
  confirm.value = ''
  errorMessage.value = ''
  notice.value = ''
  notSent.value = false
}
</script>

<template>
  <AuthLayout stamp="Reissued" :swap-key="step">
    <template #headline>
      <span class="fi-auth-line">Forgot it?</span> Passwords get <em class="fi-accent">lost</em>
      too.
    </template>
    <template #lede>
      We’ll email a 6-digit code to your SMU address so you can choose a new password.
    </template>

    <template v-if="step === 'email'">
      <h2 class="fi-auth-form__title">Reset your password.</h2>

      <p v-if="errorMessage" class="fi-auth-form__error" role="alert" data-testid="forgot-error">
        {{ errorMessage }}
      </p>

      <form class="fi-auth-form" data-testid="forgot-form" @submit.prevent="sendCode">
        <TextField
          v-model="email"
          label="SMU email"
          type="email"
          autocomplete="email"
          help="The address you signed up with. We’ll email it a 6-digit code."
          required
          data-testid="forgot-email"
        />
        <BaseButton type="submit" block :disabled="isSubmitting" data-testid="forgot-submit">
          {{ isSubmitting ? 'Sending…' : 'Email me a code' }}
        </BaseButton>
        <NotSentNote v-if="notSent" :busy="isSubmitting" @retry="sendCode" />
      </form>
    </template>

    <template v-else>
      <div class="fi-auth-form__head">
        <h2 class="fi-auth-form__title fi-auth-form__title--short">Check your SMU email.</h2>
        <p class="fi-auth-form__sub" data-testid="reset-sent-to">
          If an account exists for <strong>{{ sentTo }}</strong
          >, we’ve sent it a 6-digit code. It works for 15 minutes.
        </p>
      </div>

      <p v-if="errorMessage" class="fi-auth-form__error" role="alert" data-testid="reset-error">
        {{ errorMessage }}
      </p>

      <form class="fi-auth-form" data-testid="reset-form" @submit.prevent="savePassword">
        <TextField
          v-model="code"
          label="6-digit code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="\s*\d{6}\s*"
          maxlength="8"
          required
          data-testid="reset-code"
        />
        <TextField
          v-model="password"
          label="New password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          help="At least 8 characters."
          required
          data-testid="reset-password"
        />
        <TextField
          v-model="confirm"
          label="New password again"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          required
          data-testid="reset-confirm"
        />
        <BaseButton type="submit" block :disabled="isSubmitting" data-testid="reset-submit">
          {{ isSubmitting ? 'Saving…' : 'Save new password' }}
        </BaseButton>
        <NotSentNote v-if="notSent" :busy="isSubmitting" @retry="savePassword" />
      </form>

      <p class="fi-auth-form__note">
        No email? Check your junk folder, or
        <BaseButton
          variant="link"
          size="sm"
          :disabled="isResending"
          data-testid="reset-resend"
          @click="resend"
          >send a new code</BaseButton
        >. After 5 wrong codes, wait 30 minutes before asking for another.
      </p>
      <p v-if="notice" class="fi-auth-form__note" role="status" data-testid="reset-notice">
        {{ notice }}
      </p>
      <p class="fi-auth-form__note">
        Wrong address?
        <BaseButton
          variant="link"
          size="sm"
          data-testid="reset-change-email"
          @click="useDifferentEmail"
          >Use a different email</BaseButton
        >
      </p>
    </template>

    <p class="fi-auth-form__switch">
      Remembered it?
      <RouterLink to="/login" data-testid="go-login">Sign in</RouterLink>
    </p>
  </AuthLayout>
</template>
