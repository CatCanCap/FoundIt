<script setup>
// Tagi, the luggage-tag mascot.
//   mood  happy (default), calm, sleepy or searching (holds a magnifying glass)
//   size  height in pixels; the width follows
defineProps({
  mood: { type: String, default: 'happy' },
  size: { type: Number, default: 96 },
})
</script>

<template>
  <svg
    class="fi-tagi"
    :height="size"
    :width="size * 0.8"
    viewBox="0 0 80 100"
    role="img"
    aria-label="Tagi, the FoundIt luggage tag"
    :data-mood="mood"
  >
    <!-- String -->
    <path d="M40 0v14" stroke="#141a3f" stroke-width="2" />
    <!-- Tag body with cut top corners -->
    <path
      d="M24 12h32l14 14v62a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V26z"
      fill="#fffdf8"
      stroke="#141a3f"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <!-- Brass eyelet -->
    <circle cx="40" cy="24" r="5" fill="#fffdf8" stroke="#d4a63a" stroke-width="3" />

    <template v-if="mood === 'sleepy'">
      <path
        d="M24 52q5 4 10 0M46 52q5 4 10 0"
        fill="none"
        stroke="#141a3f"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path d="M35 68h10" stroke="#141a3f" stroke-width="3" stroke-linecap="round" />
      <text x="60" y="14" font-size="10" font-weight="700" fill="#5c6282">z</text>
      <text x="67" y="7" font-size="8" font-weight="700" fill="#5c6282">z</text>
    </template>
    <template v-else>
      <circle cx="29" cy="52" r="4" fill="#141a3f" />
      <circle cx="51" cy="52" r="4" fill="#141a3f" />
      <circle cx="30.5" cy="50.5" r="1.3" fill="#fff" />
      <circle cx="52.5" cy="50.5" r="1.3" fill="#fff" />
      <path
        v-if="mood === 'calm'"
        d="M34 66q6 4 12 0"
        fill="none"
        stroke="#141a3f"
        stroke-width="3"
        stroke-linecap="round"
      />
      <path v-else d="M32 63q8 10 16 0z" fill="#141a3f" />
    </template>
    <!-- Cheeks -->
    <ellipse cx="21" cy="62" rx="5" ry="3" fill="#f2a7a0" opacity="0.7" />
    <ellipse cx="59" cy="62" rx="5" ry="3" fill="#f2a7a0" opacity="0.7" />

    <g v-if="mood === 'searching'">
      <circle
        cx="62"
        cy="76"
        r="9"
        fill="rgb(255 255 255 / 55%)"
        stroke="#141a3f"
        stroke-width="3"
      />
      <path d="M68 83l8 9" stroke="#141a3f" stroke-width="4" stroke-linecap="round" />
    </g>
  </svg>
</template>

<style scoped>
.fi-tagi {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
</style>
