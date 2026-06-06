import { StarIcon } from '@tinycld/core/components/StarIcon'
import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { Image } from 'expo-image'
import { memo, useCallback } from 'react'
import { Pressable, View } from 'react-native'
import { photoToSource } from '../lib/file-url'
import type { PhotoView } from '../types'

const s = {
    placeholder: { flex: 1 } as const,
    starBadge: { position: 'absolute' as const, top: 6, right: 6 } as const,
} as const

interface Props {
    photo: PhotoView
    size: number
    onPress: (photo: PhotoView) => void
    onLongPress?: (photo: PhotoView) => void
}

const PhotoCard = memo(function PhotoCard({ photo, size, onPress, onLongPress }: Props) {
    const source = photoToSource(photo)
    const thumbSize = `${size * 2}x${size * 2}`
    const { url: thumbnailUrl } = useAuthedThumbnailURL(source, thumbSize)

    const handlePress = useCallback(() => onPress(photo), [photo, onPress])

    const handleLongPress = useCallback(() => {
        if (onLongPress) {
            onLongPress(photo)
        }
    }, [photo, onLongPress])

    return (
        <Pressable
            onPress={handlePress}
            onLongPress={handleLongPress}
            style={{ width: size, height: size }}
            className="overflow-hidden"
            accessibilityRole="imagebutton"
            accessibilityLabel={photo.name}
        >
            {thumbnailUrl ? (
                <Image
                    source={{ uri: thumbnailUrl }}
                    style={{ width: size, height: size }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={photo.id}
                    transition={150}
                />
            ) : (
                <View
                    className="flex-1 bg-muted-foreground/10 items-center justify-center"
                    style={s.placeholder}
                />
            )}
            {photo.isFavorite ? (
                <View style={s.starBadge}>
                    <StarIcon isStarred size={14} />
                </View>
            ) : null}
        </Pressable>
    )
})

export default PhotoCard
