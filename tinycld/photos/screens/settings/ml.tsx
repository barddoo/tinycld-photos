import { pb } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Brain, RefreshCw } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'

interface MLConfig {
    enabled: boolean
    clipModel: string
    ocrEnabled: boolean
    minFaceScore: string
    maxFaceDistance: string
    minFaces: string
    pollIntervalSecs: string
    batchSize: string
}

interface MLStatus {
    engine_available: boolean
    gpu_provider: string
    geocode_ready: boolean
    jobs: { pending: number; processing: number; done: number; failed: number }
    settings: Record<string, string>
}

export default function MLSettings() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const surface = useThemeColor('surface')
    const border = useThemeColor('border')
    const accent = useThemeColor('accent')

    const [config, setConfig] = useState<MLConfig>({
        enabled: true,
        clipModel: 'ViT-B-32__openai',
        ocrEnabled: true,
        minFaceScore: '0.7',
        maxFaceDistance: '0.5',
        minFaces: '3',
        pollIntervalSecs: '30',
        batchSize: '8',
    })
    const [status, setStatus] = useState<MLStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [reprocessing, setReprocessing] = useState(false)

    useEffect(() => {
        fetchStatus()
    }, [])

    const fetchStatus = useCallback(async () => {
        try {
            const resp = await pb.send('/api/photos/ml/status', { method: 'GET' })
            const s = resp as MLStatus
            setStatus(s)

            if (s.settings) {
                setConfig(prev => ({
                    ...prev,
                    ocrEnabled:
                        typeof s.settings.ocr_enabled === 'boolean'
                            ? s.settings.ocr_enabled
                            : prev.ocrEnabled,
                    minFaceScore: String(s.settings.min_face_score ?? prev.minFaceScore),
                    maxFaceDistance: String(s.settings.max_face_distance ?? prev.maxFaceDistance),
                    minFaces: String(s.settings.min_faces ?? prev.minFaces),
                    pollIntervalSecs: String(
                        s.settings.poll_interval_secs ?? prev.pollIntervalSecs
                    ),
                    batchSize: String(s.settings.batch_size ?? prev.batchSize),
                }))
            }
        } catch {
            // API not available
        } finally {
            setLoading(false)
        }
    }, [])

    const updateField = useCallback(<K extends keyof MLConfig>(key: K, value: MLConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }))
    }, [])

    const handleSave = useCallback(async () => {
        try {
            await pb.send('/api/photos/ml/settings', {
                method: 'POST',
                body: {
                    clip_model_name: config.clipModel,
                    ocr_enabled: config.ocrEnabled,
                    min_face_score: parseFloat(config.minFaceScore),
                    max_face_distance: parseFloat(config.maxFaceDistance),
                    min_faces: parseInt(config.minFaces, 10),
                    poll_interval_secs: parseInt(config.pollIntervalSecs, 10),
                    batch_size: parseInt(config.batchSize, 10),
                },
            })
            Alert.alert('Saved', 'ML settings updated')
            fetchStatus()
        } catch {
            Alert.alert('Error', 'Failed to save settings')
        }
    }, [
        config.clipModel,
        config.ocrEnabled,
        config.minFaceScore,
        config.maxFaceDistance,
        config.minFaces,
        config.pollIntervalSecs,
        config.batchSize,
        fetchStatus,
    ])

    const handleReprocess = useCallback(async () => {
		Alert.alert(
			'Reprocess Photos',
			'This will re-run ML processing on all photos. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reprocess',
                    onPress: async () => {
                        setReprocessing(true)
                        try {
                            const resp = await pb.send('/api/photos/ml/reprocess', {
                                method: 'POST',
                                body: {
                                    job_types: [
                                        'detect_faces',
                                        'encode_clip',
                                        'run_ocr',
                                        'compute_phash',
                                        'reverse_geocode',
                                    ],
								status: 'all',
                                },
                            })
                            const result = resp as { enqueued: number; photos: number }
                            Alert.alert(
                                'Done',
                                `Enqueued ${result.enqueued} jobs for ${result.photos} photos`
                            )
                            fetchStatus()
                        } catch {
                            Alert.alert('Error', 'Failed to start reprocessing')
                        } finally {
                            setReprocessing(false)
                        }
                    },
                },
            ]
        )
    }, [fetchStatus])

    const Field = ({
        label,
        value,
        onChange,
        type = 'text',
    }: {
        label: string
        value: string | boolean
        onChange: (v: string) => void
        type?: 'text' | 'switch'
    }) => (
        <View
            className="flex-row items-center justify-between py-3 px-4"
            style={{ borderBottomWidth: 0.5, borderBottomColor: border }}
        >
            <Text style={{ color: fg, fontSize: 15 }}>{label}</Text>
            {type === 'switch' ? (
                <Switch
                    value={value as boolean}
                    onValueChange={(v: boolean) => onChange(v ? '1' : '0')}
                    accessibilityLabel={label}
                />
            ) : (
                <TextInput
                    style={{
                        color: fg,
                        fontSize: 14,
                        backgroundColor: surface,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        minWidth: 160,
                        textAlign: 'right',
                    }}
                    value={value as string}
                    onChangeText={onChange}
                    placeholderTextColor={muted}
                    accessibilityLabel={label}
                />
            )}
        </View>
    )

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
                <Text style={{ color: muted, fontSize: 14 }}>Loading...</Text>
            </View>
        )
    }

    return (
        <ScrollView style={{ flex: 1, backgroundColor: bg }}>
            <View className="px-4 pt-6 pb-4">
                <View className="flex-row items-center gap-2 mb-2">
                    <Brain size={24} color={fg} accessibilityRole="image" />
                    <Text style={{ color: fg, fontSize: 20, fontWeight: '600' }}>Photos ML</Text>
                </View>
                <Text style={{ color: muted, fontSize: 13 }}>
                    Machine learning features for face detection, smart search, and OCR.
                </Text>
            </View>

            {status && (
                <View className="mx-4 mb-4 rounded-xl p-4" style={{ backgroundColor: surface }}>
                    <Text style={{ color: fg, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>
                        ML Status
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                        <Text style={{ color: muted, fontSize: 12 }}>
                            Engine: {status.engine_available ? 'Ready' : 'Not loaded'}
                        </Text>
                        {status.gpu_provider ? (
                            <Text style={{ color: muted, fontSize: 12 }}>
                                GPU: {status.gpu_provider}
                            </Text>
                        ) : null}
                        <Text style={{ color: muted, fontSize: 12 }}>
                            Geocode: {status.geocode_ready ? 'Ready' : 'Not loaded'}
                        </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2 mt-2">
                        <Text style={{ color: muted, fontSize: 12 }}>
                            Pending: {status.jobs.pending}
                        </Text>
                        <Text style={{ color: muted, fontSize: 12 }}>
                            Processing: {status.jobs.processing}
                        </Text>
                        <Text style={{ color: muted, fontSize: 12 }}>Done: {status.jobs.done}</Text>
                        <Text style={{ color: muted, fontSize: 12 }}>
                            Failed: {status.jobs.failed}
                        </Text>
                    </View>
                </View>
            )}

            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field
                    label="ML Enabled"
                    value={config.enabled}
                    onChange={v => updateField('enabled', v === '1')}
                    type="switch"
                />
            </View>

            <Text
                className="px-4 pt-6 pb-2 text-xs font-semibold uppercase"
                style={{ color: muted }}
            >
                Face Recognition
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field
                    label="Min Detection Score"
                    value={config.minFaceScore}
                    onChange={(v: string) => updateField('minFaceScore', v)}
                />
                <Field
                    label="Max Face Distance"
                    value={config.maxFaceDistance}
                    onChange={(v: string) => updateField('maxFaceDistance', v)}
                />
                <Field
                    label="Min Faces for Person"
                    value={config.minFaces}
                    onChange={(v: string) => updateField('minFaces', v)}
                />
            </View>

            <Text
                className="px-4 pt-6 pb-2 text-xs font-semibold uppercase"
                style={{ color: muted }}
            >
                Job Queue
            </Text>
            <Text className="px-4 pb-3 text-xs" style={{ color: muted }}>
                Controls how often the ML pipeline checks for new work and how many photos it
                processes at once.
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field
                    label="Poll Interval (sec)"
                    value={config.pollIntervalSecs}
                    onChange={(v: string) => updateField('pollIntervalSecs', v)}
                />
                <Field
                    label="Batch Size"
                    value={config.batchSize}
                    onChange={(v: string) => updateField('batchSize', v)}
                />
            </View>

            <Text
                className="px-4 pt-6 pb-2 text-xs font-semibold uppercase"
                style={{ color: muted }}
            >
                OCR
            </Text>
            <Text className="px-4 pb-3 text-xs" style={{ color: muted }}>
                Extract visible text from photos. When enabled, text in images becomes searchable
                via full-text search.
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field
                    label="Extract Text from Photos"
                    value={config.ocrEnabled}
                    onChange={v => updateField('ocrEnabled', v === '1')}
                    type="switch"
                />
            </View>

            <Text
                className="px-4 pt-6 pb-2 text-xs font-semibold uppercase"
                style={{ color: muted }}
            >
                Vector Search
            </Text>
            <View className="mx-4 rounded-xl p-4" style={{ backgroundColor: surface }}>
                <View className="flex-row items-center gap-2 mb-1">
                    <View
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: status?.engine_available ? '#4ade80' : '#f87171' }}
                    />
                    <Text style={{ color: fg, fontSize: 14 }}>
                        {status?.settings?.usearch_index ? 'usearch' : 'Brute-force (in-process)'}
                    </Text>
                </View>
                {status?.settings?.usearch_index ? (
                    <Text style={{ color: muted, fontSize: 12 }}>
                        Index: {status.settings.usearch_index as string}
                    </Text>
                ) : null}
                <Text className="mt-2 text-xs" style={{ color: muted }}>
                    Set USEARCH_INDEX_PATH env var for HNSW acceleration
                </Text>
            </View>

            <View className="mx-4 mt-6 mb-8 gap-3">
                <Pressable
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ backgroundColor: accent }}
                    onPress={handleSave}
                    accessibilityRole="button"
                    accessibilityLabel="Save ML settings"
                >
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                        Save Settings
                    </Text>
                </Pressable>

                <Pressable
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ backgroundColor: surface, opacity: reprocessing ? 0.5 : 1 }}
                    onPress={handleReprocess}
                    disabled={reprocessing}
                    accessibilityRole="button"
                    accessibilityLabel="Reprocess all photos"
                >
                    <RefreshCw size={18} color={fg} accessibilityRole="image" />
                    <Text style={{ color: fg, fontSize: 15, fontWeight: '500' }}>
                        {reprocessing ? 'Reprocessing...' : 'Reprocess All Photos'}
                    </Text>
                </Pressable>
                <Text style={{ color: muted, fontSize: 11, textAlign: 'center' }}>
                    Re-runs ML detection on all photos with pending/failed status
                </Text>
            </View>
        </ScrollView>
    )
}
