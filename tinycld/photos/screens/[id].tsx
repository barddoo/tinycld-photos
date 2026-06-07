import { getPreviewActionFactories } from "@tinycld/core/file-viewer/preview-action-registry";
import {
	buildAuthedFileURL,
	getFileToken,
	useAuthedFileURL,
	useAuthedThumbnailURL,
} from "@tinycld/core/file-viewer/use-authed-file-url";
import { useOrgHref } from "@tinycld/core/lib/org-routes";
import { pb } from "@tinycld/core/lib/pocketbase";
import { useThemeColor } from "@tinycld/core/lib/use-app-theme";
import { useCurrentUserOrg } from "@tinycld/core/lib/use-current-user-org";
import { useOrgInfo } from "@tinycld/core/lib/use-org-info";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
	ArrowLeft,
	BookmarkPlus,
	Download,
	Heart,
	Info,
	MapPin,
	Play,
	RotateCcw,
	Share2,
	Trash2,
	X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Image,
	Linking,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	Share,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	createAnimatedComponent,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { useAlbumMutations } from "../hooks/useAlbumMutations";
import { useAlbums } from "../hooks/useAlbums";
import { usePhotoMutations } from "../hooks/usePhotoMutations";
import { usePhotos } from "../hooks/usePhotos";
import { photoToSource } from "../lib/file-url";
import type { PhotoView } from "../types";

const AnimatedImage = createAnimatedComponent(ExpoImage);

const takenDateFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	year: "numeric",
	month: "long",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

// Hoisted static styles
const s = {
	screen: { flex: 1, backgroundColor: "#000" } as const,
	topBar: { backgroundColor: "rgba(0,0,0,0.4)" } as const,
	infoOverlay: { backgroundColor: "rgba(0,0,0,0.9)" } as const,
	centerBase: {
		justifyContent: "center" as const,
		alignItems: "center" as const,
	} as const,
	mediaBase: {
		justifyContent: "center" as const,
		alignItems: "center" as const,
	} as const,
	videoBase: { backgroundColor: "#000" } as const,
	playButton: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "center" as const,
		alignItems: "center" as const,
	} as const,
	durationBadge: {
		backgroundColor: "rgba(0,0,0,0.7)",
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 4,
	} as const,
	modalOverlay: {
		flex: 1,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		paddingHorizontal: 24,
		backgroundColor: "rgba(0,0,0,0.5)",
	} as const,
	modalContent: {
		width: "100%",
		maxWidth: 448,
		borderRadius: 12,
		padding: 20,
		gap: 12,
		backgroundColor: "#1c1c1e",
	} as const,
	albumItem: {
		paddingVertical: 12,
		paddingHorizontal: 8,
		borderRadius: 8,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(55,65,81,0.5)",
	} as const,
	emptyAlbums: {
		color: "#666",
		fontSize: 14,
		textAlign: "center" as const,
		paddingVertical: 12,
	} as const,
	cancelText: { color: "#9ca3af", fontSize: 14 } as const,
	input: {
		backgroundColor: "#333",
		minHeight: 60,
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	} as const,
	saveButton: {
		backgroundColor: "#60a5fa",
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 6,
		alignSelf: "flex-end" as const,
	} as const,
	actionButton: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "rgba(75,85,99,1)",
	} as const,
	disabledButton: { opacity: 0.5 } as const,
	infoTitle: { color: "#fff", fontSize: 17, fontWeight: "600" } as const,
	infoDate: { color: "#9ca3af", fontSize: 12 } as const,
	infoLabel: { color: "#9ca3af", fontSize: 12, marginBottom: 4 } as const,
	editLink: { color: "#60a5fa", fontSize: 12 } as const,
} as const;

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function prefetchImage(
	source: { collectionId: string; recordId: string; fileName: string },
	_size: string,
) {
	if (!pb.authStore.isValid) return;
	const token = pb.files.getToken?.();
	if (!token) return;
	const url = pb.files.getURL(
		{ collectionId: source.collectionId, id: source.recordId },
		source.fileName,
		{ token },
	);
	if (Platform.OS === "web") {
		const link = document.createElement("link");
		link.rel = "prefetch";
		link.href = url;
		document.head.appendChild(link);
	}
	Image.prefetch(url);
}

