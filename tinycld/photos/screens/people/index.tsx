import { DocumentTitle } from "@tinycld/core/components/DocumentTitle";
import { LoadingState } from "@tinycld/core/components/LoadingState";
import { useAuthedThumbnailURL } from "@tinycld/core/file-viewer/use-authed-file-url";
import { useOrgHref } from "@tinycld/core/lib/org-routes";
import { useThemeColor } from "@tinycld/core/lib/use-app-theme";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Users } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import {
	FlatList,
	type LayoutChangeEvent,
	Pressable,
	Text,
	View,
} from "react-native";

import { usePeople } from "../../hooks/usePeople";
import type { PersonView } from "../../types";

const PHOTOS_COLLECTION = "photos_items";
const COLS = 3;
const GAP = 12;
const PADDING = 16;

interface PersonCardProps {
	person: PersonView;
	size: number;
	onPress: (id: string) => void;
}

const PersonCard = memo(function PersonCard({
	person,
	size,
	onPress,
}: PersonCardProps) {
	const fg = useThemeColor("foreground");
	const muted = useThemeColor("muted-foreground");

	const source = person.thumbnailPhotoId
		? {
				collectionId: PHOTOS_COLLECTION,
				recordId: person.thumbnailPhotoId,
				fileName: person.thumbnailPhotoFile ?? "",
				displayName: person.name,
				mimeType: "image/jpeg",
				size: 0,
				thumbnailFileName:
					person.thumbnailPhotoThumb || person.thumbnailPhotoFile || undefined,
			}
		: undefined;

	const thumbSize = `${Math.round(size * 2)}x${Math.round(size * 2)}`;
	const { url: thumbnailUrl } = useAuthedThumbnailURL(source, thumbSize);

	return (
		<Pressable
			onPress={() => onPress(person.id)}
			style={{ flex: 1, alignItems: "center" }}
			accessibilityRole="button"
			accessibilityLabel={person.name}
		>
			<View
				style={{ width: size, height: size, borderRadius: size / 2 }}
				className="overflow-hidden bg-muted-foreground/10"
			>
				{thumbnailUrl ? (
					<Image
						source={{ uri: thumbnailUrl }}
						style={{ width: size, height: size }}
						contentFit="cover"
						cachePolicy="memory-disk"
						recyclingKey={person.id}
						transition={150}
					/>
				) : (
					<View className="flex-1 items-center justify-center">
						<Text
							style={{ color: muted, fontSize: size * 0.38, fontWeight: "600" }}
						>
							{person.name.charAt(0).toUpperCase()}
						</Text>
					</View>
				)}
			</View>
			<Text
				numberOfLines={1}
				style={{
					color: fg,
					fontSize: 12,
					fontWeight: "500",
					marginTop: 6,
					maxWidth: size,
				}}
			>
				{person.name}
			</Text>
		</Pressable>
	);
});

export default function PeopleScreen() {
	const { people, isLoading } = usePeople();
	const bg = useThemeColor("background");
	const muted = useThemeColor("muted-foreground");
	const orgHref = useOrgHref();

	const [containerWidth, setContainerWidth] = useState(0);
	const onLayout = useCallback((e: LayoutChangeEvent) => {
		setContainerWidth(e.nativeEvent.layout.width);
	}, []);

	const cardSize = useMemo(() => {
		if (containerWidth <= 0) return 80;
		const inner = containerWidth - PADDING * 2;
		return Math.floor((inner - (COLS - 1) * GAP) / COLS);
	}, [containerWidth]);

	const handlePersonPress = useCallback(
		(id: string) => {
			router.push(orgHref(`photos/people/${id}`));
		},
		[orgHref],
	);

	const renderPerson = useCallback(
		({ item }: { item: PersonView }) => (
			<PersonCard person={item} size={cardSize} onPress={handlePersonPress} />
		),
		[cardSize, handlePersonPress],
	);

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
				<Text
					style={{
						color: muted,
						fontSize: 16,
						marginTop: 12,
						textAlign: "center",
					}}
				>
					No people found yet. Enable ML face detection to automatically
					identify people in your photos.
				</Text>
			</View>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: bg }} onLayout={onLayout}>
			<DocumentTitle pkg="People" />
			<FlatList
				data={people}
				renderItem={renderPerson}
				keyExtractor={(item) => item.id}
				numColumns={COLS}
				contentContainerStyle={{ padding: PADDING }}
				columnWrapperStyle={{ gap: GAP, marginBottom: GAP + 18 }}
			/>
		</View>
	);
}
