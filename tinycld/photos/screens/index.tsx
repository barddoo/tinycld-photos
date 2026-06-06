import { FlashList } from '@shopify/flash-list'
import { eq } from '@tanstack/db'
import { DocumentTitle } from '@tinycld/core/components/DocumentTitle'
import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import {
    Alert,
    type LayoutChangeEvent,
    Pressable,
    RefreshControl,
    ScrollView,
    View,
} from 'react-native'
import DateSectionHeader from '../components/DateSectionHeader'
import PhotoCard from '../components/PhotoCard'
import TagChip from '../components/TagChip'
import UploadButton from '../components/UploadButton'
import UploadQueue from '../components/UploadQueue'
import { usePhotoMutations } from '../hooks/usePhotoMutations'
import { usePhotos } from '../hooks/usePhotos'
import type { ActiveSection, PhotoTag, PhotoView } from '../types'

const GRID_GAP = 2
const GRID_PADDING = 16

const s = {
    photoCell: (gap: number, padding: number) =>
        ({
            paddingHorizontal: gap / 2,
            paddingBottom: gap,
        }) as const,
    contentContainer: (padding: number, gap: number) =>
        ({
            paddingHorizontal: padding - gap / 2,
        }) as const,
} as const

type ListRow =
    | { kind: 'section'; title: string; count: number }
    | { kind: 'photo'; photo: PhotoView }

interface GridLayoutInfo {
    cols: number
    cardSize: number
    onLayout: (e: LayoutChangeEvent) => void
}

function useGridColumns(isMobile: boolean): GridLayoutInfo {
    const cardMin = isMobile ? 100 : 160
    const [width, setWidth] = useState(0)
    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setWidth(prev => {
            const next = e.nativeEvent.layout.width
            return prev === next ? prev : next
        })
    }, [])
    const cols = useMemo(() => {
        if (width <= 0) return isMobile ? 3 : 4
        const inner = width - GRID_PADDING * 2
        return Math.max(2, Math.floor((inner + GRID_GAP) / (cardMin + GRID_GAP)))
    }, [width, cardMin])
    const cardSize = useMemo(() => {
        if (width <= 0) return cardMin
        const inner = width - GRID_PADDING * 2
        return Math.floor((inner - (cols - 1) * GRID_GAP) / cols)
    }, [width, cols])
    return { cols, cardSize, onLayout }
}

interface Props {
    section?: ActiveSection
}