export default function PhotoDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const windowDimensions = useWindowDimensions();
	const [viewerSize, setViewerSize] = useState({
		width: windowDimensions.width,
		height: windowDimensions.height,
	});
	const screenWidth = Math.max(1, viewerSize.width);
	const screenHeight = Math.max(1, viewerSize.height);
	const { orgSlug, orgId } = useOrgInfo();
	const userOrg = useCurrentUserOrg(orgSlug);
	const userOrgId = userOrg?.id ?? "";
	const orgHref = useOrgHref();

	const { allPhotos } = usePhotos("timeline");
	const initialIndex = useMemo(
		() => allPhotos.findIndex((p) => p.id === id),
		[allPhotos, id],
	);
	const [activeIndex, setActiveIndex] = useState(Math.max(0, initialIndex));
	const [scrollEnabled, setScrollEnabled] = useState(true);
	const flatListRef = useRef<FlatList<PhotoView>>(null);

	const photo = allPhotos[activeIndex];
	const {
		toggleFavorite,
		trashPhoto,
		restorePhoto,
		permanentlyDelete,
		updateDescription,
	} = usePhotoMutations(orgId, userOrgId);
	const { albums } = useAlbums();
	const { addPhotoToAlbum } = useAlbumMutations(orgId, userOrgId);

	const [showInfo, setShowInfo] = useState(false);
	const [showAlbumPicker, setShowAlbumPicker] = useState(false);
	const [isDownloading, setIsDownloading] = useState(false);

	const handleBack = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace(orgHref("photos"));
	}, [orgHref]);

	const handleToggleInfo = useCallback(() => {
		setShowInfo((prev) => !prev);
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
	}, []);

	const photoId = photo?.id;
	const photoIsFavorite = photo?.isFavorite;

	const handleToggleFavorite = useCallback(async () => {
		if (!photoId) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		await toggleFavorite(photoId, photoIsFavorite);
	}, [photoId, photoIsFavorite, toggleFavorite]);

	const handleTrash = useCallback(async () => {
		if (!photoId) return;
		Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
		await trashPhoto(photoId);
		handleBack();
	}, [photoId, trashPhoto, handleBack]);

	const handleRestore = useCallback(async () => {
		if (!photoId) return;
		await restorePhoto(photoId);
		handleBack();
	}, [photoId, restorePhoto, handleBack]);

	const handlePermanentDelete = useCallback(() => {
		if (!photoId) return;
		Alert.alert(
			"Delete permanently?",
			"This photo will be permanently deleted and cannot be recovered.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
						await permanentlyDelete(photoId);
						handleBack();
					},
				},
			],
		);
	}, [photoId, permanentlyDelete, handleBack]);

	const handleDownload = useCallback(async () => {
		if (!photo) return;
		setIsDownloading(true);
		try {
			const token = await getFileToken();
			if (!token) return;
			const source = photoToSource(photo);
			const url = buildAuthedFileURL(source, token);
			if (!url) return;
			if (Platform.OS === "web") {
				const a = document.createElement("a");
				a.href = url;
				a.download = photo.name;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
			} else {
				await Linking.openURL(url);
			}
		} finally {
			setIsDownloading(false);
		}
	}, [photo]);

	const handleShare = useCallback(async () => {
		if (!photo) return;
		const source = photoToSource(photo);
		const token = await getFileToken();
		if (!token) return;
		const url = buildAuthedFileURL(source, token);
		if (!url) return;
		try {
			await Share.share({
				title: photo.name,
				url,
				message: photo.description || undefined,
			});
		} catch {
			// share cancelled
		}
	}, [photo]);

	const onMomentumEnd = useCallback(
		(e: { nativeEvent: { contentOffset: { x: number } } }) => {
			const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
			setActiveIndex(index);
		},
		[screenWidth],
	);

	const preloadAdjacent = useCallback(() => {
		const indices = [activeIndex - 1, activeIndex + 1].filter(
			(i) => i >= 0 && i < allPhotos.length,
		);
		for (const i of indices) {
			const p = allPhotos[i];
			if (p) {
				const src = photoToSource(p);
				prefetchImage(
					src,
					`${Math.round(screenWidth * 2)}x${Math.round(screenHeight * 2)}`,
				);
			}
		}
	}, [activeIndex, allPhotos, screenWidth, screenHeight]);

	useEffect(() => {
		preloadAdjacent();
	}, [preloadAdjacent]);

	useEffect(() => {
		if (Platform.OS !== "web") return;

		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") handleBack();
			else if (e.key === "ArrowRight" && activeIndex < allPhotos.length - 1) {
				flatListRef.current?.scrollToIndex({
					index: activeIndex + 1,
					animated: true,
				});
				setActiveIndex(activeIndex + 1);
			} else if (e.key === "ArrowLeft" && activeIndex > 0) {
				flatListRef.current?.scrollToIndex({
					index: activeIndex - 1,
					animated: true,
				});
				setActiveIndex(activeIndex - 1);
			} else if (e.key === " " || e.key === "f") {
				e.preventDefault();
				handleToggleFavorite();
			} else if (e.key === "i") {
				handleToggleInfo();
			}
		};

		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [
		activeIndex,
		allPhotos.length,
		handleBack,
		handleToggleFavorite,
		handleToggleInfo,
	]);

	const handleSetScrollEnabled = useCallback((zoomed: boolean) => {
		setScrollEnabled(!zoomed);
	}, []);

	const handleLayout = useCallback(
		(event: { nativeEvent: { layout: { width: number; height: number } } }) => {
			const { width, height } = event.nativeEvent.layout;
			setViewerSize((prev) => {
				if (
					Math.round(prev.width) === Math.round(width) &&
					Math.round(prev.height) === Math.round(height)
				)
					return prev;
				return { width, height };
			});
		},
		[],
	);

	const renderPhoto = useCallback(
		({ item }: { item: PhotoView }) => {
			if (item.type === "video") {
				return (
					<VideoPlayerInline
						photo={item}
						width={screenWidth}
						height={screenHeight}
					/>
				);
			}
			return (
				<ZoomableImage
					photo={item}
					width={screenWidth}
					height={screenHeight}
					onZoomChange={handleSetScrollEnabled}
					onTap={handleToggleInfo}
					onSwipeDown={handleBack}
					onSwipeUp={handleToggleFavorite}
				/>
			);
		},
		[
			handleToggleInfo,
			handleBack,
			handleToggleFavorite,
			handleSetScrollEnabled,
			screenWidth,
			screenHeight,
		],
	);

	const getItemLayoutFn = useCallback(
		(_data: ArrayLike<PhotoView> | null | undefined, index: number) => ({
			length: screenWidth,
			offset: screenWidth * index,
			index,
		}),
		[screenWidth],
	);

	const keyExtractorFn = useCallback((p: PhotoView) => p.id, []);

	const handleCloseInfo = useCallback(() => setShowInfo(false), []);
	const handleOpenAlbumPicker = useCallback(() => setShowAlbumPicker(true), []);
	const handleUpdateDescription = useCallback(
		(desc: string) => {
			if (photo) updateDescription(photo.id, desc);
		},
		[photo, updateDescription],
	);
	const handleAddToAlbum = useCallback(
		async (albumId: string) => {
			if (photo) {
				await addPhotoToAlbum(albumId, photo.id);
				setShowAlbumPicker(false);
			}
		},
		[photo, addPhotoToAlbum],
	);
	const handleCloseAlbumPicker = useCallback(
		() => setShowAlbumPicker(false),
		[],
	);

	return (
		<View style={s.screen} onLayout={handleLayout}>
			<FlatList<PhotoView>
				key={`${Math.round(screenWidth)}x${Math.round(screenHeight)}`}
				ref={flatListRef}
				data={allPhotos}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				scrollEnabled={scrollEnabled}
				onMomentumScrollEnd={onMomentumEnd}
				initialScrollIndex={activeIndex}
				getItemLayout={getItemLayoutFn}
				keyExtractor={keyExtractorFn}
				renderItem={renderPhoto}
				maxToRenderPerBatch={5}
				windowSize={5}
				removeClippedSubviews={Platform.OS === "android"}
			/>

			<View
				className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4 pt-12 pb-3"
				style={s.topBar}
			>
				<Pressable
					onPress={handleBack}
					className="p-2"
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<ArrowLeft size={24} color="#fff" />
				</Pressable>
				<Text
					numberOfLines={1}
					className="flex-1 text-center text-white font-medium mx-2"
					style={{ fontSize: 16 }}
				>
					{photo?.name ?? ""}
				</Text>
				<Pressable
					onPress={handleToggleInfo}
					className="p-2"
					accessibilityRole="button"
					accessibilityLabel="Photo info"
				>
					<Info size={22} color={showInfo ? "#60a5fa" : "#fff"} />
				</Pressable>
			</View>

			{showInfo && photo ? (
				<RichInfoOverlay
					photo={photo}
					screenHeight={screenHeight}
					onClose={handleCloseInfo}
					onToggleFavorite={handleToggleFavorite}
					onTrash={handleTrash}
					onRestore={handleRestore}
					onPermanentDelete={handlePermanentDelete}
					onDownload={handleDownload}
					onShare={handleShare}
					onUpdateDescription={handleUpdateDescription}
					onAddToAlbum={handleOpenAlbumPicker}
					isDownloading={isDownloading}
				/>
			) : null}

			{showAlbumPicker && photo ? (
				<AlbumPickerModal
					albums={albums}
					photoId={photo.id}
					onAdd={handleAddToAlbum}
					onClose={handleCloseAlbumPicker}
				/>
			) : null}
		</View>
	);
}

