// Pixel-art SVG pictures of the campus buildings for the map markers

// Size of one square, in pixels
const CELL = 3
const SVG_NS = 'http://www.w3.org/2000/svg'
const DOOR = '#1c2259'
const SHADOW = 'rgba(28, 34, 89, 0.25)'

// wall, trim (roof and outline), glass (windows)
const BUILDINGS = {
  'SOE/SCIS 2': { cols: 8, rows: 13, wall: '#dfe6f2', trim: '#5b6680', glass: '#8fc3f0' },
  'SCIS 1': { cols: 7, rows: 14, wall: '#b7c3dd', trim: '#4a5573', glass: '#d8ecff' },
  'Li Ka Shing Library': { cols: 9, rows: 10, wall: '#d9643c', trim: '#8f3a1e', glass: '#ffe7a8' },
  SOA: { cols: 9, rows: 9, wall: '#ef9a4f', trim: '#a85a1c', glass: '#fff1c9' },
  LKCSB: { cols: 11, rows: 12, wall: '#c5d0ea', trim: '#56617f', glass: '#eef6ff' },
  'Administration Building': {
    cols: 10,
    rows: 8,
    wall: '#f1e7d0',
    trim: '#c84c2c',
    glass: '#a9d1f5',
  },
  'SMU Connexion': { cols: 10, rows: 7, wall: '#d4ebbd', trim: '#4f9a3a', glass: '#8fc3f0' },
  YPHSL: { cols: 8, rows: 11, wall: '#efe3cc', trim: '#7a5a3a', glass: '#8fc3f0' },
  'SOSS/CIS': { cols: 6, rows: 12, wall: '#f4f4f4', trim: '#5b6680', glass: '#8fc3f0' },
}
const PLAIN = { cols: 8, rows: 9, wall: '#e6e1d6', trim: '#7c7f8c', glass: '#cfe3f5' }

function svg(cols, rows) {
  const el = document.createElementNS(SVG_NS, 'svg')
  // One extra square right and below for the drop shadow
  el.setAttribute('viewBox', `0 0 ${cols + 1} ${rows + 1}`)
  el.setAttribute('width', String((cols + 1) * CELL))
  el.setAttribute('height', String((rows + 1) * CELL))
  el.setAttribute('shape-rendering', 'crispEdges')
  el.setAttribute('aria-hidden', 'true')
  el.classList.add('fi-sprite')
  return el
}

function square(parent, x, y, width, height, fill) {
  const el = document.createElementNS(SVG_NS, 'rect')
  el.setAttribute('x', String(x))
  el.setAttribute('y', String(y))
  el.setAttribute('width', String(width))
  el.setAttribute('height', String(height))
  el.setAttribute('fill', fill)
  parent.append(el)
}

function block({ cols, rows, wall, trim, glass }) {
  const el = svg(cols, rows)
  square(el, 1, 1, cols, rows, SHADOW)
  // Outline, then the wall inside it, then a two-square roof
  square(el, 0, 0, cols, rows, trim)
  square(el, 1, 1, cols - 2, rows - 2, wall)
  square(el, 0, 0, cols, 2, trim)
  // Windows every other square, leaving room for the door
  for (let y = 3; y <= rows - 4; y += 2) {
    for (let x = 1 + ((cols - 2) % 2); x < cols - 1; x += 2) square(el, x, y, 1, 1, glass)
  }
  const doorWidth = cols % 2 === 0 ? 2 : 1
  square(el, (cols - doorWidth) / 2, rows - 3, doorWidth, 2, DOOR)
  return el
}

function trees() {
  const cols = 11
  const rows = 9
  const el = svg(cols, rows)
  square(el, 1, rows - 1, cols, 1, SHADOW)
  square(el, 0, rows - 2, cols, 2, '#5fa83f')
  for (const x of [0, 4, 8]) {
    square(el, x + 1, rows - 4, 1, 2, '#7a4b2a')
    square(el, x, rows - 8, 3, 4, '#3f8f3a')
    square(el, x, rows - 8, 1, 1, '#6cc35a')
  }
  return el
}

function stairs() {
  const cols = 10
  const rows = 6
  const el = svg(cols, rows)
  square(el, 1, 1, cols, rows, SHADOW)
  square(el, 0, 0, cols, rows, '#56617f')
  for (let y = 1; y < rows - 1; y += 1)
    square(el, 1 + y, y, cols - 2 - y, 1, y % 2 ? '#c9cfdb' : '#9aa3b8')
  // A gold "way in" sign
  square(el, 1, 1, 2, 1, '#f2b84b')
  return el
}

// The pixel picture for one building, as an <svg> element
export function pixelBuilding(building) {
  if (building === 'Campus Green') return trees()
  if (building === 'Concourse') return stairs()
  return block(BUILDINGS[building] || PLAIN)
}
