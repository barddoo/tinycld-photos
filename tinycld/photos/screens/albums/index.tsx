import { FlashList } from '@shopify/flash-list'
import { DocumentTitle } from '@tinycld/core/components/DocumentTitle'
import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { router } from 'expo-router'
import { Plus, X } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Pressable, Text, TextInput, View, Modal } from 'react-native'
import AlbumCard from '../../components/AlbumCard'
import { useAlbumMutations } from '../../hooks/useAlbumMutations'
import { useAlbums } from '../../hooks/useAlbums'
import type { AlbumView } from '../../types'

export default function AlbumsIndex() {
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const isMobile = useBreakpoint() === 'mobile'
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const border = useThemeColor('border')
    const bg = useThemeColor('active-indicator')
    const bgMuted = useThemeColor('muted-foreground')
    const orgHref = useOrgHref()

    const { albums, isLoading } = useAlbums()
    const { createAlbum } = useAlbumMutations(orgId, userOrgId)

    const [showCreate, setShowCreate] = useState(false)
    const [newName, setNewName] = useState('')

    const handleAlbumPress = useCallback(
        (album: AlbumView) => {
            router.push(orgHref('photos/albums/[id]', { id: album.id }))
        },
        [orgHref]
    )

    const handleCreate = useCallback(async () => {
        if (!newName.trim()) return
        await createAlbum(newName.trim())
        setNewName('')
        setShowCreate(false)
    }, [newName, createAlbum])

    const cols = isMobile ? 2 : 3

    if (isLoading) {
        return <LoadingState />
    }

    if (albums.length === 0 && !showCreate) {
        return (
            <View className="flex-1 bg-background">
                <DocumentTitle pkg="Albums" />
                <EmptyState message="No albums yet — create your first album" />
                <Pressable
                    onPress={() => setShowCreate(true)}
                    className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg"
                    style={{ backgroundColor: bg }}
                    accessibilityRole="button"
                    accessibilityLabel="Create album"
                >
                    <Plus size={22} color="#fff" />
                </Pressable>
            </View>
        )
    }

    return (
        <View className="flex-1 bg-background px-4 pt-4">
            <DocumentTitle pkg="Albums" />
            <FlashList<AlbumView>
                data={albums}
                numColumns={cols}
                keyExtractor={a => a.id}
                renderItem={({ item }) => (
                    <AlbumCard
                        album={item}
                        coverPhoto={null}
                        onPress={handleAlbumPress}
                    />
                )}
                contentContainerStyle={{ paddingBottom: 80 }}
            />

            <Pressable
                onPress={() => setShowCreate(true)}
                className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg"
                style={{ backgroundColor: bg }}
                accessibilityRole="button"
                accessibilityLabel="Create album"
            >
                <Plus size={22} color="#fff" />
            </Pressable>

            <Modal visible={showCreate} transparent animationType="fade">
                <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <View
                        className="w-full max-w-sm rounded-xl p-5 gap-4"
                        style={{ backgroundColor: '#1c1c1e' }}
                    >
                        <View className="flex-row items-center justify-between">
                            <Text style={{ color: fg, fontSize: 17, fontWeight: '600' }}>New Album</Text>
                            <Pressable onPress={() => setShowCreate(false)} className="p-1">
                                <X size={20} color={fg} />
                            </Pressable>
                        </View>
                        <TextInput
                            autoFocus
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Album name"
                            placeholderTextColor={muted}
                            onSubmitEditing={handleCreate}
                            returnKeyType="done"
                            className="rounded-lg px-4 py-3"
                            style={{
                                backgroundColor: '#2c2c2e',
                                color: fg,
                                fontSize: 15,
                                borderWidth: 1,
                                borderColor: border,
                            }}
                        />
                        <View className="flex-row justify-end gap-2">
                            <Pressable
                                onPress={() => { setShowCreate(false); setNewName('') }}
                                className="px-4 py-2 rounded-lg"
                                accessibilityRole="button"
                            >
                                <Text style={{ color: muted, fontSize: 14 }}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                onPress={handleCreate}
                                className="px-4 py-2 rounded-lg"
                                style={!newName.trim() ? { opacity: 0.5 } : { backgroundColor: bg }}
                                disabled={!newName.trim()}
                                accessibilityRole="button"
                            >
                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Create</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    )
}
