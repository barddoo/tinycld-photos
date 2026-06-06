import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import { groupByDay, photoToView } from '../lib/photo-utils'
import type { ActiveSection, PhotoView } from '../types'

export type { TimelineSegment } from '../lib/photo-utils'
export { formatDateLabel, groupByDay, photoToView, toPhotoViews } from '../lib/photo-utils'

export function usePhotos(section: ActiveSection = 'timeline') {
    const [itemsCollection] = useStore('photos_items')

    const { data: rawPhotos, isLoading } = useOrgLiveQuery((query, { orgId }) =>
        query
            .from({ p: itemsCollection })
            .where(({ p }) => eq(p.org, orgId))
            .orderBy(({ p }) => p.taken_at, 'desc')
    )

    const allPhotos = useMemo<PhotoView[]>(() => (rawPhotos ?? []).map(photoToView), [rawPhotos])

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
