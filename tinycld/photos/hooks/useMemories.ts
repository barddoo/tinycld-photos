import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { MemoryView, PhotosMemory } from '../types'

export function useMemories() {
    const [memoriesStore] = useStore('photos_memories')

    const { data: raw, isLoading } = useOrgLiveQuery(
        (q, { orgId }) =>
            q
                .from({ m: memoriesStore })
                .orderBy(({ m }) => m.created, 'desc'),
    )

    const memories = useMemo<MemoryView[]>(() => {
        if (!raw) return []
        return raw.map((m: PhotosMemory) => ({
            id: m.id,
            type: m.type,
            title: m.title,
            photos: [],
            createdAt: m.created || '',
        }))
    }, [raw])

    return { memories, isLoading }
}
