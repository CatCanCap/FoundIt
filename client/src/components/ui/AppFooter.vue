<script setup>
// The footer on every page: the name and what FoundIt is for, on a hairline,
// in the design system (class="ds", assets/system.css). Put it last in a
// flex-column page so it sits at the bottom.
</script>

<template>
  <footer class="ds fi-footer" data-testid="app-footer">
    <div class="fi-footer__inner">
      <span class="fi-footer__brand">Found<span class="fi-footer__it">It</span></span>
      <span class="fi-footer__tagline">Lost &amp; found for the SMU campus</span>
    </div>
  </footer>
</template>

<style scoped>
.fi-footer {
  margin-top: auto;
  border-top: 1px solid var(--ds-border);
  background: var(--ds-canvas);
}

.fi-footer__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ds-space-1) var(--ds-space-3);
  max-width: calc(var(--ds-page-max) + 2 * var(--ds-gutter));
  margin: 0 auto;
  padding: var(--ds-space-5) var(--ds-gutter);
  font-size: var(--ds-size-small);
}

/* The same word as the header's logo (ui/BrandLogo.vue), gold "It" included */
.fi-footer__brand {
  font-size: var(--ds-size-title);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.fi-footer__it {
  color: var(--ds-signal-text);
}

.fi-footer__tagline {
  color: var(--ds-text-muted);
}
</style>
