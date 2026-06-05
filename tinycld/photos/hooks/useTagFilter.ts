import { useCallback, useMemo, useState } from 'react'

export function useTagFilter() {
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())

    const toggleTag = useCallback((tagId: string) => {
        setSelectedTagIds(prev => {
            const next = new Set(prev)
            if (next.has(tagId)) next.delete(tagId)
            else next.add(tagId)
            return next
        })
    }, [])

    const clearTags = useCallback(() => {
        setSelectedTagIds(new Set())
    }, [])

    const isActive = useMemo(() => selectedTagIds.size > 0, [selectedTagIds])

    return {
        selectedTagIds,
        toggleTag,
        clearTags,
        isActive,
    }
}
