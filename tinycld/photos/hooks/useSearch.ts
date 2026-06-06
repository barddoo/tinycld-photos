import { eq } from '@tanstack/db'
import { pb, useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PhotoItem, PhotoView } from '../types'
import { photoToView } from '../lib/photo-utils'
import { filterPhotosByText, mergeSearchResults } from '../lib/search-utils'
import type { SemanticSearchResult } from '../lib/search-utils'

interface UseSearchOptions {
    query: string
    debounceMs?: number
}

type SemanticResult = SemanticSearchResult

export function useSearch({ query, debounceMs = 300 }: UseSearchOptions) {
    const [debounced, setDebounced] = useState('')
    const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([])
    const [isSemanticSearching, setIsSemanticSearching] = useState(false)
    const [photoStore] = useStore('photos_items')
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(query), debounceMs)
        return () => clearTimeout(timer)
    }, [query, debounceMs])

    const { data: raw, isLoading } = useOrgLiveQuery((q, { orgId }) =>
        q
            .from({ p: photoStore })
            .where(({ p }) => eq(p.org, orgId))
            .orderBy(({ p }) => p.taken_at, 'desc')
    )

    const ftsResults = useMemo<PhotoView[]>(() => {
        if (!raw) return []
        return filterPhotosByText((raw as PhotoItem[]).map(photoToView), debounced)
    }, [raw, debounced])

    const searchSemantic = useCallback(async (q: string) => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setIsSemanticSearching(true)
        try {
            const resp = await pb.send('/api/photos/ml/search', {
                method: 'POST',
                body: { query: q, topK: 20 },
                signal: controller.signal,
            })
            if (controller.signal.aborted) return
            const results = (resp as { results: SemanticResult[] }).results || []
            setSemanticResults(results)
        } catch {
            if (!controller.signal.aborted) {
                setSemanticResults([])
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsSemanticSearching(false)
            }
        }
    }, [])

    useEffect(() => {
        const q = debounced.trim()
        if (!q || q.length < 2) {
            setSemanticResults([])
            return
        }
        searchSemantic(q)
    }, [debounced, searchSemantic])

    const mergedResults = useMemo<PhotoView[]>(() => {
        if (!raw) return ftsResults
        const allPhotos = (raw as PhotoItem[]).map(photoToView)
        return mergeSearchResults(allPhotos, semanticResults, ftsResults)
    }, [raw, semanticResults, ftsResults])

    return {
        results: mergedResults,
        isLoading: isLoading || isSemanticSearching,
        isEmpty: !isLoading && !isSemanticSearching && mergedResults.length === 0,
    }
}
