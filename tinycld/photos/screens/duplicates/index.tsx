import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { CopyX } from 'lucide-react-native'
import { Text, View } from 'react-native'

export default function DuplicatesScreen() {
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')

    return (
        <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: bg }}>
            <CopyX size={48} color={muted} accessibilityRole="image" />
            <Text style={{ color: muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                Duplicate detection coming soon. Enable perceptual hashing to find and manage duplicate photos.
            </Text>
        </View>
    )
}
