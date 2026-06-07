import { useAuthedThumbnailURL } from "@tinycld/core/file-viewer/use-authed-file-url";
import { Play } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";
import type { PhotoView } from "../types";

interface Props {
	photo: PhotoView;
	size: number;
	onPress: (photo: PhotoView) => void;
}

export default function VideoThumbnail({ photo, size, onPress }: Props) {
	const source = {
		collectionId: "photos_items",
		recordId: photo.id,
		fileName: photo.file,
		displayName: photo.name,
		mimeType: photo.mimeType,
		size: photo.size,
		thumbnailFileName: photo.thumbnail || undefined,
	};

	const { url: thumbnailUrl } = useAuthedThumbnailURL(
		source,
		`${size}x${size}`,
	);

	const formatDuration = (ms: number) => {
		const totalSec = Math.floor(ms / 1000);
		const min = Math.floor(totalSec / 60);
		const sec = totalSec % 60;
		return `${min}:${sec.toString().padStart(2, "0")}`;
	};

	return (
		<Pressable
			onPress={() => onPress(photo)}
			className="relative"
			accessibilityRole="button"
			accessibilityLabel={photo.name}
		>
			<View
				style={{ width: size, height: size }}
				className="bg-muted-foreground/10 rounded-lg overflow-hidden"
			>
				{thumbnailUrl ? (
					<Image
						source={{ uri: thumbnailUrl }}
						className="w-full h-full"
						resizeMode="cover"
					/>
				) : (
					<View className="flex-1 items-center justify-center bg-muted-foreground/20">
						<Text style={{ fontSize: 24 }}>🎬</Text>
					</View>
				)}

				<View className="absolute inset-0 items-center justify-center">
					<View className="w-10 h-10 rounded-full bg-black/50 items-center justify-center">
						<Play size={20} color="#fff" fill="#fff" />
					</View>
				</View>

				{photo.duration > 0 && (
					<View className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5">
						<Text className="text-white text-xs font-medium">
							{formatDuration(photo.duration)}
						</Text>
					</View>
				)}
			</View>
		</Pressable>
	);
}
