import { FrozenSlideStack } from '@tinycld/core/components/workspace/FrozenStack'
import { Stack } from 'expo-router'

export default function PhotosLayout() {
    return (
        <FrozenSlideStack>
            <Stack.Screen name="index" />
            <Stack.Screen name="[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="albums" />
        </FrozenSlideStack>
    )
}
