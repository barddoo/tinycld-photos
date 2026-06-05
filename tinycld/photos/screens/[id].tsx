import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { router, useLocalSearchParams } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { ArrowLeft, Heart, Info, Trash2 } from 'lucide-react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Dimensions, FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { photoToSource } from '../lib/file-url'
import { usePhotoMutations } from '../hooks/usePhotoMutations'
import { usePhotos } from '../hooks/usePhotos'
import type { PhotoView } from '../types'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export default function PhotoDetail() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const orgHref = useOrgHref()

    const { allPhotos } = usePhotos('timeline')
    const initialIndex = useMemo(() => allPhotos.findIndex(p => p.id === id), [allPhotos, id])
    const [activeIndex, setActiveIndex] = useState(Math.max(0, initialIndex))
    const [scrollEnabled, setScrollEnabled] = useState(true)
    const flatListRef = useRef<FlatList<PhotoView>>(null)

    const photo = allPhotos[activeIndex]
    const { toggleFavorite, trashPhoto } = usePhotoMutations(orgId, userOrgId)

    const [showInfo, setShowInfo] = useState(false)

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

    const onMomentumEnd = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
        setActiveIndex(index)
    }, [])

    const renderPhoto = useCallback(({ item }: { item: PhotoView }) => {
        return (
            <ZoomableImage
                photo={item}
                onZoomChange={setScrollEnabled}
                onTap={handleToggleInfo}
                onSwipeDown={handleBack}
            />
        )
    }, [handleToggleInfo, handleBack, setScrollEnabled])

    return (
        <View className="flex-1" style={{ backgroundColor: '#000' }}>
            <FlatList<PhotoView>
                ref={flatListRef}
                data={allPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEnabled={scrollEnabled}
                onMomentumScrollEnd={onMomentumEnd}
                initialScrollIndex={Math.max(0, initialIndex)}
                getItemLayout={useCallback(
                    (_: any, index: number) => ({
                        length: SCREEN_WIDTH,
                        offset: SCREEN_WIDTH * index,
                        index,
                    }),
                    []
                )}
                keyExtractor={useCallback((p: PhotoView) => p.id, [])}
                renderItem={renderPhoto}
                maxToRenderPerBatch={3}
                windowSize={3}
            />

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
                    {photo?.name ?? ''}
                </Text>
                <Pressable onPress={handleToggleInfo} className="p-2" accessibilityRole="button" accessibilityLabel="Photo info">
                    <Info size={22} color={showInfo ? '#60a5fa' : '#fff'} />
                </Pressable>
            </View>

            {showInfo && photo && (
                <InfoOverlay photo={photo} onToggleFavorite={handleToggleFavorite} onTrash={handleTrash} />
            )}
        </View>
    )
}

function ZoomableImage({
    photo,
    onZoomChange,
    onTap,
    onSwipeDown,
}: {
    photo: PhotoView
    onZoomChange: (zoomed: boolean) => void
    onTap: () => void
    onSwipeDown: () => void
}) {
    const scale = useSharedValue(1)
    const savedScale = useSharedValue(1)
    const translateX = useSharedValue(0)
    const translateY = useSharedValue(0)
    const savedTranslateX = useSharedValue(0)
    const savedTranslateY = useSharedValue(0)

    const source = useMemo(() => photoToSource(photo), [photo])
    const { url: imageUrl } = useAuthedThumbnailURL(source, `${SCREEN_WIDTH * 2}x${SCREEN_HEIGHT * 2}`)

    const handleZoomChange = useCallback((zoomed: boolean) => {
        onZoomChange(!zoomed)
    }, [onZoomChange])

    const handleSwipeDown = useCallback(() => {
        onSwipeDown()
    }, [onSwipeDown])

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            savedScale.value = scale.value
        })
        .onUpdate((e) => {
            const newScale = Math.max(1, Math.min(5, savedScale.value * e.scale))
            scale.value = newScale
        })
        .onEnd(() => {
            if (scale.value <= 1) {
                scale.value = withSpring(1)
                translateX.value = withSpring(0)
                translateY.value = withSpring(0)
                runOnJS(handleZoomChange)(false)
            } else {
                runOnJS(handleZoomChange)(true)
            }
        })

    const panGesture = Gesture.Pan()
        .minPointers(1)
        .onStart(() => {
            savedTranslateX.value = translateX.value
            savedTranslateY.value = translateY.value
        })
        .onUpdate((e) => {
            if (scale.value > 1) {
                translateX.value = savedTranslateX.value + e.translationX
                translateY.value = savedTranslateY.value + e.translationY
            } else {
                translateX.value = e.translationX
                translateY.value = e.translationY
            }
        })
        .onEnd((e) => {
            if (scale.value <= 1) {
                if (e.translationY > 100) {
                    runOnJS(handleSwipeDown)()
                }
                translateX.value = withSpring(0)
                translateY.value = withSpring(0)
            } else {
                translateX.value = withSpring(translateX.value)
                translateY.value = withSpring(translateY.value)
            }
        })

    const tapGesture = Gesture.Tap()
        .onEnd(() => {
            runOnJS(onTap)()
        })

    const composed = Gesture.Simultaneous(pinchGesture, panGesture)

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }))

    if (!imageUrl) {
        return (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#666', fontSize: 16 }}>Loading...</Text>
            </View>
        )
    }

    return (
        <GestureDetector gesture={composed}>
            <Animated.View style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }]}>
                <GestureDetector gesture={tapGesture}>
                    <Animated.Image
                        source={{ uri: imageUrl }}
                        style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }, animatedStyle]}
                        resizeMode="contain"
                    />
                </GestureDetector>
            </Animated.View>
        </GestureDetector>
    )
}

function InfoOverlay({
    photo,
    onToggleFavorite,
    onTrash,
}: {
    photo: PhotoView
    onToggleFavorite: () => void
    onTrash: () => void
}) {
    const takenDate = photo.takenAt
        ? new Date(photo.takenAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : 'Unknown date'

    return (
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
                            onPress={onToggleFavorite}
                            active={photo.isFavorite}
                        />
                        <ActionButton
                            icon={Trash2}
                            label="Delete"
                            onPress={onTrash}
                        />
                    </View>
                </View>
            </ScrollView>
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
