// The single place that picks the editor implementation. Swap the import to change editors.
export { MathLiveEditor as MathEditor } from './MathLiveEditor';
export type { EditorKeyAction, MathEditorHandle, MathEditorProps } from './MathEditor';
