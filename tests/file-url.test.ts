import { describe, expect, it } from "vitest";
import { photoToSource } from "~/tinycld/photos/lib/file-url";
import { photoView } from "./helpers";

describe("photoToSource", () => {
	it('sets collectionId to "photos_items"', () => {
		const source = photoToSource(photoView("p1"));
		expect(source.collectionId).toBe("photos_items");
	});

	it("maps recordId from photo.id", () => {
		const source = photoToSource(photoView("abc-123"));
		expect(source.recordId).toBe("abc-123");
	});

	it("maps fileName from photo.file", () => {
		const source = photoToSource(photoView("p1", { file: "DSC_0001.jpg" }));
		expect(source.fileName).toBe("DSC_0001.jpg");
	});

	it("maps displayName from photo.name", () => {
		const source = photoToSource(photoView("p1", { name: "Beach Sunset" }));
		expect(source.displayName).toBe("Beach Sunset");
	});

	it("maps mimeType from photo.mimeType", () => {
		const source = photoToSource(photoView("p1", { mimeType: "image/heic" }));
		expect(source.mimeType).toBe("image/heic");
	});

	it("maps size from photo.size", () => {
		const source = photoToSource(photoView("p1", { size: 4096000 }));
		expect(source.size).toBe(4096000);
	});

	it("sets thumbnailFileName when thumbnail is a non-empty string", () => {
		const source = photoToSource(
			photoView("p1", { thumbnail: "p1_thumb.jpg" }),
		);
		expect(source.thumbnailFileName).toBe("p1_thumb.jpg");
	});

	it("sets thumbnailFileName to undefined when thumbnail is an empty string", () => {
		const source = photoToSource(photoView("p1", { thumbnail: "" }));
		expect(source.thumbnailFileName).toBeUndefined();
	});
});
