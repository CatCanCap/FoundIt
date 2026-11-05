<script setup>
// "Check your SMU email": the last step of making an account. Registering does
// not sign you in; entering the 6-digit code emailed to you does. So this page
// is open to anyone (no login needed). The address comes from ?email= (set by
// the register and sign-in pages), else from an older account that is signed
// in but never entered its code, else the person types it. It sits in the same
// navy band as sign-in, register and forgot password (AuthLayout, WS3), whose
// top bar links to the feed.
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import TextField from '@/components/ui/TextField.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import PasswordField from '@/components/auth/PasswordField.vue'
import { useAuthStore } from '@/stores/auth'
import { errorText, isConnectionError, mayHaveSent, safeRedirect } from '@/utils/safeguards'
import { emailProblem, redirectQuery } from '@/utils/sign-in'
import '@/assets/auth-form.css'

// After a new code is sent, the button rests this long, so one impatient
// person does not fill their inbox (the server has its own limit too)
const RESEND_PAUSE_MS = 30000

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const queryEmail = typeof route.query.email === 'string' ? route.query.email.trim() : ''
const email = ref(queryEmail || auth.user?.email || '')
// The address is shown as text when we already know it; "Not your email?"
// turns it back into a field
const isEditingEmail = ref(!email.value)
const emailError = ref('')

const code = ref('')
// Asked for only when the register or sign-in page did not just pass it on
// (after a reload, or a typed-in address)
const password = ref('')
const needsPassword = computed(() => !auth.pendingPassword)
const errorMessage = ref('')
const notice = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the form keeps its words
const notSent = ref(false)
// The last try got no answer in time, so the code may already have been accepted
const maybeSent = ref(false)
const isSubmitting = ref(false)
const isResending = ref(false)
const isResting = ref(false)
let restTimer = null

// The email did not go out when they registered
const emailFailed = computed(() => auth.codeSent === false)
// Sent here by the sign-in page: the password was right, but the account
// still needs its code
const fromSignIn = computed(() => route.query.from === 'sign-in')
// Passed on to "Sign in", so the page they wanted still opens afterwards
const onward = computed(() => redirectQuery(route.query.redirect))

function checkEmail() {
  emailError.value = email.value.trim() ? emailProblem(email.value) : 'Enter your SMU email.'
  return !emailError.value
}

function changeEmail() {
  isEditingEmail.value = true
  notice.value = ''
  // The kept password belongs to the address they are changing away from
  auth.pendingPassword = ''
}

// On to the page they wanted, never to another site or round to here.
// "/" is just home, so it goes to the usual landing page too.
function goOn() {
  const wanted = safeRedirect(route.query.redirect, '', '/verify-email')
  const fallback = auth.isAdmin ? '/admin' : '/feed'
  router.push(wanted && wanted !== '/' ? wanted : fallback)
}

async function submit() {
  errorMessage.value = ''
  notice.value = ''
  const triedBefore = maybeSent.value
  notSent.value = false
  maybeSent.value = false
  if (!checkEmail()) return
  isSubmitting.value = true
  const accountPassword = needsPassword.value ? password.value : auth.pendingPassword
  try {
    // A right code and password sign the person in (the store saves the session)
    await auth.verifyEmail(email.value.trim(), code.value.trim(), accountPassword)
    goOn()
  } catch (error) {
    if (isConnectionError(error)) {
      notSent.value = true
      maybeSent.value = mayHaveSent(error)
    } else if (triedBefore && error.response?.status === 400 && accountPassword) {
      // The first try was accepted, so this code is used up: sign in instead
      const signedIn = await auth
        .login(email.value.trim(), accountPassword)
        .then(() => true)
        .catch(() => false)
      if (signedIn) goOn()
      else errorMessage.value = errorText(error)
    } else errorMessage.value = errorText(error)
  } finally {
    isSubmitting.value = false
  }
}

async function resend() {
  errorMessage.value = ''
  notice.value = ''
  if (!checkEmail()) return
  isResending.value = true
  try {
    const message = await auth.resendCode(email.value.trim())
    code.value = ''
    notice.value = message || 'If that email is waiting for its code, we sent a new one.'
    isResting.value = true
    restTimer = setTimeout(() => (isResting.value = false), RESEND_PAUSE_MS)
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    isResending.value = false
  }
}

onBeforeUnmount(() => clearTimeout(restTimer))

