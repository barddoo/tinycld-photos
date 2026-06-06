import { eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useNavigation } from 'expo-router'
import { MapPin } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { FlatList, Image, Pressable, Text, View } from 'react-native'
import type { PhotoItem } from '../../types'

interface LocationCluster {
    location: string
    lat: number
    lon: number
    photos: PhotoItem[]
    count: number
}

export default function MapScreen() {
    const navigation = useNavigation()
    const [photoStore] = useStore('photos_items')

    const { data: raw, isLoading } = useOrgLiveQuery((q, { orgId }) =>
        q
            .from({ p: photoStore })
            .where(({ p }) => eq(p.org, orgId))
            .orderBy(({ p }) => p.taken_at, 'desc')
    )

    const clusters = useMemo<LocationCluster[]>(() => {
        if (!raw) return []

        const photos = raw as PhotoItem[]
        const withLocation = photos.filter(
            p => p.latitude != null && p.longitude != null && p.location
        )

        const clusterMap = new Map<string, LocationCluster>()
        for (const photo of withLocation) {
            const loc = photo.location || 'Unknown'
            if (!clusterMap.has(loc)) {
                clusterMap.set(loc, {
                    location: loc,
                    lat: photo.latitude || 0,
                    lon: photo.longitude || 0,
                    photos: [],
                    count: 0,
                })
            }
            const cluster = clusterMap.get(loc)!
            cluster.photos.push(photo)
            cluster.count++
        }

        return Array.from(clusterMap.values()).sort((a, b) => b.count - a.count)
    }, [raw])

    const renderCluster = useCallback(({ item }: { item: LocationCluster }) => {
        const coverPhoto = item.photos[0]
        const thumbUrl = coverPhoto?.thumbnail
            ? `/api/files/photos_items/${coverPhoto.id}/${coverPhoto.thumbnail}`
            : null

        return (
            <Pressable
                className="mb-3 rounded-xl overflow-hidden"
                style={{ height: 120 }}
                onPress={() => {
                    // Navigate to album-like view filtered by location
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.location}, ${item.count} photos`}
            >
                {thumbUrl ? (
                    <Image
                        source={{ uri: thumbUrl }}
                        className="absolute inset-0"
                        resizeMode="cover"
                    />
                ) : (
                    <View className="absolute inset-0 bg-gray-300" />
                )}
                <View className="absolute inset-0 bg-black/40" />
                <View className="absolute bottom-0 left-0 right-0 p-3">
                    <View className="flex-row items-center gap-1">
                        <MapPin size={14} color="#fff" />
                        <Text className="text-white font-semibold text-base" numberOfLines={1}>
                            {item.location}
                        </Text>
                    </View>
                    <Text className="text-white/80 text-xs mt-1">
                        {item.count} photo{item.count !== 1 ? 's' : ''}
                    </Text>
                </View>
            </Pressable>
        )
    }, [])

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center">
                <Text className="text-gray-500">Loading...</Text>
            </View>
        )
    }

    if (clusters.length === 0) {
        return (
            <View className="flex-1 items-center justify-center px-8">
                <MapPin size={48} color="#9ca3af" accessibilityRole="image" />
                <Text className="text-gray-500 text-base mt-4 text-center">
                    No photos with location data yet. Photos with GPS coordinates will appear here.
                </Text>
            </View>
        )
    }

    return (
        <FlatList
            data={clusters}
            keyExtractor={item => item.location}
            renderItem={renderCluster}
            contentContainerClassName="p-4"
        />
    )
}
