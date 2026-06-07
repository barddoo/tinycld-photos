import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearSelection,
	closeDetailPanel,
	closePreview,
	getPhotosUIState,
	openDetailPanel,
	openPreview,
	selectPhoto,
	setActiveSection,
	setAlbumDetailTarget,
	subscribeToPhotosUI,
} from "~/tinycld/photos/stores/photos-ui-store";

beforeEach(() => {
	clearSelection();
	closePreview();
	closeDetailPanel();
	setActiveSection("timeline");
	setAlbumDetailTarget(null);
});

describe("selectPhoto", () => {
	it("sets selectedPhotoId", () => {
		selectPhoto("photo-1");
		expect(getPhotosUIState().selectedPhotoId).toBe("photo-1");
	});

	it("clears selectedPhotoId when passed null", () => {
		selectPhoto("photo-1");
		selectPhoto(null);
		expect(getPhotosUIState().selectedPhotoId).toBeNull();
	});

	it("replaces the previous selection", () => {
		selectPhoto("photo-1");
		selectPhoto("photo-2");
		expect(getPhotosUIState().selectedPhotoId).toBe("photo-2");
	});
});

describe("clearSelection", () => {
	it("nulls selectedPhotoId", () => {
		selectPhoto("photo-1");
		clearSelection();
		expect(getPhotosUIState().selectedPhotoId).toBeNull();
	});

	it("empties selectedIds set", () => {
		clearSelection();
		expect(getPhotosUIState().selectedIds.size).toBe(0);
	});
});

describe("openPreview / closePreview", () => {
	it("openPreview sets previewPhotoId", () => {
		openPreview("photo-42");
		expect(getPhotosUIState().previewPhotoId).toBe("photo-42");
	});

	it("closePreview nulls previewPhotoId", () => {
		openPreview("photo-42");
		closePreview();
		expect(getPhotosUIState().previewPhotoId).toBeNull();
	});
});

describe("openDetailPanel / closeDetailPanel", () => {
	it("openDetailPanel sets detailPanelOpen to true", () => {
		openDetailPanel();
		expect(getPhotosUIState().detailPanelOpen).toBe(true);
	});

	it("closeDetailPanel sets detailPanelOpen to false", () => {
		openDetailPanel();
		closeDetailPanel();
		expect(getPhotosUIState().detailPanelOpen).toBe(false);
	});
});

describe("setActiveSection", () => {
	it("updates activeSection to the given value", () => {
		setActiveSection("favorites");
		expect(getPhotosUIState().activeSection).toBe("favorites");
	});

	it("can switch between sections", () => {
		setActiveSection("trash");
		expect(getPhotosUIState().activeSection).toBe("trash");
		setActiveSection("albums");
		expect(getPhotosUIState().activeSection).toBe("albums");
	});

	it('defaults to "timeline" after reset in beforeEach', () => {
		expect(getPhotosUIState().activeSection).toBe("timeline");
	});
});

describe("setAlbumDetailTarget", () => {
	it("sets the album detail target", () => {
		setAlbumDetailTarget({ id: "album-1", name: "Vacation" });
		expect(getPhotosUIState().albumDetailTarget).toEqual({
			id: "album-1",
			name: "Vacation",
		});
	});

	it("clears the target when set to null", () => {
		setAlbumDetailTarget({ id: "album-1", name: "Vacation" });
		setAlbumDetailTarget(null);
		expect(getPhotosUIState().albumDetailTarget).toBeNull();
	});
});

describe("subscribeToPhotosUI", () => {
	it("fires the listener on any state change", () => {
		const listener = vi.fn();
		const unsub = subscribeToPhotosUI(listener);
		selectPhoto("photo-1");
		expect(listener).toHaveBeenCalled();
		unsub();
	});

	it("unsubscribe stops future notifications", () => {
		const listener = vi.fn();
		const unsub = subscribeToPhotosUI(listener);
		unsub();
		selectPhoto("photo-1");
		expect(listener).not.toHaveBeenCalled();
	});

	it("fires once per mutation, not in batches", () => {
		const listener = vi.fn();
		const unsub = subscribeToPhotosUI(listener);
		selectPhoto("photo-1");
		openPreview("photo-1");
		expect(listener).toHaveBeenCalledTimes(2);
		unsub();
	});
});
