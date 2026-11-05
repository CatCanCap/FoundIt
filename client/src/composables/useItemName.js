// Item name field for the report forms: built from the details until the
// person types their own (required for Other).
//   const { isOther, titleShown, editTitle, resetTitle } = useItemName(form)
import { computed, ref } from 'vue'
import { OTHER, itemTitle } from '@/utils/report'

export function useItemName(form) {
  const isOther = computed(() => form.value.category === OTHER)
  // Set once the person types in the field; from then on their words stay
  const titleEdited = ref(false)
  const autoTitle = computed(() => itemTitle(form.value))
  const titleShown = computed(() => (titleEdited.value ? form.value.title : autoTitle.value))

  function editTitle(event) {
    titleEdited.value = true
    form.value.title = event.target.value
  }

  // For a fresh form ("Report another"): follow the details again
  function resetTitle() {
    titleEdited.value = false
  }

  return { isOther, autoTitle, titleShown, editTitle, resetTitle }
}
