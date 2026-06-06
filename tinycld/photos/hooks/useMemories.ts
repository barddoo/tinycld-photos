import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import type { MemoryView, PhotoItem, PhotosMemory, PhotosMemoryItem } from '../types'
import { photoToView } from './usePhotos'

export function useMemories() {
    const [memoriesStore] = useStore('photos_memories')
    const [memoryItemsStore] = useStore('photos_memory_items')
    const [photosStore] = useStore('photos_items')

    const { data: rawMemories, isLoading: memoriesLoading } = useOrgLiveQuery((q, { orgId }) =>
        q
            .from({ m: memoriesStore })
            .where(({ m }) => eq(m.org, orgId))
            .orderBy(({ m }) => m.created, 'desc')
    )

    const { data: rawMemoryItems } = useOrgLiveQuery((q, { orgId }) =>
        q
            .from({ mi: memoryItemsStore })
            .join({ m: memoriesStore }, ({ mi, m }) => eq(mi.memory, m.id))
            .where(({ m }) => eq(m.org, orgId))
    )

    const { data: rawPhotos } = useOrgLiveQuery((q, { orgId }) =>
        q.from({ p: photosStore }).where(({ p }) => eq(p.org, orgId))
    )

    const memories = useMemo<MemoryView[]>(() => {
        if (!rawMemories) return []

        const memoryItems = (rawMemoryItems || []) as PhotosMemoryItem[]
        const photos = (rawPhotos || []) as PhotoItem[]

        const photoMap = new Map(photos.map(p => [p.id, photoToView(p)]))

        const itemsByMemory = new Map<string, string[]>()
        for (const mi of memoryItems) {
            if (!itemsByMemory.has(mi.memory)) {
                itemsByMemory.set(mi.memory, [])
            }
            itemsByMemory.get(mi.memory)!.push(mi.photo)
        }

        return (rawMemories as PhotosMemory[]).map(m => {
            const photoIds = itemsByMemory.get(m.id) || []
            const resolvedPhotos = photoIds
                .map(id => photoMap.get(id))
                .filter((p): p is NonNullable<typeof p> => p != null)

            return {
                id: m.id,
                type: m.type,
                title: m.title,
                photos: resolvedPhotos,
                createdAt: m.created || '',
            }
        })
    }, [rawMemories, rawMemoryItems, rawPhotos])

    return { memories, isLoading: memoriesLoading }
}
