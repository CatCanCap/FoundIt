<script setup>
// Create an account, in the same navy band as sign-in (Figma V01). The design
// has no separate sign-up screen because it assumes SMU single sign-on; this
// page reuses the sign-in look. Only SMU addresses can register, and a new
// account gets a 6-digit code by email. Registering does not sign you in:
// entering that code does. So the page goes on to /verify-email with the
// address (?email=), carrying ?redirect= along, so the page that asked for
// sign-in opens once the code is in. The email and password are checked as
// soon as you leave each field, with the same rules as the server. The
// password is typed twice so a typo can't lock the new account out.
//
// The rules show rather than being spelt out: the email box offers the rest
// of an SMU address and ticks a whole one, and the password has one dot per
// character it needs, all turning green once it is long enough. The latest
// finds tick by under the headline, and the lion reacts as on sign-in
// (useAuthMood).
import { computed, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import JustFoundTicker from '@/components/auth/JustFoundTicker.vue'
import PasswordField from '@/components/auth/PasswordField.vue'
import SmuEmailField from '@/components/auth/SmuEmailField.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import TextField from '@/components/ui/TextField.vue'
import { useAuthMood } from '@/composables/useAuthMood'
import {
  MIN_PASSWORD,
  confirmProblem,
  emailProblem,
  passwordProblem,
  redirectQuery,
} from '@/utils/sign-in'
import { errorText, isConnectionError, mayHaveSent } from '@/utils/safeguards'
import '@/assets/auth-form.css'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// The page someone was on their way to, passed on to /verify-email and "Sign in"
const onward = computed(() => redirectQuery(route.query.redirect))

const name = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const errorMessage = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the form keeps its words
const notSent = ref(false)
// The last try got no answer in time, so the account may have been made
const maybeSent = ref(false)
const isSubmitting = ref(false)
const { mood, shake, swapKey, focus, blur, reveal, oops, cheer } = useAuthMood()

// Checked when you leave a field, then again on every change once shown
const emailError = ref('')
const passwordError = ref('')
const confirmError = ref('')

function checkEmail() {
  emailError.value = emailProblem(email.value)
}

function checkPassword() {
  passwordError.value = passwordProblem(password.value)
  // Changing the first box can fix (or break) a match already shown
  if (confirmError.value) checkConfirm()
}

function checkConfirm() {
  confirmError.value = confirmProblem(password.value, confirm.value)
}

async function submit() {
  errorMessage.value = ''
  const triedBefore = maybeSent.value
  notSent.value = false
  maybeSent.value = false
  checkEmail()
  checkPassword()
  checkConfirm()
  if (emailError.value || passwordError.value || confirmError.value) {
    oops()
    return
  }
  isSubmitting.value = true
  try {
    const sentTo = await auth.register(name.value, email.value, password.value)
    await cheer()
    // Straight to the 6-digit code, which signs the new account in
    router.push({ path: '/verify-email', query: { email: sentTo, ...onward.value } })
  } catch (error) {
    if (isConnectionError(error)) {
      notSent.value = true
      maybeSent.value = mayHaveSent(error)
      return
    }
    // The first try made the account but its answer came too late: go on to
    // the code, which the first try emailed
    if (triedBefore && error.response?.status === 409) {
      auth.pendingPassword = password.value
      router.push({ path: '/verify-email', query: { email: email.value.trim(), ...onward.value } })
      return
    }
    errorMessage.value = errorText(error)
    oops()
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthLayout stamp="New tag" :mood="mood" :swap-key="swapKey">
    <template #headline>
      <span class="fi-auth-line">Lost it?</span> It’s probably been
      <em class="fi-accent">found.</em>
    </template>
    <template #aside><JustFoundTicker /></template>

    <h2 class="fi-auth-form__title">Get your FoundIt account.</h2>

    <p v-if="errorMessage" class="fi-auth-form__error" role="alert" data-testid="register-error">
      {{ errorMessage }}
    </p>

    <form
      class="fi-auth-form"
      :class="{ 'fi-auth-form--shake': shake }"
      data-testid="register-form"
      @submit.prevent="submit"
    >
      <TextField
        v-model="name"
        label="Name"
        type="text"
        autocomplete="name"
        maxlength="100"
        required
        data-testid="register-name"
        @focus="focus('name')"
        @blur="blur"
      />
      <SmuEmailField
        v-model="email"
        autocomplete="email"
        placeholder="you@smu.edu.sg"
        :error="emailError"
        required
        data-testid="register-email"
        @focus="focus('email')"
        @blur="(blur(), checkEmail())"
        @input="emailError && checkEmail()"
        @pick="emailError && checkEmail()"
      />
      <PasswordField
        v-model="password"
        label="Password"
        autocomplete="new-password"
        :minlength="MIN_PASSWORD"
        maxlength="72"
        :meter="MIN_PASSWORD"
        :error="passwordError"
        required
        data-testid="register-password"
        @focus="focus('password')"
        @blur="(blur(), checkPassword())"
        @input="(passwordError || confirmError) && checkPassword()"
        @reveal="reveal"
      />
      <PasswordField
        v-model="confirm"
        label="Confirm password"
        autocomplete="new-password"
        maxlength="72"
        :error="confirmError"
        required
        data-testid="register-confirm"
        @focus="focus('password')"
        @blur="(blur(), checkConfirm())"
        @input="confirmError && checkConfirm()"
        @reveal="reveal"
      />
      <BaseButton type="submit" block :disabled="isSubmitting" data-testid="register-submit">
        {{ isSubmitting ? 'Creating account…' : 'Create account' }}
      </BaseButton>
      <NotSentNote v-if="notSent" :busy="isSubmitting" :maybe-sent="maybeSent" @retry="submit" />
    </form>

    <p class="fi-auth-form__switch">
      Already have an account?
      <RouterLink :to="{ path: '/login', query: onward }" data-testid="go-login"
        >Sign in</RouterLink
      >
    </p>
  </AuthLayout>
</template>
