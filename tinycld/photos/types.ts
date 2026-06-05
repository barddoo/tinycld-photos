export interface PhotoItem {
    id: string
    org: string
    name: string
    file: string
    thumbnail: string
    taken_at: string
    width: number
    height: number
    size: number
    mime_type: string
    description: string
    is_favorite: boolean
    trashed_at: string
    owner: string
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

export type PhotosSchema = {
    photos_items: {
        type: PhotoItem
        relations: { org: import('@tinycld/core/types/pbSchema').Orgs; owner: import('@tinycld/core/types/pbSchema').UserOrg }
    }
    photos_albums: {
        type: PhotoAlbum
        relations: { cover_photo: PhotoItem; org: import('@tinycld/core/types/pbSchema').Orgs; owner: import('@tinycld/core/types/pbSchema').UserOrg }
    }
    photos_album_items: {
        type: PhotoAlbumItem
        relations: { album: PhotoAlbum; photo: PhotoItem }
    }
}

export interface PhotoView {
    id: string
    name: string
    file: string
    thumbnail: string
    takenAt: string
    width: number
    height: number
    size: number
    mimeType: string
    description: string
    isFavorite: boolean
    trashedAt: string
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

export type ActiveSection = 'timeline' | 'albums' | 'favorites' | 'trash'
