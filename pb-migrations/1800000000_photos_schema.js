/// <reference path="../pb_data/types.d.ts" />

// Consolidated migration — creates all Photos collections with final schema.
// Run on fresh database. To migrate existing, delete DB and re-run.

migrate(
	(app) => {
		const orgs = app.findCollectionByNameOrId("orgs");
		const userOrg = app.findCollectionByNameOrId("user_org");
		const orgsId = orgs.id;
		const userOrgId = userOrg.id;

		// ─── photos_items ───────────────────────────────────────────────
		const photos_items = new Collection({
			name: "photos_items",
			type: "base",
			listRule: "org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "org.user_org_via_org.user ?= @request.auth.id",
			createRule: "org.user_org_via_org.user ?= @request.auth.id",
			updateRule: "org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
					min: 1,
					max: 200,
				},
				{
					name: "file",
					type: "file",
					required: true,
					maxSelect: 1,
					maxSize: 104857600,
					mimeTypes: [
						"image/jpeg",
						"image/png",
						"image/webp",
						"image/heic",
						"image/heif",
						"image/gif",
						"image/avif",
						"image/tiff",
						"video/mp4",
						"video/quicktime",
						"video/webm",
						"video/x-msvideo",
						"video/x-matroska",
					],
				},
				{
					name: "thumbnail",
					type: "file",
					required: false,
					maxSelect: 1,
					maxSize: 10485760,
				},
				{
					name: "type",
					type: "select",
					required: true,
					values: ["image", "video", "live_photo"],
					default: "image",
				},
				{
					name: "taken_at",
					type: "date",
					required: false,
				},
				{
					name: "width",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "height",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "size",
					type: "number",
					required: true,
					min: 0,
				},
				{
					name: "mime_type",
					type: "text",
					required: true,
					max: 255,
				},
				{
					name: "description",
					type: "text",
					required: false,
					max: 2000,
				},
				{
					name: "is_favorite",
					type: "bool",
				},
				{
					name: "trashed_at",
					type: "date",
					required: false,
				},
				{
					name: "duration",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "live_photo_pair_id",
					type: "text",
					required: false,
					max: 200,
				},
				{
					name: "search_text",
					type: "text",
					required: false,
					max: 100000,
				},
				{
					name: "location",
					type: "text",
					required: false,
					max: 500,
				},
				{
					name: "latitude",
					type: "number",
					required: false,
				},
				{
					name: "longitude",
					type: "number",
					required: false,
				},
				{
					name: "smart_search_vector",
					type: "json",
					required: false,
				},
				{
					name: "perceptual_hash",
					type: "text",
					required: false,
					max: 100,
				},
				{
					name: "ml_status",
					type: "select",
					required: true,
					values: ["pending", "processing", "done", "failed"],
					default: "pending",
				},
				{
					name: "camera_make",
					type: "text",
					required: false,
					max: 100,
				},
				{
					name: "camera_model",
					type: "text",
					required: false,
					max: 100,
				},
				{
					name: "lens_model",
					type: "text",
					required: false,
					max: 200,
				},
				{
					name: "iso",
					type: "number",
					required: false,
					min: 0,
					max: 102400,
					noDecimal: true,
				},
				{
					name: "aperture",
					type: "text",
					required: false,
					max: 20,
				},
				{
					name: "focal_length",
					type: "text",
					required: false,
					max: 20,
				},
				{
					name: "org",
					type: "relation",
					required: true,
					collectionId: orgsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					collectionId: userOrgId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: [
				"CREATE INDEX `idx_photos_items_owner` ON `photos_items` (`owner`)",
				"CREATE INDEX `idx_photos_items_org` ON `photos_items` (`org`)",
				"CREATE INDEX `idx_photos_items_taken_at` ON `photos_items` (`taken_at` DESC)",
				"CREATE INDEX `idx_photos_items_org_taken_at` ON `photos_items` (`org`, `taken_at` DESC)",
				"CREATE INDEX `idx_photos_items_type` ON `photos_items` (`type`)",
				"CREATE INDEX `idx_photos_items_ml_status` ON `photos_items` (`ml_status`)",
			],
		});
		app.save(photos_items);
		const photosItemsId = photos_items.id;

		// ─── photos_albums ──────────────────────────────────────────────
		const photos_albums = new Collection({
			name: "photos_albums",
			type: "base",
			listRule: "org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "org.user_org_via_org.user ?= @request.auth.id",
			createRule: "org.user_org_via_org.user ?= @request.auth.id",
			updateRule: "org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
					min: 1,
					max: 200,
				},
				{
					name: "description",
					type: "text",
					required: false,
					max: 2000,
				},
				{
					name: "cover_photo",
					type: "relation",
					required: false,
					collectionId: photosItemsId,
					maxSelect: 1,
				},
				{
					name: "org",
					type: "relation",
					required: true,
					collectionId: orgsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					collectionId: userOrgId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: [
				"CREATE INDEX `idx_photos_albums_org` ON `photos_albums` (`org`)",
			],
		});
		app.save(photos_albums);
		const albumsId = photos_albums.id;

		// ─── photos_album_items ─────────────────────────────────────────
		const photos_album_items = new Collection({
			name: "photos_album_items",
			type: "base",
			listRule: "album.org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "album.org.user_org_via_org.user ?= @request.auth.id",
			createRule: "album.org.user_org_via_org.user ?= @request.auth.id",
			updateRule: "album.org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "album.org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "album",
					type: "relation",
					required: true,
					collectionId: albumsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "photo",
					type: "relation",
					required: true,
					collectionId: photosItemsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "sort_order",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
			],
			indexes: [
				"CREATE UNIQUE INDEX `idx_photos_album_items_unique` ON `photos_album_items` (`album`, `photo`)",
				"CREATE INDEX `idx_photos_album_items_album_sort` ON `photos_album_items` (`album`, `sort_order` ASC)",
			],
		});
		app.save(photos_album_items);

		// ─── photos_tags ────────────────────────────────────────────────
		const photos_tags = new Collection({
			name: "photos_tags",
			type: "base",
			listRule: "org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "org.user_org_via_org.user ?= @request.auth.id",
			createRule: "org.user_org_via_org.user ?= @request.auth.id",
			updateRule: "org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
					min: 1,
					max: 100,
				},
				{
					name: "color",
					type: "text",
					required: false,
					max: 7,
				},
				{
					name: "org",
					type: "relation",
					required: true,
					collectionId: orgsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					collectionId: userOrgId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: ["CREATE INDEX `idx_photos_tags_org` ON `photos_tags` (`org`)"],
		});
		app.save(photos_tags);
		const tagsId = photos_tags.id;

		// Add self-referential parent field
		photos_tags.fields.add(
			new Field({
				name: "parent",
				type: "relation",
				required: false,
				collectionId: tagsId,
				cascadeDelete: false,
				maxSelect: 1,
			}),
		);
		app.save(photos_tags);

		// ─── photos_item_tags ───────────────────────────────────────────
		const photos_item_tags = new Collection({
			name: "photos_item_tags",
			type: "base",
			listRule: "item.org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "item.org.user_org_via_org.user ?= @request.auth.id",
			createRule: "item.org.user_org_via_org.user ?= @request.auth.id",
			updateRule: "item.org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "item.org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "item",
					type: "relation",
					required: true,
					collectionId: photosItemsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "tag",
					type: "relation",
					required: true,
					collectionId: tagsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
			],
			indexes: [
				"CREATE UNIQUE INDEX `idx_photos_item_tags_unique` ON `photos_item_tags` (`item`, `tag`)",
				"CREATE INDEX `idx_photos_item_tags_tag` ON `photos_item_tags` (`tag`)",
			],
		});
		app.save(photos_item_tags);

		// ─── photos_people ──────────────────────────────────────────────
		const photos_people = new Collection({
			name: "photos_people",
			type: "base",
			listRule: "org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "org.user_org_via_org.user ?= @request.auth.id",
			createRule: "org.user_org_via_org.user ?= @request.auth.id",
			updateRule: "org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "name",
					type: "text",
					required: true,
					min: 1,
					max: 200,
				},
				{
					name: "is_hidden",
					type: "bool",
				},
				{
					name: "birth_date",
					type: "date",
					required: false,
				},
				{
					name: "color",
					type: "text",
					required: false,
					max: 7,
				},
				{
					name: "org",
					type: "relation",
					required: true,
					collectionId: orgsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					collectionId: userOrgId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: [
				"CREATE INDEX `idx_photos_people_org` ON `photos_people` (`org`)",
			],
		});
		app.save(photos_people);

		// ─── photos_faces ───────────────────────────────────────────────
		const photos_faces = new Collection({
			name: "photos_faces",
			type: "base",
			listRule: "photo.org.user_org_via_org.user ?= @request.auth.id",
			viewRule: "photo.org.user_org_via_org.user ?= @request.auth.id",
			createRule: "",
			updateRule: "photo.org.user_org_via_org.user ?= @request.auth.id",
			deleteRule: "photo.org.user_org_via_org.user ?= @request.auth.id",
			fields: [
				{
					name: "photo",
					type: "relation",
					required: true,
					collectionId: photosItemsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "bounding_box",
					type: "json",
					required: true,
				},
				{
					name: "embedding",
					type: "json",
					required: false,
				},
				{
					name: "image_width",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "image_height",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "source_type",
					type: "select",
					required: true,
					values: ["ml", "manual"],
					maxSelect: 1,
				},
				{
					name: "is_visible",
					type: "bool",
				},
				{
					name: "person",
					type: "relation",
					required: false,
					collectionId: photos_people.id,
					cascadeDelete: false,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: [
				"CREATE INDEX `idx_photos_faces_photo` ON `photos_faces` (`photo`)",
			],
		});
		app.save(photos_faces);
		const facesId = photos_faces.id;

		// Add thumbnail_face to photos_people
		photos_people.fields.add(
			new Field({
				name: "thumbnail_face",
				type: "relation",
				required: false,
				collectionId: facesId,
				cascadeDelete: false,
				maxSelect: 1,
			}),
		);
		app.save(photos_people);

		// ─── photos_memories ────────────────────────────────────────────
		const photos_memories = new Collection({
			name: "photos_memories",
			type: "base",
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: "",
			updateRule: "owner.user = @request.auth.id",
			deleteRule: "owner.user = @request.auth.id",
			fields: [
				{
					name: "type",
					type: "select",
					required: true,
					values: ["on_this_day", "best_of_month", "trip", "custom"],
					maxSelect: 1,
				},
				{
					name: "title",
					type: "text",
					required: true,
					max: 255,
				},
				{
					name: "data",
					type: "json",
					required: false,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					collectionId: userOrgId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: [
				"CREATE INDEX `idx_photos_memories_type` ON `photos_memories` (`type`)",
			],
		});
		app.save(photos_memories);
		const memoriesId = photos_memories.id;

		// ─── photos_memory_items ────────────────────────────────────────
		const photos_memory_items = new Collection({
			name: "photos_memory_items",
			type: "base",
			listRule: "memory.owner.user = @request.auth.id",
			viewRule: "memory.owner.user = @request.auth.id",
			createRule: "",
			updateRule: "",
			deleteRule: "",
			fields: [
				{
					name: "memory",
					type: "relation",
					required: true,
					collectionId: memoriesId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "photo",
					type: "relation",
					required: true,
					collectionId: photosItemsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
			],
			indexes: [
				"CREATE UNIQUE INDEX `idx_photos_memory_items_unique` ON `photos_memory_items` (`memory`, `photo`)",
				"CREATE INDEX `idx_photos_memory_items_photo` ON `photos_memory_items` (`photo`)",
			],
		});
		app.save(photos_memory_items);

		// ─── photos_ml_state ────────────────────────────────────────────
		const photos_ml_state = new Collection({
			name: "photos_ml_state",
			type: "base",
			listRule: "",
			viewRule: '@request.auth.id != ""',
			createRule: "",
			updateRule: '@request.auth.id != ""',
			deleteRule: "",
			fields: [
				{
					name: "clip_model_name",
					type: "text",
					required: false,
					max: 100,
				},
				{
					name: "face_model_name",
					type: "text",
					required: false,
					max: 100,
				},
				{
					name: "last_face_detection",
					type: "date",
					required: false,
				},
				{
					name: "last_face_recognition",
					type: "date",
					required: false,
				},
				{
					name: "last_clip_encode",
					type: "date",
					required: false,
				},
				{
					name: "last_ocr_run",
					type: "date",
					required: false,
				},
				{
					name: "ocr_enabled",
					type: "bool",
				},
				{
					name: "min_face_score",
					type: "number",
					required: false,
					min: 0,
					max: 1,
				},
				{
					name: "max_face_distance",
					type: "number",
					required: false,
					min: 0,
					max: 1,
				},
				{
					name: "min_faces",
					type: "number",
					required: false,
					min: 1,
				},
				{
					name: "poll_interval_secs",
					type: "number",
					required: false,
					min: 1,
					max: 3600,
				},
				{
					name: "batch_size",
					type: "number",
					required: false,
					min: 1,
					max: 100,
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
		});
		app.save(photos_ml_state);

		// ─── photos_job_queue ───────────────────────────────────────────
		const photos_job_queue = new Collection({
			name: "photos_job_queue",
			type: "base",
			listRule: "",
			viewRule: "",
			createRule: "",
			updateRule: "",
			deleteRule: "",
			fields: [
				{
					name: "photo",
					type: "relation",
					required: true,
					collectionId: photosItemsId,
					cascadeDelete: true,
					maxSelect: 1,
				},
				{
					name: "job_type",
					type: "select",
					required: true,
					values: [
						"detect_faces",
						"encode_clip",
						"run_ocr",
						"compute_phash",
						"reverse_geocode",
						"recognize_faces",
					],
					maxSelect: 1,
				},
				{
					name: "status",
					type: "select",
					required: true,
					values: ["pending", "processing", "done", "failed"],
					maxSelect: 1,
				},
				{
					name: "attempts",
					type: "number",
					required: false,
					min: 0,
				},
				{
					name: "last_error",
					type: "text",
					required: false,
					max: 1000,
				},
				{
					name: "scheduled_at",
					type: "date",
					required: false,
				},
				{
					name: "created_at",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
			],
			indexes: [
				"CREATE INDEX `idx_photos_job_queue_status` ON `photos_job_queue` (`status`, `scheduled_at`)",
				"CREATE INDEX `idx_photos_job_queue_photo` ON `photos_job_queue` (`photo`)",
			],
		});
		app.save(photos_job_queue);
	},

	// ─── Rollback ───────────────────────────────────────────────────────
	(app) => {
		const collections = [
			"photos_job_queue",
			"photos_ml_state",
			"photos_memory_items",
			"photos_memories",
			"photos_faces",
			"photos_people",
			"photos_item_tags",
			"photos_tags",
			"photos_album_items",
			"photos_albums",
			"photos_items",
		];
		for (const name of collections) {
			try {
				const c = app.findCollectionByNameOrId(name);
				app.delete(c);
			} catch {
				// already gone
			}
		}
	},
);
