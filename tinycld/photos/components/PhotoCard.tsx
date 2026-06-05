import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { StarIcon } from '@tinycld/core/components/StarIcon'
import { memo, useCallback } from 'react'
import { Alert, Image, Pressable, View } from 'react-native'
import { photoToSource } from '../lib/file-url'
import type { PhotoView } from '../types'

interface Props {
    photo: PhotoView
    size: number
    onPress: (photo: PhotoView) => void
    onLongPress?: (photo: PhotoView) => void
}

const PhotoCard = memo(function PhotoCard({ photo, size, onPress, onLongPress }: Props) {
    const { url: thumbnailUrl } = useAuthedThumbnailURL(photoToSource(photo), `${size * 2}x${size * 2}`)

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
                    resizeMode="cover"
                />
            ) : (
                <View className="flex-1 bg-muted-foreground/10 items-center justify-center" style={{ width: size, height: size }} />
            )}
            {photo.isFavorite && (
                <View className="absolute top-1.5 right-1.5">
                    <StarIcon isStarred size={14} />
                </View>
            )}
        </Pressable>
    )
})

export default PhotoCard