export default function PhotosTimeline({ section: _section }: Props) {
    const params = useLocalSearchParams<{ section?: string }>()
    const section = (params.section as ActiveSection) ?? _section ?? 'timeline'
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const orgHref = useOrgHref()
    const isMobile = useBreakpoint() === 'mobile'
    const { photos, timeline, isLoading } = usePhotos(section)
    const { uploadPhotos, restorePhoto, permanentlyDelete, retryUpload } = usePhotoMutations(
        orgId || '',
        userOrgId
    )
    const { cols, cardSize, onLayout } = useGridColumns(isMobile)

    const [tagsCollection] = useStore('photos_tags')
    const { data: rawTags } = useOrgLiveQuery(
        (query, { orgId }) =>
            query
                .from({ t: tagsCollection })
                .where(({ t }) => eq(t.org, orgId))
                .orderBy(({ t }) => t.name, 'asc'),
        []
    )
    const tags = (rawTags ?? []) as PhotoTag[]
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
    const toggleTag = useCallback((tagId: string) => {
        setSelectedTagIds(prev => {
            const next = new Set(prev)
            if (next.has(tagId)) next.delete(tagId)
            else next.add(tagId)
            return next
        })
    }, [])

    const handleFiles = useCallback(
        async (files: File[]) => {
            await uploadPhotos(files)
        },
        [uploadPhotos]
    )

    const handlePhotoPress = useCallback(
        (photo: PhotoView) => {
            router.push(orgHref('photos/[id]', { id: photo.id }))
        },
        [orgHref]
    )

    const handlePhotoLongPress = useCallback(
        (photo: PhotoView) => {
            if (section !== 'trash') return
            Alert.alert(photo.name, 'What would you like to do?', [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: () => restorePhoto(photo.id),
                },
                {
                    text: 'Delete permanently',
                    style: 'destructive',
                    onPress: () => permanentlyDelete(photo.id),
                },
            ])
        },
        [section, restorePhoto, permanentlyDelete]
    )

    const [isRefreshing, setIsRefreshing] = useState(false)
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true)
        try {
            const { queryClient } = await import('@tinycld/core/lib/pocketbase')
            await queryClient.invalidateQueries({ queryKey: ['photos_items'] })
        } finally {
            setIsRefreshing(false)
        }
    }, [])

    const rows = useMemo<ListRow[]>(() => {
        const result: ListRow[] = []
        for (const segment of timeline) {
            result.push({ kind: 'section', title: segment.label, count: segment.photos.length })
            for (const photo of segment.photos) {
                result.push({ kind: 'photo', photo })
            }
        }
        return result
    }, [timeline])

    const overrideItemLayout = useCallback(
        (layout: { span?: number }, row: ListRow) => {
            if (row.kind === 'section') {
                layout.span = cols
            }
        },
        [cols]
    )

    const renderItem = useCallback(
        ({ item }: { item: ListRow }) => {
            if (item.kind === 'section') {
                return <DateSectionHeader label={item.title} photoCount={item.count} />
            }
            if (item.kind === 'photo') {
                return (
                    <View style={s.photoCell(GRID_GAP, GRID_PADDING)}>
                        <PhotoCard
                            photo={item.photo}
                            size={cardSize}
                            onPress={handlePhotoPress}
                            onLongPress={section === 'trash' ? handlePhotoLongPress : undefined}
                        />
                    </View>
                )
            }
            return null
        },
        [cardSize, handlePhotoPress]
    )

    const keyExtractor = useCallback((row: ListRow) => {
        if (row.kind === 'section') return `__section_${row.title}__`
        return row.photo.id
    }, [])

    const getItemType = useCallback((row: ListRow) => {
        if (row.kind === 'section') return 'section'
        return 'photo'
    }, [])

    if (isLoading) {
        return <LoadingState />
    }

    if (rows.length === 0) {
        let message = 'No photos yet — tap the upload button to add some'
        if (section === 'favorites') message = 'No favorite photos yet'
        if (section === 'trash') message = 'Trash is empty'
        return (
            <>
                <View className="flex-1 bg-background" onLayout={onLayout}>
                    <DocumentTitle pkg="Photos" />
                    <EmptyState message={message} />
                </View>
                <UploadButton onFiles={handleFiles} />
                <UploadQueue onRetry={retryUpload} />
            </>
        )
    }

    const hasTagFilter = section === 'timeline' && tags.length > 0

    return (
        <>
            <View className="flex-1 bg-background" onLayout={onLayout}>
                <DocumentTitle pkg="Photos" />
                {hasTagFilter && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        className="py-2 px-3 flex-row gap-1.5"
                    >
                        {tags.map(tag => (
                            <TagChip
                                key={tag.id}
                                label={tag.name}
                                color={tag.color}
                                selected={selectedTagIds.has(tag.id)}
                                onPress={() => toggleTag(tag.id)}
                            />
                        ))}
                    </ScrollView>
                )}
                <FlashList<ListRow>
                    key={`cols-${cols}`}
                    data={rows}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    getItemType={getItemType}
                    numColumns={cols}
                    overrideItemLayout={overrideItemLayout}
                    contentContainerStyle={s.contentContainer(GRID_PADDING, GRID_GAP)}
                    refreshControl={
                        isMobile ? (
                            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
                        ) : undefined
                    }
                />
            </View>
            <UploadButton onFiles={handleFiles} />
            <UploadQueue onRetry={retryUpload} />
        </>
    )
}
