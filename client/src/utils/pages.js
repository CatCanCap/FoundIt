// Whether a route exists (ignoring the catch-all page)
export function pageExists(router, path) {
  const matched = router.resolve(path).matched
  return matched.length > 0 && !matched.some((record) => record.path.includes(':pathMatch'))
}
