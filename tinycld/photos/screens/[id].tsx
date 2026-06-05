import { useAuthedFileURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { getFileToken } from '@tinycld/core/file-viewer/use-authed-file-url'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { router, useLocalSearchParams } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { ArrowLeft, BookmarkPlus, Download, Heart, Info, MapPin, Play, Share2, Trash2, X, RotateCcw } from 'lucide-react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS, withTiming } from 'react-native-reanimated'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Dimensions, FlatList, Image, Linking, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { photoToSource } from '../lib/file-url'
import { useAlbumMutations } from '../hooks/useAlbumMutations'
import { useAlbums } from '../hooks/useAlbums'
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
    const { toggleFavorite, trashPhoto, restorePhoto, permanentlyDelete, updateDescription } = usePhotoMutations(orgId, userOrgId)
    const { albums } = useAlbums()
    const { addPhotoToAlbum } = useAlbumMutations(orgId, userOrgId)

    const [showInfo, setShowInfo] = useState(false)
    const [showAlbumPicker, setShowAlbumPicker] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)

    const handleBack = useCallback(() => {
        if (router.canGoBack()) router.back()
        else router.replace(orgHref('photos'))
    }, [orgHref])

    const handleToggleInfo = useCallback(() => {
        setShowInfo(prev => !prev)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }, [])

    const handleToggleFavorite = useCallback(async () => {
        if (!photo) return
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        await toggleFavorite(photo.id, photo.isFavorite)
    }, [photo, toggleFavorite])

    const handleTrash = useCallback(async () => {
        if (!photo) return
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await trashPhoto(photo.id)
        handleBack()
    }, [photo, trashPhoto, handleBack])

    const handleRestore = useCallback(async () => {
        if (!photo) return
        await restorePhoto(photo.id)
        handleBack()
    }, [photo, restorePhoto, handleBack])

    const handlePermanentDelete = useCallback(async () => {
        if (!photo) return
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await permanentlyDelete(photo.id)
        handleBack()
    }, [photo, permanentlyDelete, handleBack])

    const handleDownload = useCallback(async () => {
        if (!photo) return
        setIsDownloading(true)
        try {
            const token = await getFileToken()
            if (!token) return
            const url = buildAuthedFileURL(photo, token)
            if (Platform.OS === 'web') {
                const a = document.createElement('a')
                a.href = url
                a.download = photo.name
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
            } else {
                await Linking.openURL(url)
            }
        } finally {
            setIsDownloading(false)
        }
    }, [photo])

    const handleShare = useCallback(async () => {
        if (!photo) return
        const source = photoToSource(photo)
        const token = await getFileToken()
        if (!token) return
        const url = buildAuthedFileURL(photo, token)
        try {
            await Share.share({
                title: photo.name,
                url,
                message: photo.description || undefined,
            })
        } catch {
            // share cancelled
        }
    }, [photo])

    const onMomentumEnd = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
        const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
        setActiveIndex(index)
    }, [])

    const preloadAdjacent = useCallback(() => {
        const indices = [activeIndex - 1, activeIndex + 1].filter(i => i >= 0 && i < allPhotos.length)
        for (const i of indices) {
            const p = allPhotos[i]
            if (p) {
                const src = photoToSource(p)
                prefetchImage(src, `${SCREEN_WIDTH * 2}x${SCREEN_HEIGHT * 2}`)
            }
        }
    }, [activeIndex, allPhotos])

    useEffect(() => {
        preloadAdjacent()
    }, [activeIndex, preloadAdjacent])

    useEffect(() => {
        if (Platform.OS !== 'web') return

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleBack()
            else if (e.key === 'ArrowRight' && activeIndex < allPhotos.length - 1) {
                flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true })
                setActiveIndex(activeIndex + 1)
            } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
                flatListRef.current?.scrollToIndex({ index: activeIndex - 1, animated: true })
                setActiveIndex(activeIndex - 1)
            } else if (e.key === ' ' || e.key === 'f') {
                e.preventDefault()
                handleToggleFavorite()
            } else if (e.key === 'i') {
                handleToggleInfo()
            }
        }

        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [activeIndex, allPhotos.length, handleBack, handleToggleFavorite, handleToggleInfo])

    const renderPhoto = useCallback(({ item }: { item: PhotoView }) => {
        if (item.type === 'video') {
            return <VideoPlayerInline photo={item} />
        }
        return (
            <ZoomableImage
                photo={item}
                onZoomChange={setScrollEnabled}
                onTap={handleToggleInfo}
                onSwipeDown={handleBack}
                onSwipeUp={handleToggleFavorite}
            />
        )
    }, [handleToggleInfo, handleBack, handleToggleFavorite, setScrollEnabled])

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
                    (data: ArrayLike<PhotoView> | null | undefined, index: number) => ({
                        length: SCREEN_WIDTH,
                        offset: SCREEN_WIDTH * index,
                        index,
                    }),
                    []
                )}
                keyExtractor={useCallback((p: PhotoView) => p.id, [])}
                renderItem={renderPhoto}
                maxToRenderPerBatch={5}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
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
                <RichInfoOverlay
                    photo={photo}
                    onClose={() => setShowInfo(false)}
                    onToggleFavorite={handleToggleFavorite}
                    onTrash={handleTrash}
                    onRestore={handleRestore}
                    onPermanentDelete={handlePermanentDelete}
                    onDownload={handleDownload}
                    onShare={handleShare}
                    onUpdateDescription={(desc) => updateDescription(photo.id, desc)}
                    onAddToAlbum={() => setShowAlbumPicker(true)}
                    isDownloading={isDownloading}
                />
            )}

            {showAlbumPicker && photo && (
                <AlbumPickerModal
                    albums={albums}
                    photoId={photo.id}
                    onAdd={async (albumId) => {
                        await addPhotoToAlbum(albumId, photo.id)
                        setShowAlbumPicker(false)
                    }}
                    onClose={() => setShowAlbumPicker(false)}
                />
            )}
        </View>
    )
}

