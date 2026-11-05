<script setup>
// The lost (magnifying glass) or found (camera) icon. The page that uses it
// sets its size and colour.
//   <ReportIcon kind="lost" />
defineProps({
  kind: { type: String, required: true },
})
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="kind === 'lost'">
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4.5 4.5" />
    </template>
    <template v-else>
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
      />
      <circle cx="12" cy="13" r="3.25" />
    </template>
  </svg>
</template>
