import { FlashList } from "@shopify/flash-list";
import { DocumentTitle } from "@tinycld/core/components/DocumentTitle";
import { LoadingState } from "@tinycld/core/components/LoadingState";
import { useAuthedThumbnailURL } from "@tinycld/core/file-viewer/use-authed-file-url";
import { useOrgHref } from "@tinycld/core/lib/org-routes";
import { usePocketBase } from "@tinycld/core/lib/pocketbase";
import { useThemeColor } from "@tinycld/core/lib/use-app-theme";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Check, Merge, Users, X } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { usePeople } from "../../hooks/usePeople";
import type { PersonView } from "../../types";

const PHOTOS_COLLECTION = "photos_items";
const COLS = 3;
const GAP = 12;
const PADDING = 16;

interface PersonCardProps {
	id: string;
	name: string;
	thumbnailPhotoId: string | null;
	thumbnailPhotoFile: string | null;
	thumbnailPhotoThumb: string | null;
	size: number;
	selected: boolean;
	selectionMode: boolean;
	onPress: (id: string) => void;
	onLongPress: (id: string) => void;
	primaryColor: string;
	mutedColor: string;
	fgColor: string;
}

const PersonCard = memo(function PersonCard({
	id,
	name,
	thumbnailPhotoId,
	thumbnailPhotoFile,
	thumbnailPhotoThumb,
	size,
	selected,
	selectionMode,
	onPress,
	onLongPress,
	primaryColor,
	mutedColor,
	fgColor,
}: PersonCardProps) {
	const handlePress = useCallback(() => onPress(id), [id, onPress]);
	const handleLongPress = useCallback(() => onLongPress(id), [id, onLongPress]);

	const source = thumbnailPhotoId
		? {
				collectionId: PHOTOS_COLLECTION,
				recordId: thumbnailPhotoId,
				fileName: thumbnailPhotoFile ?? "",
				displayName: name,
				mimeType: "image/jpeg",
				size: 0,
				thumbnailFileName:
					thumbnailPhotoThumb || thumbnailPhotoFile || undefined,
			}
		: undefined;

	const thumbSize = `${Math.round(size * 2)}x${Math.round(size * 2)}`;
	const { url: thumbnailUrl } = useAuthedThumbnailURL(source, thumbSize);

	const avatarStyle = useMemo(
		() => ({
			width: size,
			height: size,
			borderRadius: size / 2,
			borderCurve: "continuous" as const,
			borderWidth: selected ? 3 : 0,
			borderColor: selected ? primaryColor : "transparent",
		}),
		[size, selected, primaryColor],
	);

	const imageStyle = useMemo(() => ({ width: size, height: size }), [size]);

	const initialFontSize = useMemo(() => size * 0.38, [size]);

	const nameStyle = useMemo(
		() => ({ color: fgColor, maxWidth: size }),
		[fgColor, size],
	);

	const badgeStyle = useMemo(
		() => ({ backgroundColor: primaryColor }),
		[primaryColor],
	);

	return (
		<Pressable
			onPress={handlePress}
			onLongPress={handleLongPress}
			style={styles.cardPressable}
			accessibilityRole="button"
			accessibilityLabel={name}
		>
			<View
				style={avatarStyle}
				className="overflow-hidden bg-muted-foreground/10"
			>
				{thumbnailUrl ? (
					<Image
						source={{ uri: thumbnailUrl }}
						style={imageStyle}
						contentFit="cover"
						cachePolicy="memory-disk"
						recyclingKey={id}
						transition={150}
					/>
				) : (
					<View className="flex-1 items-center justify-center">
						<Text
							style={[
								styles.initial,
								{ color: mutedColor, fontSize: initialFontSize },
							]}
						>
							{name.charAt(0).toUpperCase()}
						</Text>
					</View>
				)}
				{selected ? (
					<View style={[styles.checkBadge, badgeStyle]}>
						<Check size={14} color="#fff" />
					</View>
				) : null}
			</View>
			<Text numberOfLines={1} style={[styles.name, nameStyle]}>
				{name}
			</Text>
		</Pressable>
	);
});

