// Photo picking and Cloudinary upload for the report forms.
// onChange(url) gets the uploaded link, or '' when the photo is removed.
import { onBeforeUnmount, ref } from 'vue'
import { checkPhoto, uploadPhoto } from '@/services/cloudinary'

export function usePhotoUpload({ onChange = () => {} } = {}) {
  // A local link to the chosen file, so the preview shows before the upload ends
  const photoPreview = ref('')
  const photoName = ref('')
  // The browser could not show the file (a HEIC photo on Windows, say)
  const photoPreviewFailed = ref(false)
  const isUploadingPhoto = ref(false)
  const photoError = ref('')
  const isDragging = ref(false)
  // The upload in progress, so a new photo or leaving the page can cancel it
  let upload = null

  function clearPhoto() {
    if (upload) upload.abort()
    upload = null
    if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
    photoPreview.value = ''
    photoName.value = ''
    photoPreviewFailed.value = false
    isUploadingPhoto.value = false
    onChange('')
  }

  async function usePhoto(file) {
    if (!file) return
    photoError.value = checkPhoto(file) || ''
    if (photoError.value) return
    clearPhoto()

    photoPreview.value = URL.createObjectURL(file)
    photoName.value = file.name
    isUploadingPhoto.value = true
    const thisUpload = new AbortController()
    upload = thisUpload
    try {
      const url = await uploadPhoto(file, { signal: thisUpload.signal })
      onChange(url)
    } catch (error) {
      // A newer photo or leaving the page cancelled it: nothing to report
      if (error.name === 'AbortError') return
      photoError.value = error.message
      clearPhoto()
    } finally {
      if (upload === thisUpload) {
        isUploadingPhoto.value = false
        upload = null
      }
    }
  }

  // Clear the input so the same file can be picked again
  function choosePhoto(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    usePhoto(file)
  }

  function dropPhoto(event) {
    isDragging.value = false
    usePhoto(event.dataTransfer?.files?.[0])
  }

  function removePhoto() {
    photoError.value = ''
    clearPhoto()
  }

  // Leaving the page cancels an upload and frees the preview
  onBeforeUnmount(clearPhoto)

  return {
    photoPreview,
    photoName,
    photoPreviewFailed,
    isUploadingPhoto,
    photoError,
    isDragging,
    choosePhoto,
    dropPhoto,
    removePhoto,
    clearPhoto,
  }
}
