import { FlashList } from '@shopify/flash-list'
import { DocumentTitle } from '@tinycld/core/components/DocumentTitle'
import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useCurrentUserOrg } from '@tinycld/core/lib/use-current-user-org'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useOrgInfo } from '@tinycld/core/lib/use-org-info'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, View, type LayoutChangeEvent } from 'react-native'
import DateSectionHeader from '../components/DateSectionHeader'
import PhotoCard from '../components/PhotoCard'
import UploadButton from '../components/UploadButton'
import { usePhotoMutations } from '../hooks/usePhotoMutations'
import { usePhotos } from '../hooks/usePhotos'
import type { ActiveSection, PhotoView } from '../types'

const GRID_GAP = 2
const GRID_PADDING = 16

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
    const { uploadPhotos } = usePhotoMutations(orgId || '', userOrgId)
    const { cols, cardSize, onLayout } = useGridColumns(isMobile)

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
                    <View style={{ paddingHorizontal: GRID_GAP / 2, paddingBottom: GRID_GAP }}>
                        <PhotoCard
                            photo={item.photo}
                            size={cardSize}
                            onPress={handlePhotoPress}
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
            </>
        )
    }

    return (
        <>
            <View className="flex-1 bg-background" onLayout={onLayout}>
                <DocumentTitle pkg="Photos" />
                <FlashList<ListRow>
                    key={`cols-${cols}`}
                    data={rows}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    getItemType={getItemType}
                    numColumns={cols}
                    overrideItemLayout={overrideItemLayout}
                    contentContainerStyle={{ paddingHorizontal: GRID_PADDING - GRID_GAP / 2 }}
                    refreshControl={
                        isMobile ? (
                            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
                        ) : undefined
                    }
                />
            </View>
            <UploadButton onFiles={handleFiles} />
        </>
    )
}
