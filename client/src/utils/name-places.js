// Picks a side (below, right, left or above) for each map name tag so they
// don't overlap each other or the pictures; falls back to the least overlap.

// The sides a name can sit on, in the order they are tried
export const NAME_SIDES = ['below', 'right', 'left', 'above']
// Pixels between a picture and its name; matches the CSS in CampusMapbox.vue
export const NAME_GAP = 3

// A box on screen, in pixels: { left, top, width, height }

// The box a name tag covers on one side of its picture
export function nameBox(art, side, width, height) {
  const middleX = (art.left + art.right) / 2
  const middleY = (art.top + art.bottom) / 2
  if (side === 'below') {
    return { left: middleX - width / 2, top: art.bottom + NAME_GAP, width, height }
  }
  if (side === 'right') {
    return { left: art.right + NAME_GAP, top: middleY - height / 2, width, height }
  }
  if (side === 'left') {
    return { left: art.left - NAME_GAP - width, top: middleY - height / 2, width, height }
  }
  return { left: middleX - width / 2, top: art.top - NAME_GAP - height, width, height }
}

// The area two boxes share, in square pixels (0 when they don't touch)
export function overlap(a, b) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

// How much of a box hangs off the edge of the map, in square pixels
export function offMap(box, mapWidth, mapHeight) {
  const onMap = overlap(box, { left: 0, top: 0, width: mapWidth, height: mapHeight })
  return box.width * box.height - onMap
}

// items: [{ art, width, height, picked }] -> one side per item
export function chooseNameSides(items, mapWidth, mapHeight) {
  // Every picture is taken space; each name adds its box once placed
  const taken = items.map(({ art }) => ({
    left: art.left,
    top: art.top,
    width: art.right - art.left,
    height: art.bottom - art.top,
  }))

  // Picked first, then top to bottom, left to right (stable result)
  const order = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        b.item.picked - a.item.picked ||
        a.item.art.top - b.item.art.top ||
        a.item.art.left - b.item.art.left,
    )

  const sides = []
  for (const { item, index } of order) {
    let best = null
    for (const side of NAME_SIDES) {
      const box = nameBox(item.art, side, item.width, item.height)
      const covered = taken.reduce((sum, other) => sum + overlap(box, other), 0)
      const cost = covered + offMap(box, mapWidth, mapHeight)
      if (!best || cost < best.cost) best = { side, box, cost }
      if (cost === 0) break
    }
    sides[index] = best.side
    taken.push(best.box)
  }
  return sides
}