// Only for an older account that is signed in without having entered its code
function logOut() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <AuthLayout stamp="Almost">
    <template #headline>
      <span class="fi-auth-line">One last step.</span> Check your
      <em class="fi-accent">SMU email</em>.
    </template>
    <template #lede>
      Enter the code to finish making your account. Until then you can browse what has been found,
      but not report, claim or chat.
    </template>

    <template v-if="auth.isVerified">
      <h2 class="fi-auth-form__title">You're verified.</h2>
      <p class="fi-auth-form__sub mb-3" role="status" data-testid="verify-done">
        Your email is verified.
      </p>
      <BaseButton to="/" block>Go to FoundIt</BaseButton>
    </template>

    <template v-else>
      <div class="fi-auth-form__head">
        <h2 class="fi-auth-form__title fi-auth-form__title--short">Enter your code.</h2>
        <p v-if="isEditingEmail" class="fi-auth-form__sub">
          Enter your SMU email and the 6-digit code we emailed to it.
        </p>
        <p v-else-if="emailFailed" class="fi-auth-form__sub" data-testid="verify-email-failed">
          Your account is ready, but we could not email the code to
          <strong class="verify-address" data-testid="verify-email-address">{{ email }}</strong
          >. Press "send a new code" below to try again.
        </p>
        <p v-else-if="auth.codeSent" class="fi-auth-form__sub">
          We emailed a 6-digit code to
          <strong class="verify-address" data-testid="verify-email-address">{{ email }}</strong
          >. It works for 15 minutes.
        </p>
        <p v-else class="fi-auth-form__sub">
          Enter the 6-digit code we emailed to
          <strong class="verify-address" data-testid="verify-email-address">{{ email }}</strong
          >. If it has expired, send a new one below.
        </p>
      </div>

      <p v-if="fromSignIn" class="fi-auth-form__reason" role="status" data-testid="verify-reason">
        You haven't finished signing up yet. Enter the code we emailed you to sign in.
      </p>

      <p v-if="errorMessage" class="fi-auth-form__error" role="alert" data-testid="verify-error">
        {{ errorMessage }}
      </p>

      <form class="fi-auth-form" data-testid="verify-form" @submit.prevent="submit">
        <TextField
          v-if="isEditingEmail"
          v-model="email"
          label="SMU email"
          type="email"
          autocomplete="email"
          :error="emailError"
          required
          data-testid="verify-email-input"
          @blur="email && checkEmail()"
          @input="emailError && checkEmail()"
        />
        <TextField
          v-model="code"
          label="6-digit code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="\s*\d{6}\s*"
          maxlength="8"
          required
          data-testid="verify-code"
        />
        <PasswordField
          v-if="needsPassword"
          v-model="password"
          label="Your FoundIt password"
          help="The one you chose when you signed up."
          autocomplete="current-password"
          required
          data-testid="verify-password"
        />
        <BaseButton type="submit" block :disabled="isSubmitting" data-testid="verify-submit">
          {{ isSubmitting ? 'Checking…' : 'Verify email' }}
        </BaseButton>
        <NotSentNote v-if="notSent" :busy="isSubmitting" :maybe-sent="maybeSent" @retry="submit" />
      </form>

      <p class="fi-auth-form__note">
        No email? Check your junk folder, or
        <BaseButton
          variant="link"
          size="sm"
          :disabled="isResending || isResting"
          data-testid="verify-resend"
          @click="resend"
          >{{ isResending ? 'sending…' : 'send a new code' }}</BaseButton
        >.
        <template v-if="!isEditingEmail">
          Not your email?
          <BaseButton
            variant="link"
            size="sm"
            data-testid="verify-email-change"
            @click="changeEmail"
            >Change it</BaseButton
          >
        </template>
      </p>
      <p v-if="notice" class="fi-auth-form__note" role="status" data-testid="verify-notice">
        {{ notice }}
      </p>
      <p class="fi-auth-form__switch">
        <BaseButton to="/feed" variant="link" size="sm" data-testid="verify-browse"
          >Browse finds for now</BaseButton
        >
        <template v-if="auth.isLoggedIn">
          · Wrong account?
          <BaseButton variant="link" size="sm" data-testid="verify-logout" @click="logOut"
            >Log out</BaseButton
          >
        </template>
        <template v-else>
          · Already verified?
          <BaseButton
            :to="{ path: '/login', query: onward }"
            variant="link"
            size="sm"
            data-testid="verify-go-login"
            >Sign in</BaseButton
          >
        </template>
      </p>
    </template>
  </AuthLayout>
</template>

<style scoped>
/* A long SMU address (e.g. a.name.2025@economics.smu.edu.sg) wraps instead of
   pushing the page wider than a phone */
.verify-address {
  overflow-wrap: anywhere;
}
</style>
