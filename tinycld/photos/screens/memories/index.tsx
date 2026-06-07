import { DocumentTitle } from "@tinycld/core/components/DocumentTitle";
import { LoadingState } from "@tinycld/core/components/LoadingState";
import { useThemeColor } from "@tinycld/core/lib/use-app-theme";
import { Clock } from "lucide-react-native";
import { useCallback } from "react";
import { FlatList, Text, View } from "react-native";

import { useMemories } from "../../hooks/useMemories";
import type { MemoryView } from "../../types";

export default function MemoriesScreen() {
	const { memories, isLoading } = useMemories();
	const fg = useThemeColor("foreground");
	const muted = useThemeColor("muted-foreground");
	const bg = useThemeColor("background");
	const surface = useThemeColor("surface");

	const renderMemory = useCallback(
		({ item }: { item: MemoryView }) => (
			<View
				className="mx-4 my-2 p-4 rounded-xl"
				style={{ backgroundColor: surface }}
			>
				<Text style={{ color: fg, fontSize: 18, fontWeight: "600" }}>
					{item.title}
				</Text>
				<Text style={{ color: muted, fontSize: 13, marginTop: 2 }}>
					{item.type.replace(/_/g, " ")}
				</Text>
				{item.photos.length > 0 && (
					<Text style={{ color: muted, fontSize: 12, marginTop: 8 }}>
						{item.photos.length} photos
					</Text>
				)}
			</View>
		),
		[fg, muted, surface],
	);

	if (isLoading) {
		return <LoadingState />;
	}

	if (memories.length === 0) {
		return (
			<View
				className="flex-1 items-center justify-center px-8"
				style={{ backgroundColor: bg }}
			>
				<DocumentTitle pkg="Memories" />
				<Clock size={48} color={muted} accessibilityRole="image" />
				<Text
					style={{
						color: muted,
						fontSize: 16,
						marginTop: 12,
						textAlign: "center",
					}}
				>
					No memories yet. Memories are auto-generated from your photo library.
				</Text>
			</View>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: bg }}>
			<DocumentTitle pkg="Memories" />
			<FlatList
				data={memories}
				renderItem={renderMemory}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{ paddingVertical: 8 }}
			/>
		</View>
	);
}
