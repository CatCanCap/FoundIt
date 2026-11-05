// A blast of confetti from one spot, for an item coming home (ReturnedView).
// Every piece flies out in a random direction, slows down, then falls and fades.
// The pieces are removed once they have landed. The page styles them as <i>.
const COLOURS = ['--ds-signal', '--ds-action', '--ds-danger', '--ds-success', '--ds-focus']
const PIECES = 56
const STEPS = 12

// The keyframes and length of one piece's flight
export function pieceFlight(random = Math.random) {
  const angle = random() * Math.PI * 2
  const reach = 260 + random() * 350
  const spin = (random() - 0.5) * 1080
  const frames = []
  for (let step = 0; step <= STEPS; step++) {
    const t = step / STEPS
    const travel = (1 - Math.pow(1 - t, 3)) * reach
    const x = Math.cos(angle) * travel
    const y = Math.sin(angle) * travel + 300 * t * t
    frames.push({
      transform: `translate(${x}px, ${y}px) rotate(${spin * t}deg)`,
      opacity: t < 0.7 ? 1 : (1 - t) / 0.3,
    })
  }
  return { frames, duration: 1100 + random() * 600 }
}

export function blastConfetti(host) {
  if (!host) return
  const pieces = Array.from({ length: PIECES }, (_, index) => {
    const piece = document.createElement('i')
    piece.style.background = `var(${COLOURS[index % COLOURS.length]})`
    return piece
  })
  host.append(...pieces)
  const flights = pieces.map((piece) => {
    const { frames, duration } = pieceFlight()
    return piece.animate(frames, { duration, easing: 'linear', fill: 'both' }).finished
  })
  Promise.allSettled(flights).then(() => pieces.forEach((piece) => piece.remove()))
}
