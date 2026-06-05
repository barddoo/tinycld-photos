import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import TagChip from './TagChip'

interface TagOption {
    id: string
    name: string
    color: string
}

interface Props {
    tags: TagOption[]
    selectedIds: Set<string>
    onToggle: (tagId: string) => void
    onCreate: (name: string) => void
}

export default function TagPicker({ tags, selectedIds, onToggle, onCreate }: Props) {
    const [query, setQuery] = useState('')
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const border = useThemeColor('border')
    const bg = useThemeColor('active-indicator')

    const filtered = useMemo(() => {
        if (!query.trim()) return tags
        const lower = query.toLowerCase()
        return tags.filter(t => t.name.toLowerCase().includes(lower))
    }, [tags, query])

    const canCreate = query.trim().length > 0 && !tags.some(t => t.name.toLowerCase() === query.trim().toLowerCase())

    const handleCreate = useCallback(() => {
        if (canCreate) {
            onCreate(query.trim())
            setQuery('')
        }
    }, [canCreate, onCreate, query])

    return (
        <View className="gap-2">
            <View className="flex-row items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: border + '20', borderWidth: 1, borderColor: border }}>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search or create tag..."
                    placeholderTextColor={muted}
                    onSubmitEditing={handleCreate}
                    returnKeyType="done"
                    className="flex-1"
                    style={{ color: fg, fontSize: 14 }}
                />
                {canCreate && (
                    <Pressable onPress={handleCreate} className="px-2 py-1 rounded" style={{ backgroundColor: bg }}>
                        <Text className="text-white text-xs font-medium">Create</Text>
                    </Pressable>
                )}
            </View>

            {filtered.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5">
                    {filtered.map(tag => (
                        <TagChip
                            key={tag.id}
                            label={tag.name}
                            color={tag.color}
                            selected={selectedIds.has(tag.id)}
                            onPress={() => onToggle(tag.id)}
                        />
                    ))}
                </View>
            )}

            {filtered.length === 0 && !canCreate && (
                <Text style={{ color: muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                    No tags yet. Type to create one.
                </Text>
            )}
        </View>
    )
}
