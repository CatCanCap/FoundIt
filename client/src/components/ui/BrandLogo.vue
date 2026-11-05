<script setup>
// The FoundIt mark: the lion's head and the word "FoundIt", linking home.
//   tone  ink (default) on cream, or light on the navy bands
import { RouterLink } from 'vue-router'
import MascotArt from './MascotArt.vue'

defineProps({
  tone: { type: String, default: 'ink' },
})
</script>

<template>
  <RouterLink to="/" class="fi-logo" :class="`fi-logo--${tone}`" data-testid="brand-logo">
    <MascotArt variant="head" :size="34" />
    <span class="fi-logo__word">Found<span class="fi-logo__it">It</span></span>
  </RouterLink>
</template>

<style scoped>
.fi-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-decoration: none;
}

.fi-logo--ink {
  color: var(--fi-ink);
}

.fi-logo--light {
  color: #fff;
}

/* The darker gold on light pages (brass itself is too faint on white to read);
   the light tone sits on navy, where brass reads well */
.fi-logo__it {
  color: var(--fi-brass-strong);
}

.fi-logo--light .fi-logo__it {
  color: var(--fi-brass);
}

.fi-logo:focus-visible {
  outline: 3px solid var(--fi-focus);
  outline-offset: 4px;
  border-radius: 4px;
}
</style>
