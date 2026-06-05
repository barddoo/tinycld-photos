import { desc, eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { ActiveSection, PhotoItem, PhotoView } from '../types'

export interface TimelineSegment {
    date: string
    label: string
    photos: PhotoView[]
}

export function photoToView(p: PhotoItem): PhotoView {
    return {
        id: p.id,
        name: p.name,
        file: p.file,
        thumbnail: p.thumbnail,
        takenAt: p.taken_at,
        width: p.width,
        height: p.height,
        size: p.size,
        mimeType: p.mime_type,
        description: p.description,
        isFavorite: p.is_favorite,
        trashedAt: p.trashed_at,
        owner: p.owner,
        created: p.created,
        updated: p.updated,
    }
}

function formatDateLabel(dateStr: string): string {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().slice(0, 10)

    if (dateStr === todayStr) return 'Today'
    if (dateStr === yesterdayStr) return 'Yesterday'

    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function groupByDay(photos: PhotoView[]): TimelineSegment[] {
    const groups = new Map<string, PhotoView[]>()

    for (const photo of photos) {
        const date = photo.takenAt ? photo.takenAt.slice(0, 10) : 'unknown'
        const list = groups.get(date)
        if (list) list.push(photo)
        else groups.set(date, [photo])
    }

    return Array.from(groups.entries())
        .map(([date, segmentPhotos]) => ({
            date,
            label: formatDateLabel(date),
            photos: segmentPhotos,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
}

export function usePhotos(section: ActiveSection = 'timeline') {
    const [itemsCollection] = useStore('photos_items')

    const { data: rawPhotos, isLoading } = useOrgLiveQuery(
        (query, { orgId }) =>
            query
                .from({ p: itemsCollection })
                .where(({ p }) => eq(p.org, orgId))
                .orderBy(({ p }) => p.taken_at, 'desc'),
    )

    const allPhotos = useMemo<PhotoView[]>(
        () => (rawPhotos ?? []).map(photoToView),
        [rawPhotos]
    )

    const photos = useMemo(() => {
        switch (section) {
            case 'favorites':
                return allPhotos.filter(p => p.isFavorite && !p.trashedAt)
            case 'trash':
                return allPhotos.filter(p => !!p.trashedAt)
            default:
                return allPhotos.filter(p => !p.trashedAt)
        }
    }, [allPhotos, section])

    const timeline = useMemo(() => groupByDay(photos), [photos])

    return { photos, timeline, allPhotos, isLoading }
}
