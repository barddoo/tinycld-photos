import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { MapPin } from 'lucide-react-native'
import { Text, View } from 'react-native'

export default function MapScreen() {
    const muted = useThemeColor('muted-foreground')
    const bg = useThemeColor('background')

    return (
        <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: bg }}>
            <MapPin size={48} color={muted} accessibilityRole="image" />
            <Text style={{ color: muted, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                Map view coming soon. Photos with GPS coordinates will appear on a map.
            </Text>
        </View>
    )
}
