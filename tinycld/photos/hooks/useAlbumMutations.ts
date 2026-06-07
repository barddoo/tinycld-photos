import { queryClient, usePocketBase } from "@tinycld/core/lib/pocketbase";
import { useCallback } from "react";

export function useAlbumMutations(orgId: string, userOrgId: string) {
	const pb = usePocketBase();

	const createAlbum = useCallback(
		async (name: string, description?: string) => {
			const record = await pb.collection("photos_albums").create({
				name,
				description: description ?? "",
				org: orgId,
				owner: userOrgId,
			});
			await queryClient.invalidateQueries({ queryKey: ["photos_albums"] });
			return record;
		},
		[pb, orgId, userOrgId],
	);

	const updateAlbum = useCallback(
		async (
			albumId: string,
			data: {
				name?: string;
				description?: string;
				cover_photo?: string | null;
			},
		) => {
			await pb.collection("photos_albums").update(albumId, data);
			await queryClient.invalidateQueries({ queryKey: ["photos_albums"] });
		},
		[pb],
	);

	const deleteAlbum = useCallback(
		async (albumId: string) => {
			await pb.collection("photos_albums").delete(albumId);
			await queryClient.invalidateQueries({ queryKey: ["photos_albums"] });
			await queryClient.invalidateQueries({ queryKey: ["photos_album_items"] });
		},
		[pb],
	);

	const addPhotoToAlbum = useCallback(
		async (albumId: string, photoId: string, sortOrder?: number) => {
			await pb.collection("photos_album_items").create({
				album: albumId,
				photo: photoId,
				sort_order: sortOrder ?? 0,
			});
			await queryClient.invalidateQueries({ queryKey: ["photos_album_items"] });
		},
		[pb],
	);

	const removePhotoFromAlbum = useCallback(
		async (albumItemId: string) => {
			await pb.collection("photos_album_items").delete(albumItemId);
			await queryClient.invalidateQueries({ queryKey: ["photos_album_items"] });
		},
		[pb],
	);

	const reorderPhotos = useCallback(
		async (items: { id: string; sort_order: number }[]) => {
			for (const item of items) {
				await pb.collection("photos_album_items").update(item.id, {
					sort_order: item.sort_order,
				});
			}
			await queryClient.invalidateQueries({ queryKey: ["photos_album_items"] });
		},
		[pb],
	);

	return {
		createAlbum,
		updateAlbum,
		deleteAlbum,
		addPhotoToAlbum,
		removePhotoFromAlbum,
		reorderPhotos,
	};
}
