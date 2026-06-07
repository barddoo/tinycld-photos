import type { PhotoView } from "../types";

export interface SemanticSearchResult {
	id: string;
	score: number;
}

export function filterPhotosByText(
	photos: PhotoView[],
	query: string,
): PhotoView[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return photos.filter((p) => {
		const name = (p.name || "").toLowerCase();
		const desc = (p.description || "").toLowerCase();
		const loc = (p.location || "").toLowerCase();
		return name.includes(q) || desc.includes(q) || loc.includes(q);
	});
}

export function mergeSearchResults(
	allPhotos: PhotoView[],
	semanticResults: SemanticSearchResult[],
	ftsResults: PhotoView[],
): PhotoView[] {
	if (semanticResults.length === 0) return ftsResults;
	const semanticIds = new Set(semanticResults.map((r) => r.id));
	const semanticPhotos = allPhotos.filter((p) => semanticIds.has(p.id));
	const ftsOnly = ftsResults.filter((r) => !semanticIds.has(r.id));
	return [...semanticPhotos, ...ftsOnly];
}
