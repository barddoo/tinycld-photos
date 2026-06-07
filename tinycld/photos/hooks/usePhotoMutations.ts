import { queryClient, usePocketBase } from "@tinycld/core/lib/pocketbase";
import type PocketBase from "pocketbase";
import { useCallback, useRef } from "react";
import { enqueue, getUploadState, updateStatus } from "../stores/upload-store";

let processingPromise: Promise<void> | null = null;

async function processQueue(
	pb: PocketBase,
	orgId: string,
	userOrgId: string,
): Promise<void> {
	if (processingPromise) {
		await processingPromise;
		return;
	}

	processingPromise = process(pb, orgId, userOrgId);
	try {
		await processingPromise;
	} finally {
		processingPromise = null;
	}
}

async function process(
	pb: PocketBase,
	orgId: string,
	userOrgId: string,
): Promise<void> {
	const concurrency = 4;

	while (true) {
		const { entries } = getUploadState();
		const pending = entries.filter((e) => e.status === "pending");
		if (pending.length === 0) return;

		for (let i = 0; i < pending.length; i += concurrency) {
			const batch = pending.slice(i, i + concurrency);
			await Promise.allSettled(
				batch.map(async (entry) => {
					updateStatus(entry.id, "uploading");
					try {
						const formData = new FormData();
						formData.append("org", orgId);
						formData.append("owner", userOrgId);
						formData.append("name", entry.file.name);
						formData.append("size", String(entry.file.size));
						formData.append("file", entry.file, entry.file.name);
						formData.append("mime_type", entry.file.type || "image/jpeg");
						formData.append("taken_at", new Date().toISOString());

						await pb.collection("photos_items").create(formData);
						updateStatus(entry.id, "done");
						queryClient.invalidateQueries({ queryKey: ["photos_items"] });
					} catch (err) {
						const msg = err instanceof Error ? err.message : "Upload failed";
						updateStatus(entry.id, "failed", msg);
					}
				}),
			);
		}
	}
}

export function usePhotoMutations(orgId: string, userOrgId: string) {
	const pb = usePocketBase();
	const orgIdRef = useRef(orgId);
	const userOrgIdRef = useRef(userOrgId);
	orgIdRef.current = orgId;
	userOrgIdRef.current = userOrgId;

	const uploadPhoto = useCallback(
		async (file: File) => {
			if (!orgId || !userOrgId) return;

			const formData = new FormData();
			formData.append("org", orgId);
			formData.append("owner", userOrgId);
			formData.append("name", file.name);
			formData.append("size", String(file.size));
			formData.append("file", file, file.name);
			formData.append("mime_type", file.type || "image/jpeg");
			formData.append("taken_at", new Date().toISOString());

			const record = await pb.collection("photos_items").create(formData);
			return record;
		},
		[pb, orgId, userOrgId],
	);

	const uploadPhotos = useCallback(
		async (files: File[]) => {
			if (!orgId || !userOrgId) return;
			enqueue(files);
			processQueue(pb, orgIdRef.current, userOrgIdRef.current);
		},
		[pb, orgId, userOrgId],
	);

	const retryUpload = useCallback(
		async (entry: { id: string; file: File }) => {
			if (!orgId || !userOrgId) return;
			updateStatus(entry.id, "pending");
			processQueue(pb, orgIdRef.current, userOrgIdRef.current);
		},
		[pb, orgId, userOrgId],
	);

	const toggleFavorite = useCallback(
		async (photoId: string, current: boolean) => {
			await pb.collection("photos_items").update(photoId, {
				is_favorite: !current,
			});
		},
		[pb],
	);

	const updateDescription = useCallback(
		async (photoId: string, description: string) => {
			await pb.collection("photos_items").update(photoId, { description });
		},
		[pb],
	);

	const trashPhoto = useCallback(
		async (photoId: string) => {
			await pb.collection("photos_items").update(photoId, {
				trashed_at: new Date().toISOString(),
			});
		},
		[pb],
	);

	const restorePhoto = useCallback(
		async (photoId: string) => {
			await pb.collection("photos_items").update(photoId, { trashed_at: null });
		},
		[pb],
	);

	const permanentlyDelete = useCallback(
		async (photoId: string) => {
			await pb.collection("photos_items").delete(photoId);
		},
		[pb],
	);

	return {
		uploadPhoto,
		uploadPhotos,
		retryUpload,
		toggleFavorite,
		updateDescription,
		trashPhoto,
		restorePhoto,
		permanentlyDelete,
	};
}
