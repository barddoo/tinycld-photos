export type MediaType = 'image' | 'video' | 'live_photo'

export type MLStatus = 'pending' | 'processing' | 'done' | 'failed'

export type MemoryType = 'on_this_day' | 'best_of_month' | 'trip' | 'custom'

export type ActiveSection =
    | 'timeline'
    | 'albums'
    | 'favorites'
    | 'trash'
    | 'tags'
    | 'search'
    | 'people'
    | 'memories'
    | 'duplicates'
    | 'map'

export type SourceType = 'ml' | 'manual'

export type JobType =
    | 'detect_faces'
    | 'encode_clip'
    | 'run_ocr'
    | 'compute_phash'
    | 'reverse_geocode'
    | 'recognize_faces'

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface PhotoItem {
    id: string
    org: string
    name: string
    file: string
    thumbnail: string
    type: MediaType
    taken_at: string
    width: number
    height: number
    size: number
    mime_type: string
    description: string
    is_favorite: boolean
    trashed_at: string
    duration: number
    live_photo_pair_id: string
    owner: string
    search_text: string
    location: string
    latitude: number | null
    longitude: number | null
    smart_search_vector: number[]
    perceptual_hash: string
    ml_status: MLStatus
    camera_make: string
    camera_model: string
    lens_model: string
    iso: number
    aperture: string
    focal_length: string
    created: string
    updated: string
}

export interface PhotoAlbum {
    id: string
    name: string
    description: string
    cover_photo: string
    org: string
    owner: string
    created: string
    updated: string
}

export interface PhotoAlbumItem {
    id: string
    album: string
    photo: string
    sort_order: number
    created: string
}

export interface PhotoTag {
    id: string
    name: string
    color: string
    parent: string
    org: string
    owner: string
    created: string
    updated: string
}

export interface PhotoItemTag {
    id: string
    item: string
    tag: string
    created: string
}

export interface PhotosPerson {
    id: string
    name: string
    thumbnail_face: string | null
    is_hidden: boolean
    birth_date: string | null
    color: string | null
    org: string
    owner: string
    created: string
    updated: string
}

export interface PhotosFace {
    id: string
    photo: string
    person: string | null
    bounding_box: { x1: number; y1: number; x2: number; y2: number }
    embedding: number[]
    image_width: number
    image_height: number
    source_type: SourceType
    is_visible: boolean
    created: string
    updated: string
}

export interface PhotosMemory {
    id: string
    type: MemoryType
    title: string
    data: Record<string, unknown>
    owner: string
    created: string
    updated: string
}

export interface PhotosMemoryItem {
    id: string
    memory: string
    photo: string
    created: string
}

export interface PhotosMLState {
    id: string
    clip_model_name: string
    face_model_name: string
    last_face_detection: string
    last_face_recognition: string
    last_clip_encode: string
    last_ocr_run: string
    created: string
    updated: string
}

export interface PhotosJobQueue {
    id: string
    photo: string
    job_type: JobType
    status: JobStatus
    attempts: number
    last_error: string
    scheduled_at: string
    created_at: string
}

export type PhotosSchema = {
    photos_items: {
        type: PhotoItem
        relations: {
            org: import('@tinycld/core/types/pbSchema').Orgs
            owner: import('@tinycld/core/types/pbSchema').UserOrg
        }
    }
    photos_albums: {
        type: PhotoAlbum
        relations: {
            cover_photo: PhotoItem
            org: import('@tinycld/core/types/pbSchema').Orgs
            owner: import('@tinycld/core/types/pbSchema').UserOrg
        }
    }
    photos_album_items: {
        type: PhotoAlbumItem
        relations: { album: PhotoAlbum; photo: PhotoItem }
    }
    photos_tags: {
        type: PhotoTag
        relations: {
            org: import('@tinycld/core/types/pbSchema').Orgs
            owner: import('@tinycld/core/types/pbSchema').UserOrg
        }
    }
    photos_item_tags: {
        type: PhotoItemTag
        relations: { item: PhotoItem; tag: PhotoTag }
    }
    photos_people: {
        type: PhotosPerson
        relations: {
            thumbnail_face: PhotosFace
            org: import('@tinycld/core/types/pbSchema').Orgs
            owner: import('@tinycld/core/types/pbSchema').UserOrg
        }
    }
    photos_faces: {
        type: PhotosFace
        relations: { photo: PhotoItem; person: PhotosPerson }
    }
    photos_memories: {
        type: PhotosMemory
        relations: { owner: import('@tinycld/core/types/pbSchema').UserOrg }
    }
    photos_memory_items: {
        type: PhotosMemoryItem
        relations: { memory: PhotosMemory; photo: PhotoItem }
    }
    photos_ml_state: {
        type: PhotosMLState
        relations: Record<string, never>
    }
    photos_job_queue: {
        type: PhotosJobQueue
        relations: { photo: PhotoItem }
    }
}

export interface PhotoView {
    id: string
    name: string
    file: string
    thumbnail: string
    type: MediaType
    takenAt: string
    width: number
    height: number
    size: number
    mimeType: string
    description: string
    isFavorite: boolean
    trashedAt: string
    duration: number
    livePhotoPairId: string
    searchText: string
    location: string
    latitude: number | null
    longitude: number | null
    perceptualHash: string
    mlStatus: MLStatus
    cameraMake: string
    cameraModel: string
    lensModel: string
    iso: number
    aperture: string
    focalLength: string
    owner: string
    created: string
    updated: string
}

export interface AlbumView {
    id: string
    name: string
    description: string
    coverPhotoId: string
    photoCount: number
    createdAt: string
    updatedAt: string
}

export interface PersonView {
    id: string
    name: string
    thumbnailFace: string | null
    thumbnailPhotoId: string | null
    thumbnailPhotoFile: string | null
    thumbnailPhotoThumb: string | null
    isHidden: boolean
    birthDate: string | null
    color: string | null
    photoCount: number
}

export interface MemoryView {
    id: string
    type: MemoryType
    title: string
    photos: PhotoView[]
    createdAt: string
}

export interface DuplicateGroupView {
    photos: string[]
    count: number
    distance: number
}

export interface SearchResultView {
    photo: PhotoView
    score: number
    matchType: 'fts' | 'semantic'
}

export interface FaceView {
    id: string
    photo: string
    person: string | null
    boundingBox: { x1: number; y1: number; x2: number; y2: number }
    isVisible: boolean
}
