// How the sign-in and register pages react to you (WS3): the lion's mood (see
// AuthLayout), the form's shake after a wrong answer, and the tag's swing when
// you're in.
//   mood      'idle', 'watching' while a box has focus, 'shy' while you type a
//             hidden password, and 'oops' or 'cheer' for a moment
//   eyes      'open', or 'closed' while the password is shown, so the lion
//             never peeks (AuthLayout's eyes)
//   shake     true while the form shakes
//   swapKey   changes to swing the tag (AuthLayout's swapKey)
//   focus(field), blur(), reveal(shown)   wire these to the fields
//   oops()    after a wrong answer
//   cheer()   when you're in; resolves once the hop has been seen, at once
//             for people who ask for less motion
import { computed, onBeforeUnmount, ref } from 'vue'

const FLASH_MS = 600
const CHEER_MS = 450
// Long enough for the browser to drop a class before it is put back, so the
// same animation plays again
const RESTART_MS = 30

export function useAuthMood() {
  const focused = ref('')
  const revealed = ref(false)
  const flash = ref('')
  const shake = ref(false)
  const swapKey = ref('')
  const timers = new Set()

  const mood = computed(() => {
    if (flash.value) return flash.value
    if (focused.value === 'password') return revealed.value ? 'watching' : 'shy'
    return focused.value ? 'watching' : 'idle'
  })
  const eyes = computed(() => (revealed.value ? 'closed' : 'open'))

  function later(ms, run) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      run()
    }, ms)
    timers.add(timer)
  }

  function briefly(what) {
    flash.value = ''
    later(RESTART_MS, () => {
      flash.value = what
      later(FLASH_MS, () => {
        if (flash.value === what) flash.value = ''
      })
    })
  }

  function focus(field) {
    focused.value = field
  }

  function blur() {
    focused.value = ''
  }

  function reveal(shown) {
    revealed.value = shown
  }

  function oops() {
    briefly('oops')
    shake.value = false
    later(RESTART_MS, () => {
      shake.value = true
      later(FLASH_MS, () => (shake.value = false))
    })
  }

  function cheer() {
    focused.value = ''
    briefly('cheer')
    swapKey.value = String(Date.now())
    const still = !window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches
    return still ? Promise.resolve() : new Promise((resolve) => later(CHEER_MS, resolve))
  }

  onBeforeUnmount(() => timers.forEach((timer) => clearTimeout(timer)))

  return { mood, eyes, shake, swapKey, focus, blur, reveal, oops, cheer }
}
