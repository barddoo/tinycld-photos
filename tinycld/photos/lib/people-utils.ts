import type { PersonView, PhotosFace, PhotosPerson } from "../types";

export function toPersonView(
	p: PhotosPerson,
	thumbnailPhotoId?: string,
	thumbnailPhotoFile?: string,
	thumbnailPhotoThumb?: string,
): PersonView {
	return {
		id: p.id,
		name: p.name,
		thumbnailFace: p.thumbnail_face || null,
		thumbnailPhotoId: thumbnailPhotoId ?? null,
		thumbnailPhotoFile: thumbnailPhotoFile ?? null,
		thumbnailPhotoThumb: thumbnailPhotoThumb ?? null,
		isHidden: p.is_hidden || false,
		birthDate: p.birth_date || null,
		color: p.color || null,
		photoCount: 0,
	};
}

export function filterVisiblePeople(people: PhotosPerson[]): PhotosPerson[] {
	return people.filter((p) => !p.is_hidden);
}

export function uniquePhotoIds(faces: PhotosFace[]): string[] {
	return [...new Set(faces.map((f) => f.photo))];
}
