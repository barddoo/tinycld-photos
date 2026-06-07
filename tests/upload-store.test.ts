import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearAll,
	clearDone,
	enqueue,
	getUploadState,
	removeEntry,
	subscribeToUploads,
	updateStatus,
} from "~/tinycld/photos/stores/upload-store";

function makeFile(name: string, size = 1024): File {
	return new File(["x".repeat(size)], name, { type: "image/jpeg" });
}

beforeEach(() => {
	clearAll();
});

describe("enqueue", () => {
	it('creates one entry per file with status "pending"', () => {
		enqueue([makeFile("a.jpg"), makeFile("b.jpg")]);
		const { entries } = getUploadState();
		expect(entries).toHaveLength(2);
		expect(entries[0].status).toBe("pending");
		expect(entries[1].status).toBe("pending");
	});

	it("returns an ID for each file in the same order", () => {
		const ids = enqueue([makeFile("a.jpg"), makeFile("b.jpg")]);
		expect(ids).toHaveLength(2);
		const { entries } = getUploadState();
		expect(entries[0].id).toBe(ids[0]);
		expect(entries[1].id).toBe(ids[1]);
	});

	it("produces unique IDs across multiple calls", () => {
		const ids1 = enqueue([makeFile("a.jpg")]);
		const ids2 = enqueue([makeFile("b.jpg")]);
		expect(ids1[0]).not.toBe(ids2[0]);
	});

	it("stores the original File reference", () => {
		const file = makeFile("photo.jpg");
		enqueue([file]);
		const { entries } = getUploadState();
		expect(entries[0].file).toBe(file);
	});

	it("stores the file name and size", () => {
		enqueue([makeFile("vacation.jpg", 5000)]);
		const { entries } = getUploadState();
		expect(entries[0].fileName).toBe("vacation.jpg");
		expect(entries[0].fileSize).toBe(5000);
	});

	it("appends to existing entries without replacing them", () => {
		enqueue([makeFile("a.jpg")]);
		enqueue([makeFile("b.jpg")]);
		expect(getUploadState().entries).toHaveLength(2);
	});
});

describe("updateStatus", () => {
	it("changes the status of the targeted entry", () => {
		const [id] = enqueue([makeFile("a.jpg")]);
		updateStatus(id, "uploading");
		const entry = getUploadState().entries.find((e) => e.id === id);
		expect(entry?.status).toBe("uploading");
	});

	it("sets an error message when provided", () => {
		const [id] = enqueue([makeFile("a.jpg")]);
		updateStatus(id, "failed", "network error");
		const entry = getUploadState().entries.find((e) => e.id === id);
		expect(entry?.error).toBe("network error");
	});

	it("leaves non-targeted entries unchanged", () => {
		const [id1, id2] = enqueue([makeFile("a.jpg"), makeFile("b.jpg")]);
		updateStatus(id1, "uploading");
		const entry2 = getUploadState().entries.find((e) => e.id === id2);
		expect(entry2?.status).toBe("pending");
	});
});

describe("removeEntry", () => {
	it("removes the entry with the given id", () => {
		const [id1, id2] = enqueue([makeFile("a.jpg"), makeFile("b.jpg")]);
		removeEntry(id1);
		const { entries } = getUploadState();
		expect(entries).toHaveLength(1);
		expect(entries[0].id).toBe(id2);
	});

	it("is a no-op when the id does not exist", () => {
		enqueue([makeFile("a.jpg")]);
		removeEntry("nonexistent-id");
		expect(getUploadState().entries).toHaveLength(1);
	});
});

describe("clearDone", () => {
	it('removes only entries with status "done"', () => {
		const [id1, id2, id3] = enqueue([
			makeFile("a.jpg"),
			makeFile("b.jpg"),
			makeFile("c.jpg"),
		]);
		updateStatus(id1, "done");
		updateStatus(id2, "failed");
		clearDone();
		const remaining = getUploadState().entries.map((e) => e.id);
		expect(remaining).not.toContain(id1);
		expect(remaining).toContain(id2);
		expect(remaining).toContain(id3);
	});

	it("leaves pending, uploading, and failed entries intact", () => {
		const [id1, id2, _id3] = enqueue([
			makeFile("a.jpg"),
			makeFile("b.jpg"),
			makeFile("c.jpg"),
		]);
		updateStatus(id1, "uploading");
		updateStatus(id2, "failed");
		clearDone();
		expect(getUploadState().entries).toHaveLength(3);
	});
});

describe("clearAll", () => {
	it("empties the entries list", () => {
		enqueue([makeFile("a.jpg"), makeFile("b.jpg")]);
		clearAll();
		expect(getUploadState().entries).toHaveLength(0);
	});
});

describe("subscribeToUploads", () => {
	it("calls the listener when enqueue fires", () => {
		const listener = vi.fn();
		const unsub = subscribeToUploads(listener);
		enqueue([makeFile("a.jpg")]);
		expect(listener).toHaveBeenCalledTimes(1);
		unsub();
	});

	it("calls the listener when updateStatus fires", () => {
		const [id] = enqueue([makeFile("a.jpg")]);
		const listener = vi.fn();
		const unsub = subscribeToUploads(listener);
		updateStatus(id, "uploading");
		expect(listener).toHaveBeenCalled();
		unsub();
	});

	it("unsubscribe stops future notifications", () => {
		const listener = vi.fn();
		const unsub = subscribeToUploads(listener);
		unsub();
		enqueue([makeFile("a.jpg")]);
		expect(listener).not.toHaveBeenCalled();
	});
});

describe("getUploadState", () => {
	it("reflects the latest state after mutations", () => {
		enqueue([makeFile("a.jpg")]);
		expect(getUploadState().entries).toHaveLength(1);
		clearAll();
		expect(getUploadState().entries).toHaveLength(0);
	});
});
