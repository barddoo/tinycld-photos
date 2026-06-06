import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Album, Download, Heart, Pencil, Trash2, X } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import type { PhotoView } from '../types'

interface Props {
    photo: PhotoView
    onClose: () => void
    onToggleFavorite: (photoId: string, current: boolean) => void
    onTrash: (photoId: string) => void
    onDownload: (photo: PhotoView) => void
    onAddToAlbum: (photoId: string) => void
    onUpdateDescription: (photoId: string, description: string) => void
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

export default function PhotoInfoSheet({
    photo,
    onClose,
    onToggleFavorite,
    onTrash,
    onDownload,
    onAddToAlbum,
    onUpdateDescription,
}: Props) {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const border = useThemeColor('border')
    const danger = useThemeColor('danger')
    const [editing, setEditing] = useState(false)
    const [description, setDescription] = useState(photo.description)

    const handleSaveDescription = useCallback(() => {
        onUpdateDescription(photo.id, description)
        setEditing(false)
    }, [photo.id, description, onUpdateDescription])

    const takenDate = photo.takenAt
        ? new Date(photo.takenAt).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : 'Unknown date'

    return (
        <View className="flex-1 bg-background">
            <View
                className="flex-row items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: border }}
            >
                <Text style={{ color: fg, fontSize: 17, fontWeight: '600' }}>Info</Text>
                <Pressable
                    onPress={onClose}
                    className="p-2"
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                >
                    <X size={20} color={fg} />
                </Pressable>
            </View>

            <ScrollView className="flex-1 px-4 py-4">
                <View className="gap-4">
                    <InfoRow label="Date" value={takenDate} />
                    <InfoRow
                        label="Dimensions"
                        value={
                            photo.width && photo.height
                                ? `${photo.width} × ${photo.height}`
                                : 'Unknown'
                        }
                    />
                    <InfoRow label="Size" value={formatBytes(photo.size)} />
                    <InfoRow label="Type" value={photo.mimeType} />
                    <InfoRow label="Name" value={photo.name} />

                    <View className="pt-2">
                        <View className="flex-row items-center justify-between mb-2">
                            <Text style={{ color: muted, fontSize: 12, fontWeight: '500' }}>
                                DESCRIPTION
                            </Text>
                            {!editing && (
                                <Pressable
                                    onPress={() => setEditing(true)}
                                    className="p-1"
                                    accessibilityRole="button"
                                >
                                    <Pencil size={14} color={muted} />
                                </Pressable>
                            )}
                        </View>
                        {editing ? (
                            <View className="gap-2">
                                <TextInput
                                    value={description}
                                    onChangeText={setDescription}
                                    multiline
                                    className="border rounded-lg px-3 py-2 text-foreground"
                                    style={{
                                        borderColor: border,
                                        color: fg,
                                        fontSize: 14,
                                        minHeight: 80,
                                        textAlignVertical: 'top',
                                    }}
                                    placeholder="Add a description..."
                                    placeholderTextColor={muted}
                                />
                                <View className="flex-row gap-2">
                                    <Pressable
                                        onPress={handleSaveDescription}
                                        className="px-4 py-2 rounded-lg"
                                        style={{ backgroundColor: border }}
                                        accessibilityRole="button"
                                    >
                                        <Text
                                            style={{ color: fg, fontSize: 13, fontWeight: '500' }}
                                        >
                                            Save
                                        </Text>
                                    </Pressable>
                                    <Pressable
                                        onPress={() => {
                                            setEditing(false)
                                            setDescription(photo.description)
                                        }}
                                        className="px-4 py-2 rounded-lg"
                                        accessibilityRole="button"
                                    >
                                        <Text style={{ color: muted, fontSize: 13 }}>Cancel</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>
                                {photo.description || 'No description'}
                            </Text>
                        )}
                    </View>
                </View>
            </ScrollView>

            <View
                className="flex-row items-center justify-around px-4 py-3 border-t gap-2"
                style={{ borderColor: border }}
            >
                <ActionButton
                    icon={Heart}
                    label={photo.isFavorite ? 'Unfavorite' : 'Favorite'}
                    onPress={() => onToggleFavorite(photo.id, photo.isFavorite)}
                    color={photo.isFavorite ? danger : fg}
                />
                <ActionButton
                    icon={Album}
                    label="Album"
                    onPress={() => onAddToAlbum(photo.id)}
                    color={fg}
                />
                <ActionButton
                    icon={Download}
                    label="Download"
                    onPress={() => onDownload(photo)}
                    color={fg}
                />
                <ActionButton
                    icon={Trash2}
                    label="Trash"
                    onPress={() => onTrash(photo.id)}
                    color={fg}
                />
            </View>
        </View>
    )
}

function InfoRow({ label, value }: { label: string; value: string }) {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    return (
        <View className="flex-row justify-between items-start">
            <Text style={{ color: muted, fontSize: 12, fontWeight: '500', width: 100 }}>
                {label}
            </Text>
            <Text style={{ color: fg, fontSize: 14, flex: 1, textAlign: 'right' }}>{value}</Text>
        </View>
    )
}

function ActionButton({
    icon: Icon,
    label,
    onPress,
    color,
}: {
    icon: typeof Heart
    label: string
    onPress: () => void
    color: string
}) {
    return (
        <Pressable
            onPress={onPress}
            className="items-center gap-1 px-3 py-2"
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Icon size={22} color={color} />
            <Text style={{ color, fontSize: 11 }}>{label}</Text>
        </Pressable>
    )
}