function ZoomableImage({
    photo,
    onZoomChange,
    onTap,
    onSwipeDown,
    onSwipeUp,
}: {
    photo: PhotoView
    onZoomChange: (zoomed: boolean) => void
    onTap: () => void
    onSwipeDown: () => void
    onSwipeUp: () => void
}) {
    const scale = useSharedValue(1)
    const savedScale = useSharedValue(1)
    const translateX = useSharedValue(0)
    const translateY = useSharedValue(0)
    const savedTranslateX = useSharedValue(0)
    const savedTranslateY = useSharedValue(0)
    const isPinching = useSharedValue(false)

    const source = useMemo(() => photoToSource(photo), [photo])
    const { url: thumbUrl, isLoading: thumbLoading } = useAuthedThumbnailURL(source, `${SCREEN_WIDTH * 2}x${SCREEN_HEIGHT * 2}`)
    const { url: fullUrl } = useAuthedFileURL(source)

    const [imageLoaded, setImageLoaded] = useState(false)
    const [useFullRes, setUseFullRes] = useState(false)

    const handleZoomChange = useCallback((zoomed: boolean) => {
        onZoomChange(!zoomed)
        if (zoomed) {
            setUseFullRes(true)
        }
    }, [onZoomChange])

    const handleSwipeDown = useCallback(() => {
        onSwipeDown()
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }, [onSwipeDown])

    const handleSwipeUp = useCallback(() => {
        onSwipeUp()
    }, [onSwipeUp])

    const handleTap = useCallback(() => {
        if (scale.value <= 1.05) {
            runOnJS(onTap)()
        }
    }, [onTap, scale])

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            isPinching.value = true
            savedScale.value = scale.value
        })
        .onUpdate((e) => {
            const newScale = Math.max(1, Math.min(8, savedScale.value * e.scale))
            scale.value = newScale
        })
        .onEnd(() => {
            isPinching.value = false
            if (scale.value <= 1.1) {
                scale.value = withSpring(1)
                translateX.value = withSpring(0)
                translateY.value = withSpring(0)
                runOnJS(handleZoomChange)(false)
            } else {
                runOnJS(handleZoomChange)(true)
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        })

    const panGesture = Gesture.Pan()
        .minPointers(1)
        .onStart(() => {
            savedTranslateX.value = translateX.value
            savedTranslateY.value = translateY.value
        })
        .onUpdate((e) => {
            if (scale.value > 1.1) {
                const maxOffset = (scale.value - 1) * SCREEN_WIDTH / 2
                translateX.value = Math.max(-maxOffset, Math.min(maxOffset, savedTranslateX.value + e.translationX))
                const maxOffsetY = (scale.value - 1) * SCREEN_HEIGHT / 2
                translateY.value = Math.max(-maxOffsetY, Math.min(maxOffsetY, savedTranslateY.value + e.translationY))
            } else {
                translateX.value = e.translationX
                translateY.value = e.translationY
            }
        })
        .onEnd((e) => {
            if (scale.value <= 1.1) {
                if (e.translationY < -80 && Math.abs(e.translationX) < 50) {
                    runOnJS(handleSwipeUp)()
                } else if (e.translationY > 100 && Math.abs(e.translationX) < 50) {
                    runOnJS(handleSwipeDown)()
                } else {
                    translateX.value = withSpring(0)
                    translateY.value = withSpring(0)
                }
            } else {
                translateX.value = withSpring(translateX.value)
                translateY.value = withSpring(translateY.value)
            }
        })

    const tapGesture = Gesture.Tap()
        .maxDuration(250)
        .onEnd(() => {
            runOnJS(handleTap)()
        })

    const composed = Gesture.Race(tapGesture, Gesture.Simultaneous(pinchGesture, panGesture))

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }))

    const displayUrl = useFullRes && fullUrl ? fullUrl : thumbUrl

    if (thumbLoading || !thumbUrl) {
        return (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#666" />
            </View>
        )
    }

    return (
        <GestureDetector gesture={composed}>
            <Animated.View style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }]}>
                <Animated.Image
                    source={{ uri: displayUrl }}
                    style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }, animatedStyle]}
                    resizeMode="contain"
                    onLoad={() => setImageLoaded(true)}
                />
            </Animated.View>
        </GestureDetector>
    )
}

