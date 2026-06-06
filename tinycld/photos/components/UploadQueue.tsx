import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    Loader,
    RefreshCw,
    X,
} from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    type LayoutChangeEvent,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import {
    clearAll,
    clearDone,
    getUploadState,
    subscribeToUploads,
    type UploadEntry,
    type UploadStatus,
} from '../stores/upload-store'

const MAX_VISIBLE_ITEMS = 20

function useUploadStore() {
    const [, setTick] = useState(0)
    useEffect(() => {
        return subscribeToUploads(() => setTick(t => t + 1))
    }, [])
    return getUploadState()
}

function statusIcon(status: UploadStatus) {
    switch (status) {
        case 'pending':
            return <Clock size={14} color="#94a3b8" />
        case 'uploading':
            return <Loader size={14} color="#3b82f6" />
        case 'done':
            return <CheckCircle2 size={14} color="#22c55e" />
        case 'failed':
            return <AlertCircle size={14} color="#ef4444" />
    }
}

function formatCount(n: number, label: string): string {
    return `${n} ${label}${n === 1 ? '' : 's'}`
}

interface Props {
    onRetry?: (entry: UploadEntry) => void
}

export default function UploadQueue({ onRetry }: Props) {
    const { entries } = useUploadStore()
    const [expanded, setExpanded] = useState(false)
    const [barHeight, setBarHeight] = useState(0)
    const bg = useThemeColor('surface')
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const border = useThemeColor('border')
    const autoDismissRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const pending = entries.filter(e => e.status === 'pending')
    const uploading = entries.filter(e => e.status === 'uploading')
    const done = entries.filter(e => e.status === 'done')
    const failed = entries.filter(e => e.status === 'failed')
    const activeCount = pending.length + uploading.length
    const totalCount = entries.length

    useEffect(() => {
        if (entries.length === 0) setExpanded(false)
    }, [entries.length])

    useEffect(() => {
        if (activeCount === 0 && totalCount > 0) {
            autoDismissRef.current = setTimeout(clearDone, 4000)
            return () => clearTimeout(autoDismissRef.current)
        }
    }, [activeCount, totalCount])

    const onBarLayout = useCallback((e: LayoutChangeEvent) => {
        setBarHeight(e.nativeEvent.layout.height)
    }, [])

    if (entries.length === 0) return null

    const shownEntries = entries.slice(0, MAX_VISIBLE_ITEMS)
    const overflowCount = entries.length - MAX_VISIBLE_ITEMS

    return (
        <View style={styles.wrapper} pointerEvents="box-none">
            {expanded && barHeight > 0 && (
                <View
                    style={[
                        styles.panel,
                        {
                            backgroundColor: bg,
                            borderColor: border,
                            paddingBottom: barHeight + 8,
                        },
                    ]}
                >
                    <View
                        className="flex-row items-center justify-between px-4 py-3 border-b"
                        style={{ borderColor: border }}
                    >
                        <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>
                            Upload Queue
                        </Text>
                        <View className="flex-row items-center gap-3">
                            {done.length > 0 && (
                                <Pressable
                                    onPress={clearDone}
                                    hitSlop={8}
                                    accessibilityLabel="Clear completed"
                                >
                                    <Text style={{ color: muted, fontSize: 13 }}>Clear done</Text>
                                </Pressable>
                            )}
                            {activeCount === 0 && (
                                <Pressable
                                    onPress={clearAll}
                                    hitSlop={8}
                                    accessibilityLabel="Close queue"
                                >
                                    <X size={18} color={muted} />
                                </Pressable>
                            )}
                        </View>
                    </View>
                    <ScrollView className="flex-1 px-4 py-1">
                        {shownEntries.map(e => (
                            <UploadQueueRow key={e.id} entry={e} onRetry={onRetry} />
                        ))}
                        {overflowCount > 0 && (
                            <Text
                                style={{
                                    color: muted,
                                    fontSize: 12,
                                    textAlign: 'center',
                                    paddingVertical: 8,
                                }}
                            >
                                ...and {overflowCount} more
                            </Text>
                        )}
                    </ScrollView>
                </View>
            )}
            <Pressable
                onLayout={onBarLayout}
                onPress={() => setExpanded(e => !e)}
                style={[
                    styles.bar,
                    {
                        backgroundColor: bg,
                        borderColor: border,
                        borderTopLeftRadius: expanded ? 0 : 12,
                        borderTopRightRadius: expanded ? 0 : 12,
                        borderRadius: 12,
                    },
                ]}
                accessibilityLabel={expanded ? 'Collapse upload queue' : 'Expand upload queue'}
            >
                <View className="flex-row items-center flex-1">
                    <View className="flex-row items-center gap-2 flex-1">
                        {activeCount > 0 ? (
                            <>
                                <Loader size={16} color="#3b82f6" />
                                <Text style={{ color: fg, fontSize: 14 }} numberOfLines={1}>
                                    Uploading {formatCount(activeCount, 'photo')}…
                                </Text>
                            </>
                        ) : failed.length > 0 ? (
                            <>
                                <AlertCircle size={16} color="#ef4444" />
                                <Text style={{ color: fg, fontSize: 14 }} numberOfLines={1}>
                                    {formatCount(failed.length, 'upload')} failed
                                    {done.length > 0 ? `, ${formatCount(done.length, 'done')}` : ''}
                                </Text>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} color="#22c55e" />
                                <Text style={{ color: fg, fontSize: 14 }} numberOfLines={1}>
                                    {formatCount(done.length, 'photo')} uploaded
                                </Text>
                            </>
                        )}
                    </View>
                    {expanded ? (
                        <ChevronDown size={18} color={muted} />
                    ) : (
                        <ChevronUp size={18} color={muted} />
                    )}
                </View>
            </Pressable>
        </View>
    )
}

function UploadQueueRow({
    entry,
    onRetry,
}: {
    entry: UploadEntry
    onRetry?: (entry: UploadEntry) => void
}) {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    return (
        <View className="flex-row items-center py-2.5 gap-2.5">
            <View className="w-5 items-center justify-center">{statusIcon(entry.status)}</View>
            <Text
                style={{ color: entry.status === 'failed' ? '#ef4444' : fg, fontSize: 13, flex: 1 }}
                numberOfLines={1}
            >
                {entry.fileName}
            </Text>
            {entry.status === 'uploading' && (
                <Text style={{ color: muted, fontSize: 12 }}>Uploading…</Text>
            )}
            {entry.status === 'failed' && (
                <Pressable
                    onPress={() => onRetry?.(entry)}
                    hitSlop={8}
                    accessibilityLabel="Retry upload"
                >
                    <RefreshCw size={14} color="#3b82f6" />
                </Pressable>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute' as const,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 60,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: Platform.OS === 'web' ? 80 : 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
    },
    panel: {
        marginHorizontal: 12,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
        maxHeight: 400,
    },
})
