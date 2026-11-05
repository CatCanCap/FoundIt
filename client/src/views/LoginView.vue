<script setup>
// Sign in (Figma V01). One form for everyone: students and admins type the same
// SMU email and password, and the account itself says which one it is. The
// design's "Continue with SMU account" button assumes SMU single sign-on;
// FoundIt has its own login (server/controllers/auth-controller.js), so the tag holds the SMU
// email and password instead. Students land on the feed and admins on the
// Admin page, unless the sign-in was asked for by a page they were trying to
// open: then a line says why ("Sign in to see your matches.") and the page
// opens after signing in, or after registering and entering the email code.
// An account that never entered its email code cannot sign in yet (the server
// answers 403), so it is sent to /verify-email to finish signing up.
//
// The page shows rather than explains: the latest finds tick by under the
// headline, the email box offers the rest of an SMU address and ticks a whole
// one, and the lion perks up, ducks while a hidden password is typed, shakes
// its head with the form at a wrong password and hops as you go in
// (useAuthMood). It shuts its eyes while the password is shown, so it never
// peeks.
import { computed, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AuthLayout from '@/components/auth/AuthLayout.vue'
import JustFoundTicker from '@/components/auth/JustFoundTicker.vue'
import PasswordField from '@/components/auth/PasswordField.vue'
import SmuEmailField from '@/components/auth/SmuEmailField.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import NotSentNote from '@/components/ui/NotSentNote.vue'
import { useAuthMood } from '@/composables/useAuthMood'
import { redirectQuery, redirectReason } from '@/utils/sign-in'
import { errorText, isConnectionError } from '@/utils/safeguards'
import '@/assets/auth-form.css'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
// No answer from FoundIt: "Not sent" beside the button, and the form keeps its words
const notSent = ref(false)
const isSubmitting = ref(false)
const { mood, eyes, shake, swapKey, focus, blur, reveal, oops, cheer } = useAuthMood()

const reason = computed(() => redirectReason(route.query.redirect))
// Passed on to "Create an account", so a new account ends up there too
const onward = computed(() => redirectQuery(route.query.redirect))

async function submit() {
  errorMessage.value = ''
  notSent.value = false
  isSubmitting.value = true
  try {
    await auth.login(email.value, password.value)
    await cheer()
    // Only follow redirects to other pages inside this app; "/" is just home,
    // so it goes to the usual landing page too
    const fallback = auth.isAdmin ? '/admin' : '/feed'
    router.push(onward.value.redirect || fallback)
  } catch (error) {
    if (error.response?.status === 403) {
      // The right password, but the account still needs its email code
      router.push({
        path: '/verify-email',
        query: { email: email.value.trim(), from: 'sign-in', ...onward.value },
      })
      return
    }
    if (isConnectionError(error)) {
      notSent.value = true
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
  <AuthLayout stamp="Received LKS Lib" :mood="mood" :eyes="eyes" :swap-key="swapKey">
    <template #headline>
      <span class="fi-auth-line">Lost it?</span> It’s probably been
      <em class="fi-accent">found.</em>
    </template>
    <template #aside><JustFoundTicker /></template>

    <div class="fi-auth-form__head">
      <h2 class="fi-auth-form__title">Sign in to see what’s turned up.</h2>
    </div>

    <p v-if="reason" class="fi-auth-form__reason" role="status" data-testid="login-reason">
      {{ reason }}
    </p>

    <p v-if="errorMessage" class="fi-auth-form__error" role="alert" data-testid="login-error">
      {{ errorMessage }}
    </p>

    <form
      class="fi-auth-form"
      :class="{ 'fi-auth-form--shake': shake }"
      data-testid="login-form"
      @submit.prevent="submit"
    >
      <SmuEmailField
        v-model="email"
        autocomplete="email"
        placeholder="you@smu.edu.sg"
        required
        data-testid="login-email"
        @focus="focus('email')"
        @blur="blur"
      />
      <PasswordField
        v-model="password"
        label="Password"
        autocomplete="current-password"
        required
        data-testid="login-password"
        @focus="focus('password')"
        @blur="blur"
        @reveal="reveal"
      />
      <BaseButton type="submit" block :disabled="isSubmitting" data-testid="login-submit">
        {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
      </BaseButton>
      <NotSentNote v-if="notSent" :busy="isSubmitting" @retry="submit" />
    </form>

    <p class="fi-auth-form__note" data-testid="login-note">
      <BaseButton variant="link" size="sm" to="/forgot-password" data-testid="go-forgot-password"
        >Forgot password?</BaseButton
      >
    </p>
    <p class="fi-auth-form__switch">
      New here?
      <RouterLink :to="{ path: '/register', query: onward }" data-testid="go-register"
        >Create an account</RouterLink
      >
    </p>
  </AuthLayout>
</template>
