import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Text, View } from 'react-native'

interface Props {
    label: string
    photoCount: number
}

export default function DateSectionHeader({ label, photoCount }: Props) {
    const fg = useThemeColor('foreground')
    const muted = useThemeColor('muted-foreground')

    return (
        <View className="flex-row items-center justify-between px-4 py-3">
            <Text style={{ color: fg, fontSize: 18, fontWeight: '600' }}>{label}</Text>
            <Text style={{ color: muted, fontSize: 13 }}>{photoCount} photo{photoCount !== 1 ? 's' : ''}</Text>
        </View>
    )
}
