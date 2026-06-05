import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Brain, RefreshCw } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'

interface MLConfig {
    enabled: boolean
    clipModel: string
    ocrEnabled: boolean
    minFaceScore: string
    maxFaceDistance: string
    minFaces: string
    qdrantUrl: string
}

export default function MLSettings() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const surface = useThemeColor('surface')
    const border = useThemeColor('border')

    const [config, setConfig] = useState<MLConfig>({
        enabled: true,
        clipModel: 'ViT-B-32__openai',
        ocrEnabled: true,
        minFaceScore: '0.7',
        maxFaceDistance: '0.5',
        minFaces: '3',
        qdrantUrl: '',
    })

    const updateField = useCallback(<K extends keyof MLConfig>(key: K, value: MLConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }))
    }, [])

    const Field = ({ label, value, onChange, type = 'text' }: {
        label: string
        value: string | boolean
        onChange: (v: string) => void
        type?: 'text' | 'switch'
    }) => (
        <View className="flex-row items-center justify-between py-3 px-4" style={{ borderBottomWidth: 0.5, borderBottomColor: border }}>
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

            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field label="ML Enabled" value={config.enabled} onChange={(v) => updateField('enabled', v === '1')} type="switch" />
            </View>

            <Text className="px-4 pt-6 pb-2 text-xs font-semibold uppercase" style={{ color: muted }}>
                Face Recognition
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field label="CLIP Model" value={config.clipModel} onChange={(v: string) => updateField('clipModel', v)} />
                <Field label="Min Detection Score" value={config.minFaceScore} onChange={(v: string) => updateField('minFaceScore', v)} />
                <Field label="Max Face Distance" value={config.maxFaceDistance} onChange={(v: string) => updateField('maxFaceDistance', v)} />
                <Field label="Min Faces for Person" value={config.minFaces} onChange={(v: string) => updateField('minFaces', v)} />
            </View>

            <Text className="px-4 pt-6 pb-2 text-xs font-semibold uppercase" style={{ color: muted }}>
                OCR
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field label="OCR Enabled" value={config.ocrEnabled} onChange={(v) => updateField('ocrEnabled', v === '1')} type="switch" />
            </View>

            <Text className="px-4 pt-6 pb-2 text-xs font-semibold uppercase" style={{ color: muted }}>
                Vector Search
            </Text>
            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                <Field label="Qdrant URL" value={config.qdrantUrl} onChange={(v: string) => updateField('qdrantUrl', v)} />
            </View>

            <View className="mx-4 mt-6 mb-8">
                <Pressable
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ backgroundColor: surface }}
                    onPress={() => {
                        alert('Reprocess triggered — connect to ML job queue API')
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Reprocess all photos"
                >
                    <RefreshCw size={18} color={fg} accessibilityRole="image" />
                    <Text style={{ color: fg, fontSize: 15, fontWeight: '500' }}>
                        Reprocess All Photos
                    </Text>
                </Pressable>
                <Text style={{ color: muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                    Re-runs ML detection on all photos with pending/failed status
                </Text>
            </View>
        </ScrollView>
    )
}