function RichInfoOverlay({
    photo,
    onClose,
    onToggleFavorite,
    onTrash,
    onRestore,
    onPermanentDelete,
    onDownload,
    onShare,
    onUpdateDescription,
    onAddToAlbum,
    isDownloading,
}: {
    photo: PhotoView
    onClose: () => void
    onToggleFavorite: () => void
    onTrash: () => void
    onRestore: () => void
    onPermanentDelete: () => void
    onDownload: () => void
    onShare: () => void
    onUpdateDescription: (desc: string) => void
    onAddToAlbum: () => void
    isDownloading: boolean
}) {
    const [editingDesc, setEditingDesc] = useState(false)
    const [descDraft, setDescDraft] = useState(photo.description || '')
    const isTrashed = !!photo.trashedAt

    const takenDate = photo.takenAt
        ? new Date(photo.takenAt).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : 'Unknown date'

    const handleSaveDesc = useCallback(() => {
        onUpdateDescription(descDraft)
        setEditingDesc(false)
    }, [descDraft, onUpdateDescription])

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
    }

    return (
        <View
            className="absolute bottom-0 left-0 right-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.9)', maxHeight: SCREEN_HEIGHT * 0.65 }}
        >
            <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Info</Text>
                <Pressable onPress={onClose} className="p-2" accessibilityRole="button" accessibilityLabel="Close">
                    <X size={20} color="#fff" />
                </Pressable>
            </View>

            <ScrollView className="px-4 pb-4" style={{ maxHeight: SCREEN_HEIGHT * 0.5 }}>
                <View className="gap-3">
                    <Text className="text-white text-lg font-semibold">{photo.name}</Text>
                    <Text className="text-gray-400 text-sm">{takenDate}</Text>

                    <View className="flex-row flex-wrap gap-x-6 gap-y-1">
                        <Text className="text-gray-400 text-sm">{photo.width} × {photo.height}</Text>
                        <Text className="text-gray-400 text-sm">{formatBytes(photo.size)}</Text>
                        <Text className="text-gray-400 text-sm">{photo.mimeType}</Text>
                    </View>

                    {(photo.cameraMake || photo.cameraModel || photo.iso || photo.aperture || photo.focalLength || photo.lensModel) ? (
                        <View className="pt-1 border-t border-gray-700/50">
                            <Text style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Camera</Text>
                            <View className="flex-row flex-wrap gap-x-6 gap-y-1">
                                {photo.cameraMake || photo.cameraModel ? (
                                    <Text className="text-gray-300 text-sm">
                                        {photo.cameraMake} {photo.cameraModel}
                                    </Text>
                                ) : null}
                                {photo.lensModel ? (
                                    <Text className="text-gray-300 text-sm">{photo.lensModel}</Text>
                                ) : null}
                                {photo.iso > 0 ? (
                                    <Text className="text-gray-300 text-sm">ISO {photo.iso}</Text>
                                ) : null}
                                {photo.aperture ? (
                                    <Text className="text-gray-300 text-sm">{photo.aperture}</Text>
                                ) : null}
                                {photo.focalLength ? (
                                    <Text className="text-gray-300 text-sm">{photo.focalLength}</Text>
                                ) : null}
                            </View>
                        </View>
                    ) : null}

                    {photo.location ? (
                        <View className="flex-row items-center gap-1.5">
                            <MapPin size={14} color="#9ca3af" />
                            <Text className="text-gray-300 text-sm">{photo.location}</Text>
                        </View>
                    ) : null}

                    <View className="pt-1">
                        <View className="flex-row items-center justify-between">
                            <Text style={{ color: '#9ca3af', fontSize: 12 }}>Description</Text>
                            <Pressable onPress={() => setEditingDesc(!editingDesc)}>
                                <Text style={{ color: '#60a5fa', fontSize: 12 }}>{editingDesc ? 'Cancel' : 'Edit'}</Text>
                            </Pressable>
                        </View>
                        {editingDesc ? (
                            <View className="mt-1 gap-2">
                                <TextInput
                                    value={descDraft}
                                    onChangeText={setDescDraft}
                                    multiline
                                    placeholder="Add a description..."
                                    placeholderTextColor="#666"
                                    className="rounded-lg px-3 py-2 text-white text-sm"
                                    style={{ backgroundColor: '#333', minHeight: 60 }}
                                />
                                <Pressable
                                    onPress={handleSaveDesc}
                                    className="self-end px-3 py-1.5 rounded-lg"
                                    style={{ backgroundColor: '#60a5fa' }}
                                >
                                    <Text className="text-white text-xs font-medium">Save</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <Text className="text-gray-300 text-sm mt-0.5">
                                {photo.description || 'No description'}
                            </Text>
                        )}
                    </View>

                    <View className="flex-row flex-wrap gap-3 pt-2">
                        {isTrashed ? (
                            <>
                                <ActionButton
                                    icon={RotateCcw}
                                    label="Restore"
                                    onPress={onRestore}
                                />
                                <ActionButton
                                    icon={Trash2}
                                    label="Delete permanently"
                                    onPress={onPermanentDelete}
                                    danger
                                />
                            </>
                        ) : (
                            <>
                                <ActionButton
                                    icon={Heart}
                                    label={photo.isFavorite ? 'Unfavorite' : 'Favorite'}
                                    onPress={onToggleFavorite}
                                    active={photo.isFavorite}
                                />
                                <ActionButton
                                    icon={BookmarkPlus}
                                    label="Add to Album"
                                    onPress={onAddToAlbum}
                                />
                                <ActionButton
                                    icon={Download}
                                    label={isDownloading ? 'Downloading...' : 'Download'}
                                    onPress={onDownload}
                                    disabled={isDownloading}
                                />
                                <ActionButton
                                    icon={Share2}
                                    label="Share"
                                    onPress={onShare}
                                />
                                <ActionButton
                                    icon={Trash2}
                                    label="Delete"
                                    onPress={onTrash}
                                    danger
                                />
                            </>
                        )}
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}

