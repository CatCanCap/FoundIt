<script setup>
// A page that could not load (WS5): what went wrong, in a Bootstrap alert, and
// links to go on from there, so nobody is left on a dead end.
//   message  the error, for example "Match not found"
//   links    [{ to, label }], the first one shown as the main button
// Inside a rebuilt page (class="ds") it is a quiet dashed panel instead.
import BaseButton from '@/components/ui/BaseButton.vue'

defineProps({
  message: { type: String, required: true },
  links: { type: Array, default: () => [{ to: '/feed', label: 'Go to the feed' }] },
})
</script>

<template>
  <section class="ho-dead-end page-problem" data-testid="page-problem">
    <div class="alert alert-danger page-problem__message" role="alert">{{ message }}</div>
    <p class="ho-muted page-problem__hint">It may have been removed, or the link is out of date.</p>
    <div class="d-flex flex-wrap align-items-center gap-3">
      <BaseButton
        v-for="(link, index) in links"
        :key="link.to"
        :to="link.to"
        :variant="index === 0 ? 'primary' : 'secondary'"
      >
        {{ link.label }}
      </BaseButton>
    </div>
  </section>
</template>

<style scoped>
.page-problem {
  padding-block: 1rem;
}

/* Inside a rebuilt page (class="ds", assets/system.css): a quiet dashed panel
   with the problem in red, not a filled alert box. Pages not rebuilt yet keep
   Bootstrap's alert. */
.ds .page-problem {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);
  padding: var(--ds-space-5);
  border: 1px dashed var(--ds-border-control);
  border-radius: var(--ds-radius-surface);
}

.ds .page-problem__message {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ds-danger);
  font-weight: var(--ds-weight-bold);
}

.ds .page-problem__hint {
  margin: 0;
  color: var(--ds-text-muted);
}
</style>
