import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { Search as SearchIcon, X } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'

import PhotoCard from '../../components/PhotoCard'
import { useSearch } from '../../hooks/useSearch'
import type { PhotoView } from '../../types'

export default function SearchScreen() {
    const [query, setQuery] = useState('')
    const { results, isLoading, isEmpty } = useSearch({ query })
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const surface = useThemeColor('surface')
    const orgHref = useOrgHref()

    const handlePhotoPress = useCallback((photo: PhotoView) => {
        router.push(orgHref(`photos/${photo.id}`))
    }, [orgHref])

    const renderItem = useCallback(({ item }: { item: PhotoView }) => (
        <View className="w-1/3 p-0.5">
            <PhotoCard photo={item} size={120} onPress={handlePhotoPress} />
        </View>
    ), [handlePhotoPress])

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            <View className="px-4 pt-3 pb-2">
                <View
                    className="flex-row items-center rounded-xl px-3 py-2"
                    style={{ backgroundColor: surface }}
                >
                    <SearchIcon size={18} color={muted} aria-hidden={true} />
                    <TextInput
                        className="flex-1 ml-2 text-base"
                        style={{ color: fg }}
                        placeholder="Search photos, people, places\u2026"
                        placeholderTextColor={muted}
                        value={query}
                        onChangeText={setQuery}
                        aria-label="Search photos"
                        returnKeyType="search"
                    />
                    {query.length > 0 && (
                        <Pressable
                            onPress={() => setQuery('')}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Clear search"
                        >
                            <X size={18} color={muted} />
                        </Pressable>
                    )}
                </View>
            </View>

            {!query ? (
                <View className="flex-1 items-center justify-center px-8">
                    <SearchIcon size={48} color={muted} aria-hidden={true} />
                    <Text style={{ color: muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                        Search by filename, description, location, or text found in photos
                    </Text>
                </View>
            ) : isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <Text style={{ color: muted }}>Searching\u2026</Text>
                </View>
            ) : isEmpty ? (
                <View className="flex-1 items-center justify-center px-8">
                    <Text style={{ color: muted, fontSize: 16, textAlign: 'center' }}>
                        No results for "{query}"
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={results}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    numColumns={3}
                    contentContainerStyle={{ padding: 4 }}
                />
            )}
        </View>
    )
}
