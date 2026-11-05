// Page buttons, at most 7: pageNumbers(5, 10) -> [1, '…', 4, 5, 6, '…', 10]
export function pageNumbers(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  // Near either end, show five pages in a row so the row keeps one length
  const low = Math.max(2, Math.min(page - 1, pageCount - 4))
  const high = Math.min(pageCount - 1, Math.max(page + 1, 5))
  const numbers = [1]
  // A gap of a single page shows that page instead of '…'
  if (low > 2) numbers.push(low === 3 ? 2 : '…')
  for (let number = low; number <= high; number += 1) numbers.push(number)
  if (high < pageCount - 1) numbers.push(high === pageCount - 2 ? pageCount - 1 : '…')
  numbers.push(pageCount)
  return numbers
}
