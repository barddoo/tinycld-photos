import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { Users } from 'lucide-react-native'
import { useCallback } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'

import { usePeople } from '../../hooks/usePeople'
import type { PersonView } from '../../types'

export default function PeopleScreen() {
    const { people, isLoading } = usePeople()
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const surface = useThemeColor('surface')
    const orgHref = useOrgHref()

    const handlePersonPress = useCallback((id: string) => {
        router.push(orgHref(`photos/people/${id}`))
    }, [orgHref])

    const renderPerson = useCallback(({ item }: { item: PersonView }) => {
        const initial = item.name.charAt(0).toUpperCase()
        return (
            <Pressable
                onPress={() => handlePersonPress(item.id)}
                className="flex-row items-center px-4 py-3"
                style={({ pressed }: { pressed: boolean }) => ({
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: surface,
                    marginHorizontal: 12,
                    marginVertical: 3,
                    borderRadius: 12,
                })}
                accessibilityRole="button"
                accessibilityLabel={item.name}
            >
                <View
                    className="h-12 w-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: item.color || muted }}
                >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>
                        {initial}
                    </Text>
                </View>
                <View className="ml-3 flex-1">
                    <Text style={{ color: fg, fontSize: 16, fontWeight: '500' }}>
                        {item.name}
                    </Text>
                </View>
            </Pressable>
        )
    }, [fg, muted, surface, handlePersonPress])

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
                <Text style={{ color: muted }}>Loading\u2026</Text>
            </View>
        )
    }

    if (people.length === 0) {
        return (
            <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: bg }}>
                <Users size={48} color={muted} accessibilityRole="image" />
                <Text style={{ color: muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                    No people found yet. Enable ML face detection to automatically identify people in your photos.
                </Text>
            </View>
        )
    }

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            <FlatList
                data={people}
                renderItem={renderPerson}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingVertical: 8 }}
            />
        </View>
    )
}
