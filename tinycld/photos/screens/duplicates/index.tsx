import { pb } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { CopyX, Trash2 } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, Image, Pressable, Text, View } from 'react-native'

interface DuplicateGroup {
    Photos: string[]
    Distance: number
}

interface DuplicateGroupView {
    id: string
    photos: { id: string; thumbnail?: string; name?: string }[]
    distance: number
}

export default function DuplicatesScreen() {
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const surface = useThemeColor('surface')
    const border = useThemeColor('border')
    const destructive = useThemeColor('danger')

    const [groups, setGroups] = useState<DuplicateGroupView[]>([])
    const [loading, setLoading] = useState(true)

    const fetchDuplicates = useCallback(async () => {
        try {
            const resp = await pb.send('/api/photos/ml/duplicates', { method: 'GET' })
            const data = resp as { groups: DuplicateGroup[]; count: number }
            const views: DuplicateGroupView[] = (data.groups || []).map((g, i) => ({
                id: `group-${i}`,
                photos: g.Photos.map(id => ({
                    id,
                    thumbnail: '',
                    name: '',
                })),
                distance: g.Distance,
            }))
            setGroups(views)
        } catch {
            // API not available or no duplicates
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchDuplicates()
    }, [fetchDuplicates])

    const handleDeleteGroup = useCallback(async (group: DuplicateGroupView) => {
        Alert.alert(
            'Delete Duplicates',
            `This will delete ${group.photos.length - 1} photos, keeping the first one. Continue?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const toDelete = group.photos.slice(1)
                        for (const photo of toDelete) {
                            try {
                                await pb.collection('photos_items').delete(photo.id)
                            } catch {
                                // skip
                            }
                        }
                        setGroups(prev => prev.filter(g => g.id !== group.id))
                    },
                },
            ]
        )
    }, [])

    const renderGroup = useCallback(
        ({ item }: { item: DuplicateGroupView }) => (
            <View className="mb-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <View
                    className="p-3 flex-row items-center justify-between"
                    style={{ borderBottomWidth: 0.5, borderBottomColor: border }}
                >
                    <Text style={{ color: muted, fontSize: 12 }}>
                        {item.photos.length} photos · similarity: {100 - item.distance}%
                    </Text>
                    <Pressable
                        className="flex-row items-center gap-1 px-3 py-1 rounded-lg"
                        style={{ backgroundColor: `${destructive}20` }}
                        onPress={() => handleDeleteGroup(item)}
                        accessibilityRole="button"
                        accessibilityLabel="Delete duplicates"
                    >
                        <Trash2 size={14} color={destructive} />
                        <Text style={{ color: destructive, fontSize: 12, fontWeight: '500' }}>
                            Delete extras
                        </Text>
                    </Pressable>
                </View>
                <FlatList
                    data={item.photos}
                    horizontal
                    keyExtractor={p => p.id}
                    renderItem={({ item: photo, index }) => (
                        <View
                            className="ml-2 mt-2 mb-2 rounded-lg overflow-hidden"
                            style={{ width: 100, height: 100 }}
                        >
                            {photo.thumbnail ? (
                                <Image
                                    source={{ uri: photo.thumbnail }}
                                    className="w-full h-full"
                                    resizeMode="cover"
                                />
                            ) : (
                                <View className="w-full h-full bg-gray-200 items-center justify-center">
                                    <Text style={{ color: muted, fontSize: 10 }}>
                                        {photo.name || photo.id.slice(0, 8)}
                                    </Text>
                                </View>
                            )}
                            {index === 0 && (
                                <View
                                    className="absolute top-1 left-1 px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: '#22c55e' }}
                                >
                                    <Text className="text-white text-xs font-bold">Keep</Text>
                                </View>
                            )}
                        </View>
                    )}
                    showsHorizontalScrollIndicator={false}
                />
            </View>
        ),
        [muted, surface, border, destructive, handleDeleteGroup]
    )

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
                <Text style={{ color: muted, fontSize: 14 }}>Scanning for duplicates...</Text>
            </View>
        )
    }

    if (groups.length === 0) {
        return (
            <View
                className="flex-1 items-center justify-center px-8"
                style={{ backgroundColor: bg }}
            >
                <CopyX size={48} color={muted} accessibilityRole="image" />
                <Text style={{ color: muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                    No duplicate photos found. Enable perceptual hashing to find duplicates.
                </Text>
            </View>
        )
    }

    return (
        <FlatList
            data={groups}
            keyExtractor={item => item.id}
            renderItem={renderGroup}
            contentContainerClassName="p-4"
            style={{ backgroundColor: bg }}
        />
    )
}
