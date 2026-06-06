import { eq, inArray } from '@tanstack/db'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { FlatList, Text, View } from 'react-native'

import PhotoCard from '../../components/PhotoCard'
import { photoToView } from '../../hooks/usePhotos'
import type { PhotoItem, PhotosFace, PhotoView } from '../../types'

export default function PersonDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const bg = useThemeColor('background')
    const muted = useThemeColor('muted-foreground')
    const orgHref = useOrgHref()

    const [facesStore] = useStore('photos_faces')
    const [photosStore] = useStore('photos_items')

    const { data: faces, isLoading: facesLoading } = useOrgLiveQuery(
        (q, { orgId }) => q.from({ f: facesStore }).where(({ f }) => eq(f.person, id!)),
        [id]
    )

    const photoIds = useMemo(() => {
        if (!faces) return []
        return [...new Set(faces.map((f: PhotosFace) => f.photo))]
    }, [faces])

    const { data: personPhotos, isLoading: photosLoading } = useOrgLiveQuery(
        (q, { orgId }) => {
            if (photoIds.length === 0) return null
            return q
                .from({ p: photosStore })
                .where(({ p }) => eq(p.org, orgId))
                .where(({ p }) => inArray(p.id, photoIds))
        },
        [photoIds]
    )

    const filteredPhotos = useMemo<PhotoView[]>(() => {
        if (!personPhotos) return []
        const seen = new Set<string>()
        return (personPhotos as PhotoItem[])
            .filter(p => {
                if (seen.has(p.id)) return false
                seen.add(p.id)
                return true
            })
            .filter(p => !p.trashed_at)
            .map(photoToView)
    }, [personPhotos])

    const handlePhotoPress = useCallback(
        (photo: PhotoView) => {
            router.push(orgHref(`photos/${photo.id}`))
        },
        [orgHref]
    )

    const renderItem = useCallback(
        ({ item }: { item: PhotoView }) => (
            <View className="w-1/3 p-0.5">
                <PhotoCard photo={item} size={120} onPress={handlePhotoPress} />
            </View>
        ),
        [handlePhotoPress]
    )

    if (facesLoading || photosLoading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
                <Text style={{ color: muted }}>Loading\u2026</Text>
            </View>
        )
    }

    if (filteredPhotos.length === 0) {
        return (
            <View
                className="flex-1 items-center justify-center px-8"
                style={{ backgroundColor: bg }}
            >
                <Text style={{ color: muted, fontSize: 16, textAlign: 'center' }}>
                    No photos found for this person.
                </Text>
            </View>
        )
    }

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            <FlatList
                data={filteredPhotos}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                numColumns={3}
                contentContainerStyle={{ padding: 4 }}
            />
        </View>
    )
}
