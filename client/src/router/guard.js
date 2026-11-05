import { safeRedirect } from '@/utils/safeguards'

// The checks run before every page change. Kept apart from router/index.js so
// they can be unit tested without a browser.
//
// Route meta:
//   requiresAuth   the page needs a logged-in user
//   requiresAdmin  the page is for admins only (the server checks again); a
//                  student is sent to /admins-only, which says so
//   title          the tab title, e.g. 'Matches' shows "Matches · FoundIt"
//   studentOnly    the page is not for admins (Feed, Matches, Map, Report, My
//                  disputes); an admin is sent to the Admin page instead
//   signedOutOnly  the page is for visitors (the landing page at /); anyone
//                  signed in goes on to the feed, or the Admin page for an admin
//
// A page that needs login opens only once the server has confirmed who you
// are (auth.user). A token saved in the browser is not enough on its own: if
// the server could not be reached, or the token is stale, you go to the login
// page instead of a page with nobody's details on it. (The server checks the
// token again on every request, so this is about never showing a broken page,
// not the only lock.)
//
// A new account is not signed in until it enters the code emailed to its SMU
// address, so /verify-email is open to anyone (it has no requiresAuth). An
// older account can still be signed in without having entered it (from before
// that rule): it is sent to /verify-email from any page that needs login,
// because it cannot post, claim or chat until it does.
export function checkRoute(to, auth) {
  if (to.meta.requiresAuth && (!auth.isLoggedIn || !auth.user)) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAuth && !auth.isVerified) {
    return { path: '/verify-email', query: { redirect: to.fullPath } }
  }
  // Someone already verified has nothing to do on the code page. They can
  // still land there, e.g. from an old link to it. Send them on to the page
  // they wanted, or the usual landing page (Admin for an admin).
  if (to.path === '/verify-email' && auth.user && auth.isVerified) {
    return safeRedirect(to.query?.redirect, auth.isAdmin ? '/admin' : '/feed', '/verify-email')
  }
  if (to.meta.signedOutOnly && auth.user) {
    return auth.isAdmin ? '/admin' : '/feed'
  }
  if (to.meta.requiresAdmin && auth.user && !auth.isAdmin) {
    return { path: '/admins-only' }
  }
  if (to.meta.studentOnly && auth.isAdmin) {
    return { path: '/admin' }
  }
  return true
}

// The browser tab's title for a page
export function pageTitle(to) {
  return to.meta?.title ? `${to.meta.title} · FoundIt` : 'FoundIt'
}