function AlbumPickerModal({
    albums,
    photoId,
    onAdd,
    onClose,
}: {
    albums: { id: string; name: string }[]
    photoId: string
    onAdd: (albumId: string) => void
    onClose: () => void
}) {
    return (
        <Modal visible transparent animationType="fade">
            <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <View className="w-full max-w-sm rounded-xl p-5 gap-3" style={{ backgroundColor: '#1c1c1e' }}>
                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Add to Album</Text>
                    <ScrollView className="max-h-64">
                        {albums.map(album => (
                            <Pressable
                                key={album.id}
                                onPress={() => onAdd(album.id)}
                                className="py-3 px-2 rounded-lg border-b border-gray-700/50"
                                accessibilityRole="button"
                            >
                                <Text style={{ color: '#fff', fontSize: 15 }}>{album.name}</Text>
                            </Pressable>
                        ))}
                        {albums.length === 0 && (
                            <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', paddingVertical: 12 }}>
                                No albums yet
                            </Text>
                        )}
                    </ScrollView>
                    <Pressable onPress={onClose} className="self-end px-4 py-2">
                        <Text style={{ color: '#9ca3af', fontSize: 14 }}>Cancel</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    )
}

function VideoPlayerInline({ photo }: { photo: PhotoView }) {
    const source = useMemo(() => photoToSource(photo), [photo])
    const { url: videoUrl, isLoading } = useAuthedFileURL(source)
    const { url: thumbUrl } = useAuthedThumbnailURL(source, `${SCREEN_WIDTH * 2}x${SCREEN_HEIGHT * 2}`)

    const [isPlaying, setIsPlaying] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handlePlay = useCallback(() => {
        if (videoUrl) {
            if (Platform.OS === 'web') {
                setIsPlaying(true)
            } else {
                Linking.openURL(videoUrl)
            }
        }
    }, [videoUrl])

    const handleToggleControls = useCallback(() => {
        setShowControls(prev => !prev)
        if (controlsTimer.current) clearTimeout(controlsTimer.current)
        if (!showControls) {
            controlsTimer.current = setTimeout(() => setShowControls(false), 3000)
        }
    }, [showControls])

    const formatDuration = (ms: number) => {
        const totalSec = Math.floor(ms / 1000)
        const min = Math.floor(totalSec / 60)
        const sec = totalSec % 60
        return `${min}:${sec.toString().padStart(2, '0')}`
    }

    if (isLoading || !videoUrl) {
        return (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                {thumbUrl ? (
                    <Image source={{ uri: thumbUrl }} style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} resizeMode="contain" />
                ) : null}
                <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute' }} />
            </View>
        )
    }

    if (Platform.OS === 'web' && isPlaying) {
        return (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' }} onTouchStart={handleToggleControls}>
                {/* biome-ignore lint/a11y/useMediaCaption: user uploaded content */}
                <video
                    src={videoUrl}
                    controls={showControls}
                    autoPlay
                    style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, objectFit: 'contain' }}
                    onClick={handleToggleControls}
                />
            </View>
        )
    }

    return (
        <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' }}>
            {thumbUrl ? (
                <Image
                    source={{ uri: thumbUrl }}
                    style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                    resizeMode="contain"
                />
            ) : null}

            <Pressable
                onPress={handlePlay}
                className="absolute inset-0 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Play video"
            >
                <View className="w-20 h-20 rounded-full bg-black/50 items-center justify-center">
                    <Play size={36} color="#fff" fill="#fff" />
                </View>
            </Pressable>

            {photo.duration > 0 && (
                <View className="absolute bottom-4 right-4 bg-black/70 rounded-lg px-2 py-1">
                    <Text className="text-white text-sm font-medium">{formatDuration(photo.duration)}</Text>
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
    disabled,
    danger,
}: {
    icon: typeof Heart
    label: string
    onPress: () => void
    active?: boolean
    disabled?: boolean
    danger?: boolean
}) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center gap-2 px-4 py-2 rounded-lg border border-gray-600"
            accessibilityRole="button"
            disabled={disabled}
            style={disabled ? { opacity: 0.5 } : undefined}
        >
            <Icon size={16} color={active ? '#ef4444' : danger ? '#ef4444' : '#fff'} />
            <Text className="text-white text-sm font-medium">{label}</Text>
        </Pressable>
    )
}

function buildAuthedFileURL(photo: PhotoView, token: string): string {
    const { pb } = require('@tinycld/core/lib/pocketbase')
    return pb.files.getURL(
        { collectionId: 'photos_items', id: photo.id },
        photo.file,
        { token }
    )
}

function prefetchImage(source: { collectionId: string; recordId: string; fileName: string }, size: string) {
    const { pb } = require('@tinycld/core/lib/pocketbase')
    if (!pb.authStore.isValid) return
    const token = pb.files.getToken?.()
    if (!token) return
    const url = pb.files.getURL(
        { collectionId: source.collectionId, id: source.recordId },
        source.fileName,
        { token }
    )
    if (Platform.OS === 'web') {
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.href = url
        document.head.appendChild(link)
    }
    // Native: Image.prefetch
    Image.prefetch(url)
}
