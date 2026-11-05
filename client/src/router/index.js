import { createRouter, createWebHistory } from 'vue-router'

import LandingView from '../views/LandingView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import { useAuthStore } from '../stores/auth'
import { checkRoute, pageTitle } from './guard'
import { PAGE_FADE_OUT_MS } from '../utils/design'
import { morphing } from '../utils/item-morph'
import { rememberPlace } from '../utils/last-places'

// A new page starts at the top, once the old one has faded out (see
// components/ui/PageTransition.vue); Back and Forward return to where you were.
// A change of query alone (the feed's filters) keeps the scroll. A picture
// growing into its page has no fade to wait for.

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (to.path === from.path) return false
    if (morphing.value) return { top: 0 }
    return new Promise((resolve) => {
      setTimeout(() => resolve(savedPosition || { top: 0 }), PAGE_FADE_OUT_MS)
    })
  },
  routes: [
    // Home is the landing page for visitors; anyone signed in goes on to the
    // feed, or the Admin page for an admin (signedOutOnly, router/guard.js).
    // Add meta: { requiresAuth: true } to any page that needs a logged-in
    // user, and a title for the browser tab.
    {
      path: '/',
      component: LandingView,
      meta: { signedOutOnly: true },
    },
    // authBand: these sit on the navy sign-in band, so the page behind them is
    // navy too while they fade (components/ui/PageTransition.vue)
    {
      path: '/login',
      component: LoginView,
      meta: { title: 'Sign in', authBand: true },
    },
    {
      path: '/register',
      component: RegisterView,
      meta: { title: 'Create an account', authBand: true },
    },
    // Forgot password: email a 6-digit code, then choose a new password. Open
    // to anyone, like /login
    {
      path: '/forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: { title: 'Forgot password', authBand: true },
    },
    // WS3: the finds that might be your lost items (Figma section 06)
    {
      path: '/matches',
      component: () => import('../views/MatchesView.vue'),
      meta: { title: 'Matches', requiresAuth: true, studentOnly: true },
    },
    // WS3: the finds for one of your lost reports, linked from Matches
    {
      path: '/matches/finds/:reportId',
      component: () => import('../views/MatchFindsView.vue'),
      meta: { title: 'Possible finds', requiresAuth: true, studentOnly: true },
    },
    // WS5: claim a find, the handoff chat and "back with its owner" (Figma
    // sections 07 and 08). The match emails link to /matches/:id.
    {
      path: '/matches/:id/claim',
      component: () => import('../views/ClaimView.vue'),
      meta: { title: 'Claim', requiresAuth: true, studentOnly: true },
    },
    {
      path: '/matches/:id/handoff',
      component: () => import('../views/HandoffView.vue'),
      meta: { title: 'Handoff', requiresAuth: true, studentOnly: true },
    },
    {
      path: '/matches/:id',
      component: () => import('../views/HandoffView.vue'),
      meta: { title: 'Handoff', requiresAuth: true, studentOnly: true },
    },
    {
      path: '/matches/:id/resolved',
      component: () => import('../views/ReturnedView.vue'),
      meta: { title: 'Returned', requiresAuth: true, studentOnly: true },
    },
    // WS4: My reports was removed (Matches lists your lost reports and Returns
    // the things you found), so an old link lands on Matches
    { path: '/my-reports', redirect: '/matches' },
    // WS5: Returns, your claims and chats and the things you found. The old
    // /handoffs address still works and lands here.
    {
      path: '/returns',
      component: () => import('../views/ReturnsView.vue'),
      meta: { title: 'Returns', requiresAuth: true, studentOnly: true },
    },
    {
      path: '/handoffs',
      redirect: (to) => ({ path: '/returns', query: to.query }),
    },
    // studentOnly pages (Feed, Matches, Map, Report, My disputes) send an admin
    // to /admin instead.
    // Report: "What happened?" (WS4's chooser), then the two-step found report
    // (WS2) or the lost report with its trail (WS4)
    {
      path: '/report',
      component: () => import('../views/ReportChooseView.vue'),
      meta: { title: 'Report', requiresAuth: true, studentOnly: true },
    },
    {
      // Figma M05 and M06
      path: '/report/found',
      component: () => import('../views/FoundReportView.vue'),
      meta: { title: 'Report a found item', requiresAuth: true, studentOnly: true },
    },
    {
      path: '/report/lost',
      component: () => import('../views/LostReportView.vue'),
      meta: { title: 'Report a lost item', requiresAuth: true, studentOnly: true },
    },
    // WS4: the campus map with the hotspots
    {
      path: '/map',
      component: () => import('../views/MapView.vue'),
      meta: { title: 'Map', studentOnly: true },
    },
    // Feature 5, admin and safeguards (WS1). The verification email's button
    // links to /verify-email.
    {
      // Anyone can browse without logging in. Admins only get the Admin page,
      // so they (and their logo link to /) land there instead
      path: '/feed',
      component: () => import('../views/FeedView.vue'),
      meta: { title: 'Feed', studentOnly: true },
    },
    {
      // Open to anyone, like /login: a new account stays logged out until it
      // enters the emailed code, and entering it is what signs them in
      path: '/verify-email',
      component: () => import('../views/VerifyEmailView.vue'),
      meta: { title: 'Verify your email', authBand: true },
    },
    {
      // WS5: the item page every feed card opens (Figma section 08)
      path: '/items/:id/record',
      component: () => import('../views/ItemPageView.vue'),
      meta: { title: 'Item' },
    },
    {
      path: '/items/:id/dispute',
      component: () => import('../views/DisputeFormView.vue'),
      meta: { title: 'This is my item', requiresAuth: true },
    },
    // Your account: name, email alerts and password. From the account menu,
    // for students and admins
    {
      path: '/profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { title: 'Profile', requiresAuth: true },
    },
    {
      path: '/disputes',
      component: () => import('../views/MyDisputesView.vue'),
      meta: { title: 'My disputes', requiresAuth: true, studentOnly: true },
    },
    {
      // A suspended student's appeal (feature 5); the suspended banner links here
      path: '/appeal',
      component: () => import('../views/AppealView.vue'),
      meta: { title: 'Appeal', requiresAuth: true, studentOnly: true },
    },
    {
      path: '/admin',
      component: () => import('../views/AdminView.vue'),
      meta: { title: 'Admin', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/disputes/:id',
      component: () => import('../views/AdminDisputeView.vue'),
      meta: { title: 'Dispute', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/reports/:id',
      component: () => import('../views/AdminReportView.vue'),
      meta: { title: 'Reported post', requiresAuth: true, requiresAdmin: true },
    },
    // A student who opens an admin page lands here (router/guard.js)
    {
      path: '/admins-only',
      component: NotFoundView,
      props: { adminsOnly: true },
      meta: { title: 'Admins only', noTrail: true, authBand: true },
    },
    // The design system's components on one page, to compare with Figma.
    // Only while developing (npm run dev), never on the live site.
    ...(import.meta.env.DEV
      ? [{ path: '/design', component: () => import('../views/DesignKitView.vue') }]
      : []),
    // Any other address: a "page not found" page with a way back. Keep this
    // last. AppHeader looks for ':pathMatch' to tell real pages from this one.
    {
      path: '/:pathMatch(.*)*',
      component: NotFoundView,
      meta: { title: 'Page not found', noTrail: true, authBand: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // A token is saved but the user never loaded (the server was down or slow
  // when the app started): ask the server once more before deciding. A token
  // it rejects logs out here, so the guard then sends you to the login page.
  if (to.meta.requiresAuth && auth.isLoggedIn && !auth.user) await auth.loadUser()
  return checkRoute(to, auth)
})

router.afterEach((to, from, failure) => {
  document.title = pageTitle(to)
  // The page-not-found screen draws the last two pages as a trail
  if (!failure) rememberPlace(to)
})

export default router
