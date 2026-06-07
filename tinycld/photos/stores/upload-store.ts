export type UploadStatus = "pending" | "uploading" | "done" | "failed";

export interface UploadEntry {
	id: string;
	fileName: string;
	fileSize: number;
	status: UploadStatus;
	error?: string;
	file: File;
}

interface UploadState {
	entries: UploadEntry[];
}

let state: UploadState = { entries: [] };
const listeners = new Set<() => void>();

function notify() {
	for (const fn of listeners) {
		fn();
	}
}

export function getUploadState(): UploadState {
	return state;
}

export function subscribeToUploads(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

let idCounter = 0;

function nextId(): string {
	idCounter++;
	return `upload_${idCounter}_${Date.now()}`;
}

export function enqueue(files: File[]): string[] {
	const ids: string[] = [];
	const entries: UploadEntry[] = files.map((f) => {
		const id = nextId();
		ids.push(id);
		return {
			id,
			fileName: f.name,
			fileSize: f.size,
			status: "pending",
			file: f,
		};
	});
	state = { ...state, entries: [...state.entries, ...entries] };
	notify();
	return ids;
}

export function updateStatus(id: string, status: UploadStatus, error?: string) {
	state = {
		...state,
		entries: state.entries.map((e) =>
			e.id === id ? { ...e, status, error } : e,
		),
	};
	notify();
}

export function removeEntry(id: string) {
	state = { ...state, entries: state.entries.filter((e) => e.id !== id) };
	notify();
}

export function clearDone() {
	state = {
		...state,
		entries: state.entries.filter((e) => e.status !== "done"),
	};
	notify();
}

export function clearAll() {
	state = { ...state, entries: [] };
	notify();
}
