// A damped spring for the swinging sign-in tag (components/ui/HangingTag.vue).
// Kept apart from the component so the motion can be unit tested.
//
// The tag hangs from the top of its string. Its angle is in degrees from
// straight down (positive = clockwise, so the bottom swings left), and its
// speed in degrees per second. Each animation frame calls stepPendulum.

export const PENDULUM = {
  stiffness: 38, // pull back to straight down; about one swing a second
  damping: 3.6, // how quickly the swinging dies away (about 2 seconds)
  maxAngle: 35, // how far a drag can lift the tag
  restAngle: 0.05, // below this angle and speed the tag counts as still
  restSpeed: 0.5,
}

// Advance the swing by dt seconds. Returns the new { angle, speed }.
export function stepPendulum({ angle, speed }, dt, settings = PENDULUM) {
  // Long frames (a background tab) would overshoot, so cap the step
  const step = Math.min(dt, 1 / 30)
  const nextSpeed = speed + (-settings.stiffness * angle - settings.damping * speed) * step
  return { angle: angle + nextSpeed * step, speed: nextSpeed }
}

export function isAtRest({ angle, speed }, settings = PENDULUM) {
  return Math.abs(angle) < settings.restAngle && Math.abs(speed) < settings.restSpeed
}

// The angle of a point seen from the pivot, in degrees from straight down.
// Moving the pointer right of the pivot gives a negative angle, so the tag's
// bottom follows the pointer.
export function angleFromPivot(pivot, point) {
  return (-Math.atan2(point.x - pivot.x, point.y - pivot.y) * 180) / Math.PI
}

export function clampAngle(angle, settings = PENDULUM) {
  return Math.max(-settings.maxAngle, Math.min(settings.maxAngle, angle))
}
