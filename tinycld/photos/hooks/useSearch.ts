import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useEffect, useMemo, useState } from 'react'
import type { PhotoItem, PhotoView } from '../types'
import { photoToView } from './usePhotos'

interface UseSearchOptions {
    query: string
    debounceMs?: number
}

export function useSearch({ query, debounceMs = 300 }: UseSearchOptions) {
    const [debounced, setDebounced] = useState('')
    const [photoStore] = useStore('photos_items')

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(query), debounceMs)
        return () => clearTimeout(timer)
    }, [query, debounceMs])

    const { data: raw, isLoading } = useOrgLiveQuery(
        (q, { orgId }) =>
            q
                .from({ p: photoStore })
                .where(({ p }) => eq(p.org, orgId))
                .orderBy(({ p }) => p.taken_at, 'desc'),
    )

    const results = useMemo<PhotoView[]>(() => {
        if (!raw) return []
        const q = debounced.trim().toLowerCase()
        if (!q) return []
        return (raw as PhotoItem[])
            .map(photoToView)
            .filter(p => {
                const name = (p.name || '').toLowerCase()
                const desc = (p.description || '').toLowerCase()
                const loc = (p.location || '').toLowerCase()
                return name.includes(q) || desc.includes(q) || loc.includes(q)
            })
    }, [raw, debounced])

    return { results, isLoading, isEmpty: !isLoading && results.length === 0 }
}
