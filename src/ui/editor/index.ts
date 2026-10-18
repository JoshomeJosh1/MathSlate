// The single place that picks the editor implementation. Swap these imports to change editors.
export { MathLiveEditor as MathEditor } from './MathLiveEditor';
export { MathLiveView as MathView } from './MathLiveView';
export type {
  CommandCompletion,
  EditorKeyAction,
  MathEditorHandle,
  MathEditorProps,
} from './MathEditor';
