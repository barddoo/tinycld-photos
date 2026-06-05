import { Stack } from 'expo-router'

export default function PhotosLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="albums" />
        </Stack>
    )
}