function ZoomableImage({
	photo,
	width,
	height,
	onZoomChange,
	onTap,
	onSwipeDown,
	onSwipeUp,
}: {
	photo: PhotoView;
	width: number;
	height: number;
	onZoomChange: (zoomed: boolean) => void;
	onTap: () => void;
	onSwipeDown: () => void;
	onSwipeUp: () => void;
}) {
	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);

	const source = useMemo(() => photoToSource(photo), [photo]);
	// Use original file (not pre-generated thumbnail) as the base for PocketBase's
	// on-the-fly resize, so the viewer always derives from the full-res original.
	const viewerSource = useMemo(
		() => ({ ...source, thumbnailFileName: undefined }),
		[source],
	);
	const { url: thumbUrl, isLoading: thumbLoading } = useAuthedThumbnailURL(
		viewerSource,
		`${Math.round(width * 2)}x${Math.round(height * 2)}`,
	);
	const { url: fullUrl } = useAuthedFileURL(source);

	const [imageError, setImageError] = useState(false);
	const [useFullRes, setUseFullRes] = useState(false);

	const handleZoomChange = useCallback(
		(zoomed: boolean) => {
			onZoomChange(zoomed);
			if (zoomed) {
				setUseFullRes(true);
			}
		},
		[onZoomChange],
	);

	const handleSwipeDown = useCallback(() => {
		onSwipeDown();
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
	}, [onSwipeDown]);

	const handleSwipeUp = useCallback(() => {
		onSwipeUp();
	}, [onSwipeUp]);

	const handleTap = useCallback(() => {
		if (scale.value <= 1.05) {
			runOnJS(onTap)();
		}
	}, [onTap, scale]);

	const pinchGesture = Gesture.Pinch()
		.onStart(() => {
			savedScale.set(scale.value);
		})
		.onUpdate((e) => {
			const newScale = Math.max(1, Math.min(8, savedScale.value * e.scale));
			scale.set(newScale);
		})
		.onEnd(() => {
			if (scale.value <= 1.1) {
				scale.set(withSpring(1));
				translateX.set(withSpring(0));
				translateY.set(withSpring(0));
				runOnJS(handleZoomChange)(false);
			} else {
				runOnJS(handleZoomChange)(true);
			}
			runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
		});

	const panGesture = Gesture.Pan()
		.minPointers(1)
		.onStart(() => {
			savedTranslateX.set(translateX.value);
			savedTranslateY.set(translateY.value);
		})
		.onUpdate((e) => {
			if (scale.value > 1.1) {
				const maxOffset = ((scale.value - 1) * width) / 2;
				translateX.set(
					Math.max(
						-maxOffset,
						Math.min(maxOffset, savedTranslateX.value + e.translationX),
					),
				);
				const maxOffsetY = ((scale.value - 1) * height) / 2;
				translateY.set(
					Math.max(
						-maxOffsetY,
						Math.min(maxOffsetY, savedTranslateY.value + e.translationY),
					),
				);
			} else {
				translateX.set(e.translationX);
				translateY.set(e.translationY);
			}
		})
		.onEnd((e) => {
			if (scale.value <= 1.1) {
				if (e.translationY < -80 && Math.abs(e.translationX) < 50) {
					runOnJS(handleSwipeUp)();
				} else if (e.translationY > 100 && Math.abs(e.translationX) < 50) {
					runOnJS(handleSwipeDown)();
				} else {
					translateX.set(withSpring(0));
					translateY.set(withSpring(0));
				}
			} else {
				translateX.set(withSpring(translateX.value));
				translateY.set(withSpring(translateY.value));
			}
		});

	const tapGesture = Gesture.Tap()
		.maxDuration(250)
		.onEnd(() => {
			runOnJS(handleTap)();
		});

	const composed = Gesture.Race(
		tapGesture,
		Gesture.Simultaneous(pinchGesture, panGesture),
	);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	const displayUrl = useFullRes && fullUrl ? fullUrl : thumbUrl;

	if (thumbLoading || !thumbUrl) {
		return (
			<View style={[s.centerBase, { width, height }]}>
				<ActivityIndicator size="large" color="#666" />
			</View>
		);
	}

	return (
		<GestureDetector gesture={composed}>
			<Animated.View style={[s.mediaBase, { width, height }]}>
				<AnimatedImage
					source={{ uri: displayUrl }}
					style={[{ width, height }, animatedStyle]}
					contentFit="contain"
					cachePolicy="memory-disk"
					recyclingKey={photo.id}
					onError={() => setImageError(true)}
				/>
				{imageError && (
					<View style={s.centerBase} className="absolute inset-0">
						<Text className="text-gray-400 text-center px-8">
							Failed to load image
						</Text>
					</View>
				)}
			</Animated.View>
		</GestureDetector>
	);
}

