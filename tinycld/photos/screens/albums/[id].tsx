import { FlashList } from "@shopify/flash-list";
import { DocumentTitle } from "@tinycld/core/components/DocumentTitle";
import { EmptyState } from "@tinycld/core/components/EmptyState";
import { LoadingState } from "@tinycld/core/components/LoadingState";
import { useBreakpoint } from "@tinycld/core/components/workspace/useBreakpoint";
import { useOrgHref } from "@tinycld/core/lib/org-routes";
import { useThemeColor } from "@tinycld/core/lib/use-app-theme";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import DateSectionHeader from "../../components/DateSectionHeader";
import PhotoCard from "../../components/PhotoCard";
import { useAlbum, useAlbumPhotos } from "../../hooks/useAlbums";
import type { PhotoView } from "../../types";

const GRID_GAP = 2;
const GRID_PADDING = 16;
const photoCellStyle = {
	paddingHorizontal: GRID_GAP / 2,
	paddingBottom: GRID_GAP,
} as const;

type ListRow =
	| { kind: "section"; title: string; count: number }
	| { kind: "photo"; photo: PhotoView };

export default function AlbumDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const windowDimensions = useWindowDimensions();
	const [containerWidth, setContainerWidth] = useState(windowDimensions.width);
	const orgHref = useOrgHref();
	const isMobile = useBreakpoint() === "mobile";
	const fg = useThemeColor("foreground");

	const { photos, isLoading } = useAlbumPhotos(id);
	const { name: albumName } = useAlbum(id);

	const cols = isMobile ? 3 : 4;
	const cardSize = Math.max(
		1,
		Math.floor(
			(containerWidth - GRID_PADDING * 2 - GRID_GAP * (cols - 1)) / cols,
		),
	);

	const handleLayout = useCallback(
		(event: { nativeEvent: { layout: { width: number } } }) => {
			const { width } = event.nativeEvent.layout;
			setContainerWidth((prev) =>
				Math.round(prev) === Math.round(width) ? prev : width,
			);
		},
		[],
	);

	const handlePhotoPress = useCallback(
		(photo: PhotoView) => {
			router.push(orgHref("photos/[id]", { id: photo.id }));
		},
		[orgHref],
	);

	const handleBack = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace(orgHref("photos/albums"));
	}, [orgHref]);

	const rows = useMemo<ListRow[]>(() => {
		return photos.map((photo) => ({ kind: "photo" as const, photo }));
	}, [photos]);

	const overrideItemLayout = useCallback((layout: { span?: number }) => {
		layout.span = 1;
	}, []);

	const renderItem = useCallback(
		({ item }: { item: ListRow }) => {
			if (item.kind === "section") {
				return <DateSectionHeader label={item.title} photoCount={item.count} />;
			}
			return (
				<View style={photoCellStyle}>
					<PhotoCard
						photo={item.photo}
						size={cardSize}
						onPress={handlePhotoPress}
					/>
				</View>
			);
		},
		[handlePhotoPress, cardSize],
	);

	const keyExtractor = useCallback((row: ListRow) => {
		if (row.kind === "section") return `section-${row.title}`;
		return row.photo.id;
	}, []);

	if (isLoading) {
		return <LoadingState />;
	}

	return (
		<View className="flex-1 bg-background" onLayout={handleLayout}>
			<DocumentTitle pkg="Album" />
			<View className="flex-row items-center px-4 py-3 border-b border-border">
				<Pressable
					onPress={handleBack}
					className="p-2 mr-2"
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<ArrowLeft size={22} color={fg} />
				</Pressable>
				<Text
					numberOfLines={1}
					style={{ color: fg, fontSize: 17, fontWeight: "600" }}
				>
					{albumName || "Album"}
				</Text>
			</View>
			{rows.length === 0 ? (
				<EmptyState message="No photos in this album yet" />
			) : (
				<FlashList<ListRow>
					key={`cols-${cols}`}
					data={rows}
					renderItem={renderItem}
					keyExtractor={keyExtractor}
					numColumns={cols}
					overrideItemLayout={overrideItemLayout}
					contentContainerStyle={{
						paddingHorizontal: GRID_PADDING - GRID_GAP / 2,
						paddingTop: 8,
					}}
				/>
			)}
		</View>
	);
}
