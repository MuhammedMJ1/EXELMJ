// The published types for tiptap-track-changes declare only the two mark
// commands; the extension registers seven more at runtime. Declaring them here
// keeps the call sites typed instead of casting them away.
import '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    trackChanges: {
      setSuggestMode: () => ReturnType
      setEditMode: () => ReturnType
      setViewMode: () => ReturnType
      setTrackChangesMode: (mode: 'edit' | 'suggest' | 'view') => ReturnType
      setTrackChangesAuthor: (author: { id: string; name: string; color: string }) => ReturnType
      acceptChange: (changeId: string) => ReturnType
      rejectChange: (changeId: string) => ReturnType
      acceptAll: () => ReturnType
      rejectAll: () => ReturnType
    }
  }
}
