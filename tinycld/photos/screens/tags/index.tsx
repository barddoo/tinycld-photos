import { FlashList } from "@shopify/flash-list";
import { DocumentTitle } from "@tinycld/core/components/DocumentTitle";
import { EmptyState } from "@tinycld/core/components/EmptyState";
import { LoadingState } from "@tinycld/core/components/LoadingState";
import { useThemeColor } from "@tinycld/core/lib/use-app-theme";
import { useCurrentUserOrg } from "@tinycld/core/lib/use-current-user-org";
import { useOrgInfo } from "@tinycld/core/lib/use-org-info";
import { Plus, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import TagChip from "../../components/TagChip";
import { useTags } from "../../hooks/useTags";
import type { PhotoTag } from "../../types";

export default function TagsManage() {
	const { orgSlug, orgId } = useOrgInfo();
	const userOrg = useCurrentUserOrg(orgSlug);
	const userOrgId = userOrg?.id ?? "";
	const fg = useThemeColor("foreground");
	const muted = useThemeColor("muted-foreground");
	const bg = useThemeColor("active-indicator");
	const surface = useThemeColor("surface");

	const { tags, isLoading, createTag, deleteTag } = useTags(orgId, userOrgId);

	const [showCreate, setShowCreate] = useState(false);
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#6366f1");

	const handleCreate = useCallback(async () => {
		if (!newName.trim()) return;
		await createTag(newName.trim(), newColor);
		setNewName("");
		setShowCreate(false);
	}, [newName, newColor, createTag]);

	const handleDelete = useCallback(
		async (tag: PhotoTag) => {
			await deleteTag(tag.id);
		},
		[deleteTag],
	);

	const renderTag = useCallback(
		({ item }: { item: PhotoTag }) => (
			<View className="flex-row items-center justify-between px-4 py-3 border-b border-border/50">
				<TagChip label={item.name} color={item.color} />
				<Pressable
					onPress={() => handleDelete(item)}
					className="p-2"
					accessibilityRole="button"
					accessibilityLabel={`Delete ${item.name}`}
				>
					<X size={14} color={muted} />
				</Pressable>
			</View>
		),
		[handleDelete, muted],
	);

	if (isLoading) return <LoadingState />;

	return (
		<View className="flex-1 bg-background">
			<DocumentTitle pkg="Tags" />
			<View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
				<Text style={{ color: fg, fontSize: 17, fontWeight: "600" }}>Tags</Text>
				<Pressable
					onPress={() => setShowCreate(true)}
					className="w-8 h-8 rounded-full items-center justify-center"
					style={{ backgroundColor: bg }}
					accessibilityRole="button"
					accessibilityLabel="Create tag"
				>
					<Plus size={16} color="#fff" />
				</Pressable>
			</View>

			{tags.length === 0 ? (
				<EmptyState message="No tags yet — create one to organize photos" />
			) : (
				<FlashList<PhotoTag>
					data={tags}
					keyExtractor={(t) => t.id}
					renderItem={renderTag}
				/>
			)}

			<Modal visible={showCreate} transparent animationType="fade">
				<View
					className="flex-1 items-center justify-center px-6"
					style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
				>
					<View
						className="w-full max-w-sm rounded-xl p-5 gap-4"
						style={{ backgroundColor: surface }}
					>
						<View className="flex-row items-center justify-between">
							<Text style={{ color: fg, fontSize: 17, fontWeight: "600" }}>
								New Tag
							</Text>
							<Pressable
								onPress={() => setShowCreate(false)}
								className="p-1"
								accessibilityRole="button"
								accessibilityLabel="Close"
							>
								<X size={20} color={fg} />
							</Pressable>
						</View>
						<TextInput
							autoFocus
							value={newName}
							onChangeText={setNewName}
							placeholder="Tag name"
							placeholderTextColor={muted}
							onSubmitEditing={handleCreate}
							returnKeyType="done"
							className="rounded-lg px-4 py-3"
							style={{ backgroundColor: "#2c2c2e", color: fg, fontSize: 15 }}
						/>
						<View className="flex-row gap-2">
							{[
								"#6366f1",
								"#ef4444",
								"#22c55e",
								"#f59e0b",
								"#3b82f6",
								"#ec4899",
							].map((color) => (
								<Pressable
									key={color}
									onPress={() => setNewColor(color)}
									className="w-8 h-8 rounded-full"
									style={{
										backgroundColor: color,
										borderWidth: newColor === color ? 2 : 0,
										borderColor: "#fff",
									}}
									accessibilityRole="radio"
									accessibilityLabel={`Color ${color}`}
									accessibilityState={{ checked: newColor === color }}
								/>
							))}
						</View>
						<View className="flex-row justify-end gap-2">
							<Pressable
								onPress={() => {
									setShowCreate(false);
									setNewName("");
								}}
								className="px-4 py-2 rounded-lg"
								accessibilityRole="button"
								accessibilityLabel="Cancel"
							>
								<Text style={{ color: muted, fontSize: 14 }}>Cancel</Text>
							</Pressable>
							<Pressable
								onPress={handleCreate}
								className="px-4 py-2 rounded-lg"
								style={
									!newName.trim() ? { opacity: 0.5 } : { backgroundColor: bg }
								}
								disabled={!newName.trim()}
							>
								<Text
									style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}
								>
									Create
								</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</View>
	);
}
