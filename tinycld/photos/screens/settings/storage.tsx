import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { HardDrive } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import {
    type ThumbnailQualityMode,
    useThumbnailQualitySetting,
} from '../../hooks/useThumbnailQualitySetting'

const OPTIONS: { value: ThumbnailQualityMode; label: string; description: string }[] = [
    {
        value: 'optimized',
        label: 'Optimize Storage',
        description: 'Smaller thumbnails (1024px, 75% quality). Saves space on your server.',
    },
    {
        value: 'high',
        label: 'Keep Originals',
        description: 'Larger thumbnails (2048px, 92% quality). Better fidelity when browsing.',
    },
]

export default function StorageSettings() {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')
    const surface = useThemeColor('surface')
    const border = useThemeColor('border')
    const accent = useThemeColor('accent')

    const { mode, setMode } = useThumbnailQualitySetting()

    return (
        <ScrollView style={{ flex: 1, backgroundColor: bg }}>
            <View className="px-4 pt-6 pb-4">
                <View className="flex-row items-center gap-2 mb-2">
                    <HardDrive size={24} color={fg} accessibilityRole="image" />
                    <Text style={{ color: fg, fontSize: 20, fontWeight: '600' }}>Storage</Text>
                </View>
                <Text style={{ color: muted, fontSize: 13 }}>
                    Controls the quality of thumbnails generated when photos are uploaded. Existing
                    thumbnails are not regenerated when this setting changes.
                </Text>
            </View>

            <Text
                className="px-4 pt-2 pb-2 text-xs font-semibold uppercase"
                style={{ color: muted }}
            >
                Thumbnail Quality
            </Text>

            <View className="mx-4 rounded-xl overflow-hidden" style={{ backgroundColor: surface }}>
                {OPTIONS.map((opt, i) => (
                    <Pressable
                        key={opt.value}
                        onPress={() => setMode(opt.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: mode === opt.value }}
                        accessibilityLabel={opt.label}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            borderBottomWidth: i < OPTIONS.length - 1 ? 0.5 : 0,
                            borderBottomColor: border,
                        }}
                    >
                        <View style={{ flex: 1, marginRight: 12 }}>
                            <Text
                                style={{
                                    color: fg,
                                    fontSize: 15,
                                    fontWeight: '500',
                                    marginBottom: 2,
                                }}
                            >
                                {opt.label}
                            </Text>
                            <Text style={{ color: muted, fontSize: 13 }}>{opt.description}</Text>
                        </View>
                        <View
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                borderWidth: 2,
                                borderColor: mode === opt.value ? accent : border,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {mode === opt.value && (
                                <View
                                    style={{
                                        width: 11,
                                        height: 11,
                                        borderRadius: 6,
                                        backgroundColor: accent,
                                    }}
                                />
                            )}
                        </View>
                    </Pressable>
                ))}
            </View>

            <Text style={{ color: muted, fontSize: 12, marginHorizontal: 16, marginTop: 8 }}>
                Applies to new uploads only. Re-upload photos to regenerate existing thumbnails.
            </Text>
        </ScrollView>
    )
}
