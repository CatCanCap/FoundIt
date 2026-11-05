import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

vi.mock('@/services/cloudinary', () => ({
  checkPhoto: vi.fn(() => null),
  uploadPhoto: vi.fn(),
}))

import { checkPhoto, uploadPhoto } from '@/services/cloudinary'
import { usePhotoUpload } from '../usePhotoUpload'

// Runs the composable inside a tiny component, as a page would
function setup() {
  const onChange = vi.fn()
  let photo
  const wrapper = mount(
    defineComponent({
      setup() {
        photo = usePhotoUpload({ onChange })
        return () => h('div')
      },
    }),
  )
  return { photo, onChange, wrapper }
}

const file = (name = 'bottle.jpg') => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('usePhotoUpload', () => {
  it('shows a preview straight away and passes on the link once uploaded', async () => {
    uploadPhoto.mockResolvedValue('https://res.cloudinary.com/x/bottle.jpg')
    const { photo, onChange } = setup()

    photo.dropPhoto({ dataTransfer: { files: [file()] } })
    expect(photo.photoPreview.value).toBe('blob:preview')
    expect(photo.photoName.value).toBe('bottle.jpg')
    expect(photo.isUploadingPhoto.value).toBe(true)

    await flushPromises()
    expect(photo.isUploadingPhoto.value).toBe(false)
    expect(onChange).toHaveBeenLastCalledWith('https://res.cloudinary.com/x/bottle.jpg')
  })

  it('refuses a file that fails the check, without uploading it', () => {
    checkPhoto.mockReturnValueOnce('Photos must be 10 MB or smaller.')
    const { photo } = setup()

    photo.choosePhoto({ target: { files: [file()], value: 'C:\\bottle.jpg' } })
    expect(photo.photoError.value).toBe('Photos must be 10 MB or smaller.')
    expect(uploadPhoto).not.toHaveBeenCalled()
  })

  it('shows why an upload failed and forgets the photo', async () => {
    uploadPhoto.mockRejectedValue(new Error('Could not upload the photo.'))
    const { photo, onChange } = setup()

    photo.choosePhoto({ target: { files: [file()], value: '' } })
    await flushPromises()
    expect(photo.photoError.value).toBe('Could not upload the photo.')
    expect(photo.photoPreview.value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('cancels the first upload when a second photo is picked', async () => {
    const signals = []
    uploadPhoto.mockImplementation((picked, { signal }) => {
      signals.push(signal)
      return picked.name === 'second.jpg'
        ? Promise.resolve('https://res.cloudinary.com/x/second.jpg')
        : new Promise(() => {})
    })
    const { photo, onChange } = setup()

    photo.dropPhoto({ dataTransfer: { files: [file('first.jpg')] } })
    photo.dropPhoto({ dataTransfer: { files: [file('second.jpg')] } })
    await flushPromises()
    expect(signals[0].aborted).toBe(true)
    expect(photo.photoName.value).toBe('second.jpg')
    expect(onChange).toHaveBeenLastCalledWith('https://res.cloudinary.com/x/second.jpg')
  })

  it('removes the photo and its error', async () => {
    uploadPhoto.mockResolvedValue('https://res.cloudinary.com/x/bottle.jpg')
    const { photo, onChange } = setup()
    photo.dropPhoto({ dataTransfer: { files: [file()] } })
    await flushPromises()
    photo.photoError.value = 'old message'

    photo.removePhoto()
    expect(photo.photoPreview.value).toBe('')
    expect(photo.photoError.value).toBe('')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('cancels an upload still going when the page closes', () => {
    let signal
    uploadPhoto.mockImplementation((picked, options) => {
      signal = options.signal
      return new Promise(() => {})
    })
    const { photo, wrapper } = setup()
    photo.dropPhoto({ dataTransfer: { files: [file()] } })

    wrapper.unmount()
    expect(signal.aborted).toBe(true)
  })
})
