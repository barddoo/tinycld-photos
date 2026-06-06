import type { ActiveSection, PhotoView } from '../types'

export type DialogTarget = { id: string; name: string }

export interface PhotosUIState {
    selectedPhotoId: string | null
    selectedIds: Set<string>
    previewPhotoId: string | null
    detailPanelOpen: boolean
    activeSection: ActiveSection
    albumDetailTarget: DialogTarget | null
}

export interface PhotosUIActions {
    selectPhoto: (id: string | null) => void
    clearSelection: () => void
    openPreview: (id: string) => void
    closePreview: () => void
    openDetailPanel: () => void
    closeDetailPanel: () => void
    setActiveSection: (section: ActiveSection) => void
    setAlbumDetailTarget: (target: DialogTarget | null) => void
}

export type PhotosUIStore = PhotosUIState & PhotosUIActions

let state: PhotosUIState = {
    selectedPhotoId: null,
    selectedIds: new Set(),
    previewPhotoId: null,
    detailPanelOpen: false,
    activeSection: 'timeline',
    albumDetailTarget: null,
}

const listeners = new Set<() => void>()

function notify() {
    for (const fn of listeners) {
        fn()
    }
}

export function getPhotosUIState(): PhotosUIState {
    return state
}

export function subscribeToPhotosUI(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

export function selectPhoto(id: string | null) {
    state = { ...state, selectedPhotoId: id }
    notify()
}

export function clearSelection() {
    state = { ...state, selectedPhotoId: null, selectedIds: new Set() }
    notify()
}

export function openPreview(id: string) {
    state = { ...state, previewPhotoId: id }
    notify()
}

export function closePreview() {
    state = { ...state, previewPhotoId: null }
    notify()
}

export function openDetailPanel() {
    state = { ...state, detailPanelOpen: true }
    notify()
}

export function closeDetailPanel() {
    state = { ...state, detailPanelOpen: false }
    notify()
}

export function setActiveSection(section: ActiveSection) {
    state = { ...state, activeSection: section }
    notify()
}

export function setAlbumDetailTarget(target: DialogTarget | null) {
    state = { ...state, albumDetailTarget: target }
    notify()
}
