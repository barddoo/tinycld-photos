import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { PhotoAlbum } from '../types'
import type { AlbumView, PhotoView } from '../types'
import { photoToView } from './usePhotos'

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

    const { data: rawAlbums, isLoading: albumsLoading } = useOrgLiveQuery(
        (query, { orgId }) =>
            query
                .from({ a: albumsCollection })
                .where(({ a }) => eq(a.org, orgId))
                .orderBy(({ a }) => a.updated, 'desc'),
    )

    const { data: rawAlbumItems } = useOrgLiveQuery(
        (query) => query.from({ ai: albumItemsCollection }),
    )

    const photoCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const item of rawAlbumItems ?? []) {
            counts.set(item.album, (counts.get(item.album) ?? 0) + 1)
        }
        return counts
    }, [rawAlbumItems])

    const albums = useMemo<AlbumView[]>(
        () =>
            (rawAlbums ?? []).map(a =>
                albumToView(a, photoCounts.get(a.id) ?? 0)
            ),
        [rawAlbums, photoCounts]
    )

    return { albums, isLoading: albumsLoading }
}

export function useAlbumPhotos(albumId: string) {
    const [itemsCollection] = useStore('photos_items')
    const [albumItemsCollection] = useStore('photos_album_items')

    const { data: albumItems } = useOrgLiveQuery(
        (query) =>
            query
                .from({ ai: albumItemsCollection })
                .where(({ ai }) => eq(ai.album, albumId))
                .orderBy(({ ai }) => ai.sort_order, 'asc'),
        [albumId],
    )

    const photoIds = useMemo(
        () => new Set((albumItems ?? []).map(ai => ai.photo).filter(Boolean)),
        [albumItems]
    )

    const { data: rawPhotos, isLoading } = useOrgLiveQuery(
        (query, { orgId }) =>
            query
                .from({ p: itemsCollection })
                .where(({ p }) => eq(p.org, orgId)),
    )

    const photos = useMemo<PhotoView[]>(
        () => (rawPhotos ?? []).filter(p => photoIds.has(p.id)).map(photoToView),
        [rawPhotos, photoIds]
    )

    return { photos, isLoading }
}
