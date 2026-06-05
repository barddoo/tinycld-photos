import { FrozenSlideStack } from '@tinycld/core/components/workspace/FrozenStack'
import { Stack } from 'expo-router'

export default function PhotosLayout() {
    return (
        <FrozenSlideStack>
            <Stack.Screen name="index" />
            <Stack.Screen name="[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="albums" />
            <Stack.Screen name="tags" />
            <Stack.Screen name="search" />
            <Stack.Screen name="people" />
            <Stack.Screen name="memories" />
            <Stack.Screen name="map" />
            <Stack.Screen name="duplicates" />
        </FrozenSlideStack>
    )
}