export default function PeopleScreen() {
	const { people, isLoading } = usePeople();
	const pb = usePocketBase();
	const bg = useThemeColor("background");
	const muted = useThemeColor("muted-foreground");
	const fg = useThemeColor("foreground");
	const primary = useThemeColor("primary");
	const surface = useThemeColor("surface");
	const orgHref = useOrgHref();

	const [cardSize, setCardSize] = useState(80);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [merging, setMerging] = useState(false);

	const selectionMode = selectedIds.size > 0;

	const handleLayout = useCallback((width: number) => {
		if (width <= 0) return;
		const inner = width - PADDING * 2;
		setCardSize(Math.floor((inner - (COLS - 1) * GAP) / COLS));
	}, []);

	const handlePersonPress = useCallback(
		(id: string) => {
			if (selectionMode) {
				setSelectedIds((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
			} else {
				router.push(orgHref(`photos/people/${id}`));
			}
		},
		[selectionMode, orgHref],
	);

	const handleLongPress = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.add(id);
			return next;
		});
	}, []);

	const handleCancelSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	const handleMerge = useCallback(async () => {
		const ids = Array.from(selectedIds);
		if (ids.length < 2) return;

		Alert.alert(
			"Merge people",
			`Merge ${ids.length} people into one? This cannot be undone.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Merge",
					style: "destructive",
					onPress: async () => {
						setMerging(true);
						try {
							const [target, ...sources] = ids;
							for (const src of sources) {
								await pb.send("/api/photos/people/merge", {
									method: "POST",
									body: JSON.stringify({ source_id: src, target_id: target }),
									headers: { "Content-Type": "application/json" },
								});
							}
							setSelectedIds(new Set());
						} catch {
							Alert.alert("Error", "Failed to merge people");
						} finally {
							setMerging(false);
						}
					},
				},
			],
		);
	}, [selectedIds, pb]);

	const renderPerson = useCallback(
		({ item }: { item: PersonView }) => (
			<PersonCard
				id={item.id}
				name={item.name}
				thumbnailPhotoId={item.thumbnailPhotoId}
				thumbnailPhotoFile={item.thumbnailPhotoFile}
				thumbnailPhotoThumb={item.thumbnailPhotoThumb}
				size={cardSize}
				selected={selectedIds.has(item.id)}
				selectionMode={selectionMode}
				onPress={handlePersonPress}
				onLongPress={handleLongPress}
				primaryColor={primary}
				mutedColor={muted}
				fgColor={fg}
			/>
		),
		[
			cardSize,
			selectedIds,
			selectionMode,
			handlePersonPress,
			handleLongPress,
			primary,
			muted,
			fg,
		],
	);

	const bottomBarStyle = useMemo(
		() => ({ backgroundColor: bg, borderTopColor: muted + "33" }),
		[bg, muted],
	);

	const mergeButtonStyle = useMemo(
		() => ({
			backgroundColor: selectedIds.size >= 2 ? primary : muted + "33",
			opacity: merging ? 0.6 : 1,
		}),
		[selectedIds.size, primary, muted, merging],
	);

	const mergeTextStyle = useMemo(
		() => ({ color: selectedIds.size >= 2 ? "#fff" : muted }),
		[selectedIds.size, muted],
	);

	const mergeIconColor = selectedIds.size >= 2 ? "#fff" : muted;

	if (isLoading) {
		return <LoadingState />;
	}

	if (people.length === 0) {
		return (
			<View
				className="flex-1 items-center justify-center px-8"
				style={{ backgroundColor: bg }}
			>
				<DocumentTitle pkg="People" />
				<Users size={48} color={muted} accessibilityRole="image" />
				<Text style={[styles.emptyText, { color: muted }]}>
					No people found yet. Enable ML face detection to automatically
					identify people in your photos.
				</Text>
			</View>
		);
	}

	return (
		<View
			style={[styles.root, { backgroundColor: bg }]}
			onLayout={(e) => handleLayout(e.nativeEvent.layout.width)}
		>
			<DocumentTitle pkg="People" />
			<FlashList<PersonView>
				data={people}
				renderItem={renderPerson}
				keyExtractor={(item) => item.id}
				numColumns={COLS}
				contentContainerStyle={{
					padding: PADDING,
					paddingBottom: selectionMode ? 100 : PADDING,
				}}
			/>
			{selectionMode ? (
				<View style={[styles.bottomBar, bottomBarStyle]}>
					<Pressable onPress={handleCancelSelection} style={styles.cancelBtn}>
						<X size={22} color={muted} />
					</Pressable>
					<Text style={[styles.selectionCount, { color: fg }]}>
						{selectedIds.size} selected
					</Text>
					<Pressable
						onPress={handleMerge}
						disabled={selectedIds.size < 2 || merging}
						style={[styles.mergeBtn, mergeButtonStyle]}
					>
						<Merge size={16} color={mergeIconColor} />
						<Text style={[styles.mergeBtnText, mergeTextStyle]}>
							{merging ? "Merging…" : "Merge"}
						</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	cardPressable: {
		flex: 1,
		alignItems: "center",
	},
	initial: {
		fontWeight: "600",
	},
	checkBadge: {
		position: "absolute",
		bottom: 4,
		right: 4,
		width: 22,
		height: 22,
		borderRadius: 11,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
	},
	name: {
		fontSize: 12,
		fontWeight: "500",
		marginTop: 6,
	},
	emptyText: {
		fontSize: 16,
		marginTop: 12,
		textAlign: "center",
	},
	bottomBar: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopWidth: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 16,
		paddingBottom: 32,
	},
	cancelBtn: {
		padding: 8,
	},
	selectionCount: {
		fontSize: 14,
		fontWeight: "500",
	},
	mergeBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		borderCurve: "continuous",
	},
	mergeBtnText: {
		fontSize: 14,
		fontWeight: "600",
	},
});
