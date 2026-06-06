import { eq } from '@tanstack/db'
import { queryClient, usePocketBase, useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useCallback } from 'react'
import type { PhotoTag } from '../types'

export function useTags(orgId: string, userOrgId: string) {
    const pb = usePocketBase()
    const [tagsCollection] = useStore('photos_tags')

    const { data: tags, isLoading } = useOrgLiveQuery((query, { orgId }) =>
        query
            .from({ t: tagsCollection })
            .where(({ t }) => eq(t.org, orgId))
            .orderBy(({ t }) => t.name, 'asc')
    )

    const createTag = useCallback(
        async (name: string, color?: string) => {
            const record = await pb.collection('photos_tags').create({
                name,
                color: color || '#6366f1',
                org: orgId,
                owner: userOrgId,
            })
            await queryClient.invalidateQueries({ queryKey: ['photos_tags'] })
            return record
        },
        [pb, orgId, userOrgId]
    )

    const updateTag = useCallback(
        async (tagId: string, data: { name?: string; color?: string }) => {
            await pb.collection('photos_tags').update(tagId, data)
            await queryClient.invalidateQueries({ queryKey: ['photos_tags'] })
        },
        [pb]
    )

    const deleteTag = useCallback(
        async (tagId: string) => {
            await pb.collection('photos_tags').delete(tagId)
            await queryClient.invalidateQueries({ queryKey: ['photos_tags'] })
        },
        [pb]
    )

    return {
        tags: (tags ?? []) as PhotoTag[],
        isLoading,
        createTag,
        updateTag,
        deleteTag,
    }
}

export function usePhotoTags(photoId: string) {
    const pb = usePocketBase()
    const [itemTagsCollection] = useStore('photos_item_tags')

    const { data: itemTags } = useOrgLiveQuery(
        query => query.from({ it: itemTagsCollection }).where(({ it }) => eq(it.item, photoId)),
        [photoId]
    )

    const addTag = useCallback(
        async (tagId: string) => {
            await pb.collection('photos_item_tags').create({ item: photoId, tag: tagId })
            await queryClient.invalidateQueries({ queryKey: ['photos_item_tags'] })
        },
        [pb, photoId]
    )

    const removeTag = useCallback(
        async (itemTagId: string) => {
            await pb.collection('photos_item_tags').delete(itemTagId)
            await queryClient.invalidateQueries({ queryKey: ['photos_item_tags'] })
        },
        [pb]
    )

    return {
        itemTags: (itemTags ?? []) as { id: string; item: string; tag: string }[],
        addTag,
        removeTag,
    }
}
