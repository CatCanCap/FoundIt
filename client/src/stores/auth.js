import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import api, { TOKEN_KEY } from '../api'
import { forgetPlaces } from '../utils/last-places'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem(TOKEN_KEY))
  // Whether the email with the 6-digit code went out: true or false after
  // registering or asking for a new code, null when this visit has not sent one
  const codeSent = ref(null)
  // The password just typed on the register or sign-in page, kept in memory
  // only (never saved), so the code page can send it with the code without
  // asking again. Gone after a reload, when the code page asks for it.
  const pendingPassword = ref('')

  const isLoggedIn = computed(() => token.value !== null)
  // A new account must enter the code emailed to its SMU address before it
  // can post, claim or chat. Admins get the Admin page.
  const isVerified = computed(() => Boolean(user.value && user.value.emailVerifiedAt))
  const isAdmin = computed(() => Boolean(user.value && user.value.role === 'admin'))
  const isSuspended = computed(() => Boolean(user.value && user.value.suspendedAt))

  function setSession(data) {
    token.value = data.token
    user.value = data.user
    localStorage.setItem(TOKEN_KEY, data.token)
  }

  // Students and admins use the same form; the account decides which pages
  // they get. The right password on an account that has not entered its
  // emailed code yet rejects with 403 (the sign-in page sends them to
  // /verify-email); a wrong email or password rejects with 401.
  async function login(email, password) {
    try {
      const response = await api.post('/auth/login', { email, password })
      setSession(response.data)
    } catch (error) {
      if (error.response?.status === 403) pendingPassword.value = password
      throw error
    }
  }

  // Makes the account but does NOT sign in: the person stays logged out until
  // they enter the 6-digit code emailed to them (verifyEmail below). Resolves
  // to the address the code went to. codeSent says whether the email went out
  // (false: the account was made but the email failed, so they can ask for a
  // new code).
  async function register(name, email, password) {
    const response = await api.post('/auth/register', { name, email, password })
    codeSent.value = response.data.verificationSent !== false
    pendingPassword.value = password
    return response.data.email || email.trim()
  }

  // The code from the email, with the account's password. No login needed:
  // the server answers like login, with a token and the now verified user, so
  // this signs the person in. The password is needed too, so a code alone
  // cannot finish an account someone else made with your email. password
  // defaults to the one kept from the register or sign-in page.
  // Rejects with the API error (400) for a wrong code or password.
  async function verifyEmail(email, code, password = pendingPassword.value) {
    const response = await api.post('/auth/verify-email', { email, code, password })
    setSession(response.data)
    codeSent.value = null
    pendingPassword.value = ''
  }

  // Emails a new code. The server gives the same answer whether or not the
  // address has an account waiting for its code, so this resolves to the
  // server's message for the page to show.
  async function resendCode(email) {
    const response = await api.post('/auth/resend-code', { email })
    codeSent.value = null
    return response.data.message
  }

  // Forgot password, step 1: emails a 6-digit code if the email has an
  // account. The server answers the same either way, so this only tells the
  // page the request went through.
  async function forgotPassword(email) {
    await api.post('/auth/forgot-password', { email })
  }

  // Step 2: the code from the email and a new password. Logs the person in,
  // like login; rejects with the API error (400) for a wrong or expired code.
  async function resetPassword(email, code, password) {
    const response = await api.post('/auth/reset-password', { email, code, password })
    setSession(response.data)
  }

  // The Profile page: a new name and/or alertsOn. Resolves to nothing; the
  // store's user is replaced with the saved one.
  async function updateProfile(fields) {
    const response = await api.patch('/auth/me', fields)
    user.value = response.data
  }

  // The Profile page. A wrong current password rejects with the API error
  // (400). The server signs out every other session, so this one keeps going
  // with the new token it sends back.
  async function changePassword(currentPassword, newPassword) {
    const response = await api.post('/auth/change-password', { currentPassword, newPassword })
    setSession(response.data)
  }

  function logout() {
    token.value = null
    user.value = null
    codeSent.value = null
    pendingPassword.value = ''
    localStorage.removeItem(TOKEN_KEY)
    forgetPlaces()
  }

  // Call once when the app starts, to restore the user after a page refresh
  async function loadUser() {
    if (!token.value) return
    try {
      const response = await api.get('/auth/me')
      user.value = response.data
    } catch (error) {
      // Only a rejected token logs the user out; a network problem does not
      if (error.response && error.response.status === 401) {
        logout()
      }
    }
  }

  return {
    user,
    token,
    codeSent,
    pendingPassword,
    isLoggedIn,
    isVerified,
    isAdmin,
    isSuspended,
    login,
    register,
    verifyEmail,
    resendCode,
    forgotPassword,
    resetPassword,
    updateProfile,
    changePassword,
    logout,
    loadUser,
  }
})
