import type {
	PhotoItem,
	PhotosFace,
	PhotosPerson,
	PhotoView,
} from "~/tinycld/photos/types";

export function photoItem(
	id: string,
	overrides: Partial<PhotoItem> = {},
): PhotoItem {
	return {
		id,
		org: "org-1",
		name: `Photo ${id}`,
		file: `${id}.jpg`,
		thumbnail: `${id}_thumb.jpg`,
		type: "image",
		taken_at: "2024-01-15T10:00:00Z",
		width: 1920,
		height: 1080,
		size: 2097152,
		mime_type: "image/jpeg",
		description: "",
		is_favorite: false,
		trashed_at: "",
		duration: 0,
		live_photo_pair_id: "",
		owner: "owner-1",
		search_text: "",
		location: "",
		latitude: null,
		longitude: null,
		smart_search_vector: [],
		perceptual_hash: "",
		ml_status: "done",
		camera_make: "",
		camera_model: "",
		lens_model: "",
		iso: 0,
		aperture: "",
		focal_length: "",
		created: "2024-01-15T10:00:00Z",
		updated: "2024-01-15T10:00:00Z",
		...overrides,
	};
}

export function photoView(
	id: string,
	overrides: Partial<PhotoView> = {},
): PhotoView {
	return {
		id,
		name: `Photo ${id}`,
		file: `${id}.jpg`,
		thumbnail: `${id}_thumb.jpg`,
		type: "image",
		takenAt: "2024-01-15T10:00:00Z",
		width: 1920,
		height: 1080,
		size: 2097152,
		mimeType: "image/jpeg",
		description: "",
		isFavorite: false,
		trashedAt: "",
		duration: 0,
		livePhotoPairId: "",
		searchText: "",
		location: "",
		latitude: null,
		longitude: null,
		perceptualHash: "",
		mlStatus: "done",
		cameraMake: "",
		cameraModel: "",
		lensModel: "",
		iso: 0,
		aperture: "",
		focalLength: "",
		owner: "owner-1",
		created: "2024-01-15T10:00:00Z",
		updated: "2024-01-15T10:00:00Z",
		...overrides,
	};
}

export function photoPerson(
	id: string,
	overrides: Partial<PhotosPerson> = {},
): PhotosPerson {
	return {
		id,
		name: `Person ${id}`,
		thumbnail_face: null,
		is_hidden: false,
		birth_date: null,
		color: null,
		org: "org-1",
		owner: "owner-1",
		created: "2024-01-15T10:00:00Z",
		updated: "2024-01-15T10:00:00Z",
		...overrides,
	};
}

export function photoFace(
	id: string,
	photoId: string,
	overrides: Partial<PhotosFace> = {},
): PhotosFace {
	return {
		id,
		photo: photoId,
		person: null,
		bounding_box: { x1: 10, y1: 10, x2: 100, y2: 100 },
		embedding: [],
		image_width: 1920,
		image_height: 1080,
		source_type: "ml",
		is_visible: true,
		created: "2024-01-15T10:00:00Z",
		updated: "2024-01-15T10:00:00Z",
		...overrides,
	};
}
