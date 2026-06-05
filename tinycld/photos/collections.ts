import type { CoreStores } from '@tinycld/core/lib/pocketbase'
import type { Schema } from '@tinycld/core/types/pbSchema'
import type { createCollection } from 'pbtsdb/core'
import { BasicIndex } from 'pbtsdb/core'
import type { PhotosSchema } from './types'

type MergedSchema = Schema & PhotosSchema

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    core: CoreStores
) {
    const photos_items = newCollection('photos_items', {
        omitOnInsert: ['created', 'updated', 'thumbnail'] as const,
        expand: { owner: core.user_org },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const photos_albums = newCollection('photos_albums', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: { owner: core.user_org },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const photos_album_items = newCollection('photos_album_items', {
        omitOnInsert: ['created'] as const,
        expand: { album: photos_albums, photo: photos_items },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    return {
        photos_items,
        photos_albums,
        photos_album_items,
    }
}
