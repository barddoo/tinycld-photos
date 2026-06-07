import type { CoreStores } from "@tinycld/core/lib/pocketbase";
import type { Schema } from "@tinycld/core/types/pbSchema";
import type { createCollection } from "pbtsdb/core";
import { BasicIndex } from "pbtsdb/core";
import type { PhotosSchema } from "./types";

type MergedSchema = Schema & PhotosSchema;

export function registerCollections(
	newCollection: ReturnType<typeof createCollection<MergedSchema>>,
	core: CoreStores,
) {
	const photos_items = newCollection("photos_items", {
		omitOnInsert: ["created", "updated", "thumbnail"] as const,
		expand: { owner: core.user_org },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_albums = newCollection("photos_albums", {
		omitOnInsert: ["created", "updated"] as const,
		expand: { owner: core.user_org },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_album_items = newCollection("photos_album_items", {
		omitOnInsert: ["created"] as const,
		expand: { album: photos_albums, photo: photos_items },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_tags = newCollection("photos_tags", {
		omitOnInsert: ["created", "updated"] as const,
		expand: { owner: core.user_org },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_item_tags = newCollection("photos_item_tags", {
		omitOnInsert: ["created"] as const,
		expand: { item: photos_items, tag: photos_tags },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_people = newCollection("photos_people", {
		omitOnInsert: ["created", "updated"] as const,
		expand: { owner: core.user_org },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_faces = newCollection("photos_faces", {
		omitOnInsert: ["created", "updated"] as const,
		expand: { photo: photos_items, person: photos_people },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_memories = newCollection("photos_memories", {
		omitOnInsert: ["created", "updated"] as const,
		expand: { owner: core.user_org },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_memory_items = newCollection("photos_memory_items", {
		omitOnInsert: ["created"] as const,
		expand: { memory: photos_memories, photo: photos_items },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_ml_state = newCollection("photos_ml_state", {
		omitOnInsert: ["created", "updated"] as const,
		expand: {},
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	const photos_job_queue = newCollection("photos_job_queue", {
		omitOnInsert: ["created_at"] as const,
		expand: { photo: photos_items },
		collectionOptions: {
			autoIndex: "eager" as const,
			defaultIndexType: BasicIndex,
		},
	});

	return {
		photos_items,
		photos_albums,
		photos_album_items,
		photos_tags,
		photos_item_tags,
		photos_people,
		photos_faces,
		photos_memories,
		photos_memory_items,
		photos_ml_state,
		photos_job_queue,
	};
}
