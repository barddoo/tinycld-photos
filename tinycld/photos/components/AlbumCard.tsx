import { useAuthedThumbnailURL } from '@tinycld/core/file-viewer/use-authed-file-url'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Image, Pressable, Text, View } from 'react-native'
import type { AlbumView, PhotoView } from '../types'

interface Props {
    album: AlbumView
    coverPhoto?: PhotoView | null
    onPress: (album: AlbumView) => void
}

const PHOTOS_COLLECTION = 'photos_items'

export default function AlbumCard({ album, coverPhoto, onPress }: Props) {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const border = useThemeColor('border')

    const source = coverPhoto
        ? {
              collectionId: PHOTOS_COLLECTION,
              recordId: coverPhoto.id,
              fileName: coverPhoto.file,
              displayName: coverPhoto.name,
              mimeType: coverPhoto.mimeType,
              size: coverPhoto.size,
              thumbnailFileName: coverPhoto.thumbnail || undefined,
          }
        : null

    const { url: thumbnailUrl } = useAuthedThumbnailURL(source ?? undefined, '400x400')

    return (
        <Pressable
            onPress={() => onPress(album)}
            className="rounded-xl overflow-hidden border"
            style={{ borderColor: border }}
            accessibilityRole="button"
            accessibilityLabel={`${album.name}, ${album.photoCount} photos`}
        >
            <View className="aspect-square bg-muted-foreground/10">
                {thumbnailUrl ? (
                    <Image
                        source={{ uri: thumbnailUrl }}
                        className="w-full h-full"
                        resizeMode="cover"
                    />
                ) : (
                    <View className="flex-1 items-center justify-center bg-muted-foreground/10">
                        <Text style={{ color: muted, fontSize: 32 }}>🖼</Text>
                    </View>
                )}
            </View>
            <View className="px-3 py-2.5 gap-0.5">
                <Text
                    numberOfLines={1}
                    style={{ color: fg, fontSize: 14, fontWeight: '500' }}
                >
                    {album.name}
                </Text>
                <Text style={{ color: muted, fontSize: 12 }}>
                    {album.photoCount} photo{album.photoCount !== 1 ? 's' : ''}
                </Text>
            </View>
        </Pressable>
    )
}
