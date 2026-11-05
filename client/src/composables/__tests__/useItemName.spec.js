import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useItemName } from '../useItemName'

const blank = () => ref({ category: '', colours: [], brand: '', title: '' })

describe('useItemName', () => {
  it('makes the name from the details until the person types their own', () => {
    const form = blank()
    const { titleShown, editTitle } = useItemName(form)
    form.value.category = 'Water Bottle'
    form.value.colours = ['Navy']
    form.value.brand = 'Hydro Flask'
    expect(titleShown.value).toBe('Navy Hydro Flask water bottle')

    editTitle({ target: { value: 'My blue bottle' } })
    form.value.brand = 'Stanley'
    expect(titleShown.value).toBe('My blue bottle')
    expect(form.value.title).toBe('My blue bottle')
  })

  it('makes no name for Other, so it has to be typed', () => {
    const form = blank()
    const { isOther, titleShown } = useItemName(form)
    form.value.category = 'Other'
    expect(isOther.value).toBe(true)
    expect(titleShown.value).toBe('')
  })

  it('follows the details again after a reset', () => {
    const form = blank()
    const { titleShown, editTitle, resetTitle } = useItemName(form)
    editTitle({ target: { value: 'Typed' } })
    form.value = { category: 'Umbrella', colours: [], brand: '', title: '' }
    resetTitle()
    expect(titleShown.value).toBe('Umbrella')
  })
})
