import type { FilePreviewSource } from '@tinycld/core/file-viewer/types'
import type { PhotoView } from '../types'

const PHOTOS_COLLECTION = 'photos_items'

export function photoToSource(photo: PhotoView): FilePreviewSource {
    return {
        collectionId: PHOTOS_COLLECTION,
        recordId: photo.id,
        fileName: photo.file,
        displayName: photo.name,
        mimeType: photo.mimeType,
        size: photo.size,
        thumbnailFileName: photo.thumbnail || undefined,
    }
}
