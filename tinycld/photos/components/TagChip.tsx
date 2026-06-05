import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Pressable, Text, View } from 'react-native'

interface Props {
    label: string
    color?: string
    selected?: boolean
    onPress?: () => void
    onRemove?: () => void
}

export default function TagChip({ label, color, selected, onPress, onRemove }: Props) {
    const muted = useThemeColor('muted-foreground')
    const fg = useThemeColor('foreground')

    const chipColor = color || '#6366f1'

    return (
        <Pressable
            onPress={onPress}
            className={`flex-row items-center gap-1 px-3 py-1.5 rounded-full border ${selected ? 'border-transparent' : ''}`}
            style={{
                backgroundColor: selected ? chipColor + '20' : 'transparent',
                borderColor: selected ? chipColor : muted + '40',
            }}
            accessibilityRole="button"
        >
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: chipColor }} />
            <Text style={{ color: selected ? chipColor : fg, fontSize: 13 }}>{label}</Text>
            {onRemove && (
                <Pressable onPress={onRemove} className="ml-1" hitSlop={8}>
                    <Text style={{ color: muted, fontSize: 14 }}>✕</Text>
                </Pressable>
            )}
        </Pressable>
    )
}
