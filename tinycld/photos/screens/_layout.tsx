import { FrozenSlideStack } from "@tinycld/core/components/workspace/FrozenStack";
import { Stack } from "expo-router";

export default function PhotosLayout() {
	return (
		<FrozenSlideStack>
			<Stack.Screen name="index" />
			<Stack.Screen name="[id]" options={{ animation: "slide_from_right" }} />
			<Stack.Screen name="albums" />
			<Stack.Screen name="tags/index" />
			<Stack.Screen name="search/index" />
			<Stack.Screen name="people/index" />
			<Stack.Screen name="memories/index" />
			<Stack.Screen name="map/index" />
			<Stack.Screen name="duplicates/index" />
		</FrozenSlideStack>
	);
}