function RichInfoOverlay({
	photo,
	screenHeight,
	onClose,
	onToggleFavorite,
	onTrash,
	onRestore,
	onPermanentDelete,
	onDownload,
	onShare,
	onUpdateDescription,
	onAddToAlbum,
	isDownloading,
}: {
	photo: PhotoView;
	screenHeight: number;
	onClose: () => void;
	onToggleFavorite: () => void;
	onTrash: () => void;
	onRestore: () => void;
	onPermanentDelete: () => void;
	onDownload: () => void;
	onShare: () => void;
	onUpdateDescription: (desc: string) => void;
	onAddToAlbum: () => void;
	isDownloading: boolean;
}) {
	const [editingDesc, setEditingDesc] = useState(false);
	const [descDraft, setDescDraft] = useState(photo.description || "");
	const isTrashed = !!photo.trashedAt;

	const takenDate = photo.takenAt
		? takenDateFormatter.format(new Date(photo.takenAt))
		: "Unknown date";

	const handleSaveDesc = useCallback(() => {
		onUpdateDescription(descDraft);
		setEditingDesc(false);
	}, [descDraft, onUpdateDescription]);

	const handleToggleEditDesc = useCallback(() => {
		setEditingDesc((prev) => !prev);
	}, []);

	const hasExif = !!(
		photo.cameraMake ||
		photo.cameraModel ||
		photo.iso ||
		photo.aperture ||
		photo.focalLength ||
		photo.lensModel
	);

	return (
		<View
			className="absolute bottom-0 left-0 right-0"
			style={[s.infoOverlay, { maxHeight: screenHeight * 0.65 }]}
		>
			<View className="flex-row items-center justify-between px-4 pt-3 pb-2">
				<Text style={s.infoTitle}>Info</Text>
				<Pressable
					onPress={onClose}
					className="p-2"
					accessibilityRole="button"
					accessibilityLabel="Close"
				>
					<X size={20} color="#fff" />
				</Pressable>
			</View>

			<ScrollView
				className="px-4 pb-4"
				style={{ maxHeight: screenHeight * 0.5 }}
			>
				<View className="gap-3">
					<Text className="text-white text-lg font-semibold">{photo.name}</Text>
					<Text className="text-gray-400 text-sm">{takenDate}</Text>

					<View className="flex-row flex-wrap gap-x-6 gap-y-1">
						<Text className="text-gray-400 text-sm">
							{photo.width} × {photo.height}
						</Text>
						<Text className="text-gray-400 text-sm">
							{formatBytes(photo.size)}
						</Text>
						<Text className="text-gray-400 text-sm">{photo.mimeType}</Text>
					</View>

					{hasExif ? (
						<View className="pt-1 border-t border-gray-700/50">
							<Text style={s.infoLabel}>Camera</Text>
							<View className="flex-row flex-wrap gap-x-6 gap-y-1">
								{photo.cameraMake || photo.cameraModel ? (
									<Text className="text-gray-300 text-sm">
										{photo.cameraMake} {photo.cameraModel}
									</Text>
								) : null}
								{photo.lensModel ? (
									<Text className="text-gray-300 text-sm">
										{photo.lensModel}
									</Text>
								) : null}
								{photo.iso > 0 ? (
									<Text className="text-gray-300 text-sm">ISO {photo.iso}</Text>
								) : null}
								{photo.aperture ? (
									<Text className="text-gray-300 text-sm">
										{photo.aperture}
									</Text>
								) : null}
								{photo.focalLength ? (
									<Text className="text-gray-300 text-sm">
										{photo.focalLength}
									</Text>
								) : null}
							</View>
						</View>
					) : null}

					{photo.location ? (
						<View className="flex-row items-center gap-1.5">
							<MapPin size={14} color="#9ca3af" />
							<Text className="text-gray-300 text-sm">{photo.location}</Text>
						</View>
					) : null}

					<View className="pt-1">
						<View className="flex-row items-center justify-between">
							<Text style={s.infoLabel}>Description</Text>
							<Pressable
								onPress={handleToggleEditDesc}
								accessibilityRole="button"
								accessibilityLabel={
									editingDesc
										? "Cancel editing description"
										: "Edit description"
								}
							>
								<Text style={s.editLink}>
									{editingDesc ? "Cancel" : "Edit"}
								</Text>
							</Pressable>
						</View>
						{editingDesc ? (
							<View className="mt-1 gap-2">
								<TextInput
									value={descDraft}
									onChangeText={setDescDraft}
									multiline
									placeholder="Add a description..."
									placeholderTextColor="#666"
									className="rounded-lg px-3 py-2 text-white text-sm"
									style={s.input}
								/>
								<Pressable
									onPress={handleSaveDesc}
									className="self-end px-3 py-1.5 rounded-lg"
									style={s.saveButton}
								>
									<Text className="text-white text-xs font-medium">Save</Text>
								</Pressable>
							</View>
						) : (
							<Text className="text-gray-300 text-sm mt-0.5">
								{photo.description || "No description"}
							</Text>
						)}
					</View>

					<View className="flex-row flex-wrap gap-3 pt-2">
						{isTrashed ? (
							<>
								<ActionButton
									icon={RotateCcw}
									label="Restore"
									onPress={onRestore}
								/>
								<ActionButton
									icon={Trash2}
									label="Delete permanently"
									onPress={onPermanentDelete}
									danger
								/>
							</>
						) : (
							<>
								<ActionButton
									icon={Heart}
									label={photo.isFavorite ? "Unfavorite" : "Favorite"}
									onPress={onToggleFavorite}
									active={photo.isFavorite}
								/>
								<ActionButton
									icon={BookmarkPlus}
									label="Add to Album"
									onPress={onAddToAlbum}
								/>
								<ActionButton
									icon={Download}
									label={isDownloading ? "Downloading..." : "Download"}
									onPress={onDownload}
									disabled={isDownloading}
								/>
								<ActionButton icon={Share2} label="Share" onPress={onShare} />
								<RegistryActionButtons photo={photo} onClose={onClose} />
								<ActionButton
									icon={Trash2}
									label="Delete"
									onPress={onTrash}
									danger
								/>
							</>
						)}
					</View>
				</View>
			</ScrollView>
		</View>
	);
}

