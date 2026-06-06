import { eq, inArray } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { AlbumView, PhotoAlbum, PhotoItem, PhotoView } from '../types'
import { photoToView, toPhotoViews } from './usePhotos'

function albumToView(album: PhotoAlbum, count: number): AlbumView {
    return {
        id: album.id,
        name: album.name,
        description: album.description,
        coverPhotoId: album.cover_photo,
        photoCount: count,
        createdAt: album.created,
        updatedAt: album.updated,
    }
}

export function useAlbums() {
    const [albumsCollection] = useStore('photos_albums')
    const [albumItemsCollection] = useStore('photos_album_items')
    const [photosCollection] = useStore('photos_items')

    const { data: rawAlbums, isLoading: albumsLoading } = useOrgLiveQuery((query, { orgId }) =>
        query
            .from({ a: albumsCollection })
            .where(({ a }) => eq(a.org, orgId))
            .orderBy(({ a }) => a.updated, 'desc')
    )

    const { data: rawAlbumItems } = useOrgLiveQuery(query =>
        query.from({ ai: albumItemsCollection })
    )

    const { data: rawPhotos } = useOrgLiveQuery((query, { orgId }) =>
        query.from({ p: photosCollection }).where(({ p }) => eq(p.org, orgId))
    )

    const coverPhotoMap = useMemo(() => {
        const map = new Map<string, PhotoView>()
        const photos = (rawPhotos ?? []) as PhotoItem[]
        const allPhotos = photos.map(photoToView)
        for (const photo of allPhotos) {
            map.set(photo.id, photo)
        }
        return map
    }, [rawPhotos])

    const photoCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const item of rawAlbumItems ?? []) {
            counts.set(item.album, (counts.get(item.album) ?? 0) + 1)
        }
        return counts
    }, [rawAlbumItems])

    const albums = useMemo<AlbumView[]>(
        () => (rawAlbums ?? []).map(a => albumToView(a, photoCounts.get(a.id) ?? 0)),
        [rawAlbums, photoCounts]
    )

    return { albums, coverPhotoMap, isLoading: albumsLoading }
}

export function useAlbumPhotos(albumId: string) {
    const [itemsCollection] = useStore('photos_items')
    const [albumItemsCollection] = useStore('photos_album_items')

    const { data: albumItems } = useOrgLiveQuery(
        query =>
            query
                .from({ ai: albumItemsCollection })
                .where(({ ai }) => eq(ai.album, albumId))
                .orderBy(({ ai }) => ai.sort_order, 'asc'),
        [albumId]
    )

    const photoIds = useMemo(
        () => (albumItems ?? []).map(ai => ai.photo).filter(Boolean) as string[],
        [albumItems]
    )

    const { data: albumPhotos, isLoading } = useOrgLiveQuery(
        (query, { orgId }) => {
            const base = query.from({ p: itemsCollection }).where(({ p }) => eq(p.org, orgId))
            if (photoIds.length > 0) {
                return base.where(({ p }) => inArray(p.id, photoIds))
            }
            return base.where(({ p }) => eq(p.id, '__empty_album__'))
        },
        [photoIds]
    )

    const photos = useMemo<PhotoView[]>(() => toPhotoViews(albumPhotos), [albumPhotos])

    return { photos, isLoading }
}
