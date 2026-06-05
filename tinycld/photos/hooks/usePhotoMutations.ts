import { useCallback } from 'react'
import { queryClient, usePocketBase } from '@tinycld/core/lib/pocketbase'

export function usePhotoMutations(orgId: string, userOrgId: string) {
    const pb = usePocketBase()

    const uploadPhoto = useCallback(
        async (file: File) => {
            if (!orgId || !userOrgId) return

            const formData = new FormData()
            formData.append('org', orgId)
            formData.append('owner', userOrgId)
            formData.append('name', file.name)
            formData.append('size', String(file.size))
            formData.append('file', file, file.name)
            formData.append('mime_type', file.type || 'image/jpeg')
            formData.append('taken_at', new Date().toISOString())

            const record = await pb.collection('photos_items').create(formData)
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
            return record
        },
        [pb, orgId, userOrgId]
    )

    const uploadPhotos = useCallback(
        async (files: File[]) => {
            const results = await Promise.allSettled(
                files.map(f => uploadPhoto(f))
            )
            return results
        },
        [uploadPhoto]
    )

    const toggleFavorite = useCallback(
        async (photoId: string, current: boolean) => {
            await pb.collection('photos_items').update(photoId, {
                is_favorite: !current,
            })
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
        },
        [pb]
    )

    const updateDescription = useCallback(
        async (photoId: string, description: string) => {
            await pb.collection('photos_items').update(photoId, { description })
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
        },
        [pb]
    )

    const trashPhoto = useCallback(
        async (photoId: string) => {
            await pb.collection('photos_items').update(photoId, {
                trashed_at: new Date().toISOString(),
            })
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
        },
        [pb]
    )

    const restorePhoto = useCallback(
        async (photoId: string) => {
            await pb.collection('photos_items').update(photoId, { trashed_at: null })
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
        },
        [pb]
    )

    const permanentlyDelete = useCallback(
        async (photoId: string) => {
            await pb.collection('photos_items').delete(photoId)
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
        },
        [pb]
    )

    return {
        uploadPhoto,
        uploadPhotos,
        toggleFavorite,
        updateDescription,
        trashPhoto,
        restorePhoto,
        permanentlyDelete,
    }
}
