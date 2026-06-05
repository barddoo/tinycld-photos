import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Heart, Info, Trash2 } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { Dimensions, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { photoToSource } from '../lib/file-url'
import { usePhotoMutations } from '../hooks/usePhotoMutations'
import { usePhotos } from '../hooks/usePhotos'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export default function PhotoDetail() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const orgHref = useOrgHref()

    const { allPhotos } = usePhotos('timeline')
    const photo = useMemo(() => allPhotos.find(p => p.id === id), [allPhotos, id])
    const { toggleFavorite, trashPhoto } = usePhotoMutations(orgId, userOrgId)

    const [showInfo, setShowInfo] = useState(false)

    const source = photo ? photoToSource(photo) : undefined
    const { url: imageUrl } = useAuthedThumbnailURL(source, `${SCREEN_WIDTH * 2}x${SCREEN_HEIGHT * 2}`)

    const handleBack = useCallback(() => {
        if (router.canGoBack()) router.back()
        else router.replace(orgHref('photos'))
    }, [orgHref])

    const handleToggleInfo = useCallback(() => setShowInfo(prev => !prev), [])

    const handleToggleFavorite = useCallback(async () => {
        if (!photo) return
        await toggleFavorite(photo.id, photo.isFavorite)
    }, [photo, toggleFavorite])

    const handleTrash = useCallback(async () => {
        if (!photo) return
        await trashPhoto(photo.id)
        handleBack()
    }, [photo, trashPhoto, handleBack])

    if (!photo) {
        return (
            <View className="flex-1 bg-background items-center justify-center">
                <Text className="text-foreground">Photo not found</Text>
            </View>
        )
    }

    const takenDate = photo.takenAt
        ? new Date(photo.takenAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : 'Unknown date'

    const imageStyle = {
        width: photo.width && photo.height
            ? Math.min(SCREEN_WIDTH, (photo.width / photo.height) * SCREEN_HEIGHT)
            : SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    }

    return (
        <View className="flex-1" style={{ backgroundColor: '#000' }}>
            {imageUrl ? (
                <View className="flex-1 items-center justify-center">
                    <Image
                        source={{ uri: imageUrl }}
                        style={imageStyle}
                        resizeMode="contain"
                    />
                </View>
            ) : (
                <View className="flex-1 items-center justify-center">
                    <Text style={{ color: '#666', fontSize: 16 }}>Loading...</Text>
                </View>
            )}

            <View
                className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4 pt-12 pb-3"
                style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            >
                <Pressable onPress={handleBack} className="p-2" accessibilityRole="button" accessibilityLabel="Back">
                    <ArrowLeft size={24} color="#fff" />
                </Pressable>
                <Text
                    numberOfLines={1}
                    className="flex-1 text-center text-white font-medium mx-2"
                    style={{ fontSize: 16 }}
                >
                    {photo.name}
                </Text>
                <Pressable onPress={handleToggleInfo} className="p-2" accessibilityRole="button" accessibilityLabel="Photo info">
                    <Info size={22} color={showInfo ? '#60a5fa' : '#fff'} />
                </Pressable>
            </View>

            {showInfo && (
                <View
                    className="absolute bottom-0 left-0 right-0 px-4 py-4 pb-8"
                    style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
                >
                    <ScrollView className="max-h-60">
                        <View className="gap-2">
                            <Text className="text-white text-lg font-semibold">{photo.name}</Text>
                            <Text className="text-gray-400 text-sm">{takenDate}</Text>
                            {photo.width && photo.height ? (
                                <Text className="text-gray-400 text-sm">{photo.width} × {photo.height}</Text>
                            ) : null}
                            <Text className="text-gray-400 text-sm">{photo.mimeType}</Text>
                            <View className="flex-row gap-4 pt-2">
                                <ActionButton
                                    icon={Heart}
                                    label={photo.isFavorite ? 'Unfavorite' : 'Favorite'}
                                    onPress={handleToggleFavorite}
                                    active={photo.isFavorite}
                                />
                                <ActionButton
                                    icon={Trash2}
                                    label="Delete"
                                    onPress={handleTrash}
                                />
                            </View>
                        </View>
                    </ScrollView>
                </View>
            )}
        </View>
    )
}

function ActionButton({
    icon: Icon,
    label,
    onPress,
    active,
}: {
    icon: typeof Heart
    label: string
    onPress: () => void
    active?: boolean
}) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center gap-2 px-4 py-2 rounded-lg border border-gray-600"
            accessibilityRole="button"
        >
            <Icon size={16} color={active ? '#ef4444' : '#fff'} />
            <Text className="text-white text-sm font-medium">{label}</Text>
        </Pressable>
    )
}