function RegistryActionButtons({
	photo,
	onClose,
}: {
	photo: PhotoView;
	onClose: () => void;
}) {
	const actions = getPreviewActionFactories()
		.map((f) => f())
		.filter((a) => a.isApplicable?.(photoToSource(photo)) ?? true);

	return actions.map((a) => (
		<ActionButton
			key={a.id}
			icon={a.icon}
			label={a.label}
			onPress={() => a.onPress(photoToSource(photo), { close: onClose })}
			disabled={a.isPending}
		/>
	));
}

function AlbumPickerModal({
	albums,
	onAdd,
	onClose,
}: {
	albums: { id: string; name: string }[];
	photoId: string;
	onAdd: (albumId: string) => void;
	onClose: () => void;
}) {
	const fg = useThemeColor("foreground");
	const muted = useThemeColor("muted-foreground");
	const surface = useThemeColor("surface");
	const border = useThemeColor("border");

	return (
		<Modal visible transparent animationType="fade">
			<View style={s.modalOverlay}>
				<View style={[s.modalContent, { backgroundColor: surface }]}>
					<Text style={[s.infoTitle, { color: fg }]}>Add to Album</Text>
					<ScrollView className="max-h-64">
						{albums.map((album) => (
							<Pressable
								key={album.id}
								onPress={() => onAdd(album.id)}
								style={[s.albumItem, { borderBottomColor: border }]}
								accessibilityRole="button"
							>
								<Text style={{ color: fg, fontSize: 15 }}>{album.name}</Text>
							</Pressable>
						))}
						{albums.length === 0 ? (
							<Text style={[s.emptyAlbums, { color: muted }]}>
								No albums yet
							</Text>
						) : null}
					</ScrollView>
					<Pressable
						onPress={onClose}
						className="self-end px-4 py-2"
						accessibilityRole="button"
						accessibilityLabel="Cancel"
					>
						<Text style={[s.cancelText, { color: muted }]}>Cancel</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

function VideoPlayerInline({
	photo,
	width,
	height,
}: {
	photo: PhotoView;
	width: number;
	height: number;
}) {
	const source = useMemo(() => photoToSource(photo), [photo]);
	const { url: videoUrl, isLoading } = useAuthedFileURL(source);
	const { url: thumbUrl } = useAuthedThumbnailURL(
		source,
		`${Math.round(width * 2)}x${Math.round(height * 2)}`,
	);

	const [isPlaying, setIsPlaying] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (controlsTimer.current) clearTimeout(controlsTimer.current);
		};
	}, []);

	const handlePlay = useCallback(() => {
		if (videoUrl) {
			if (Platform.OS === "web") {
				setIsPlaying(true);
			} else {
				Linking.openURL(videoUrl);
			}
		}
	}, [videoUrl]);

	const handleToggleControls = useCallback(() => {
		setShowControls((prev) => !prev);
		if (controlsTimer.current) clearTimeout(controlsTimer.current);
		controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
	}, []);

	if (isLoading || !videoUrl) {
		return (
			<View style={[s.centerBase, { width, height }]}>
				{thumbUrl ? (
					<ExpoImage
						source={{ uri: thumbUrl }}
						style={{ width, height }}
						contentFit="contain"
						cachePolicy="memory-disk"
					/>
				) : null}
				<ActivityIndicator size="large" color="#fff" className="absolute" />
			</View>
		);
	}

	if (Platform.OS === "web" && isPlaying) {
		return (
			<View
				style={[s.videoBase, { width, height }]}
				onTouchStart={handleToggleControls}
			>
				{/* biome-ignore lint/a11y/useMediaCaption: user uploaded content */}
				<video
					src={videoUrl}
					controls={showControls}
					autoPlay
					style={{ width, height, objectFit: "contain" }}
					onClick={handleToggleControls}
				/>
			</View>
		);
	}

	return (
		<View style={[s.videoBase, { width, height }]}>
			{thumbUrl ? (
				<ExpoImage
					source={{ uri: thumbUrl }}
					style={{ width, height }}
					contentFit="contain"
					cachePolicy="memory-disk"
				/>
			) : null}

			<Pressable
				onPress={handlePlay}
				className="absolute inset-0 items-center justify-center"
				accessibilityRole="button"
				accessibilityLabel="Play video"
			>
				<View style={s.playButton}>
					<Play size={36} color="#fff" fill="#fff" />
				</View>
			</Pressable>

			{photo.duration > 0 ? (
				<View style={s.durationBadge} className="absolute bottom-4 right-4">
					<Text className="text-white text-sm font-medium">
						{formatDuration(photo.duration)}
					</Text>
				</View>
			) : null}
		</View>
	);
}

function ActionButton({
	icon: Icon,
	label,
	onPress,
	active,
	disabled,
	danger,
}: {
	icon: typeof Heart;
	label: string;
	onPress: () => void;
	active?: boolean;
	disabled?: boolean;
	danger?: boolean;
}) {
	const iconColor = active ? "#ef4444" : danger ? "#ef4444" : "#fff";
	return (
		<Pressable
			onPress={onPress}
			style={[s.actionButton, disabled ? s.disabledButton : undefined]}
			className="flex-row items-center gap-2 px-4 py-2 rounded-lg border border-gray-600"
			accessibilityRole="button"
			disabled={disabled}
		>
			<Icon size={16} color={iconColor} />
			<Text className="text-white text-sm font-medium">{label}</Text>
		</Pressable>
	);
}
