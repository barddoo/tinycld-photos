import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Upload } from 'lucide-react-native'
import { Platform, Pressable, StyleSheet, View } from 'react-native'

interface Props {
    onFiles: (files: File[]) => void
}

export default function UploadButton({ onFiles }: Props) {
    const bg = useThemeColor('active-indicator')

    const handlePress = () => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') {
            return
        }
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.multiple = true
        input.onchange = () => {
            const files = Array.from(input.files ?? [])
            if (files.length > 0) {
                onFiles(files)
            }
        }
        input.click()
    }

    return (
        <View style={styles.wrapper}>
            <Pressable
                onPress={handlePress}
                className="w-14 h-14 rounded-full items-center justify-center shadow-lg"
                style={{ backgroundColor: bg }}
                accessibilityRole="button"
                accessibilityLabel="Upload photos"
            >
                <Upload size={22} color="#fff" />
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute' as const,
        bottom: 24,
        right: 24,
        zIndex: 50,
    },
})
