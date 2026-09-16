export interface LanguageConfig {
  id: string;
  name: string;
  extension: string;
  monacoLanguage: string;
  fileName: string;
  requiresCompilation: boolean;
  compilerCommand?: string;
  compilerArgs?: (sourceFile: string, outputFile: string) => string[];
  runtimeCommand: string;
  runtimeArgs: (targetFile: string) => string[];
  defaultCode: string;
  versionCheck: {
    command: string;
    args: string[];
  };
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  compilationError?: string;
  isTimeout?: boolean;
  isStopped?: boolean;
  isValidationMessage?: boolean;
  durationMs: number;
}

export interface CompilerStatus {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  error?: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  timeoutSeconds: number;
}

export interface EditorDocument {
  id: string;
  filePath: string | null;
  fileName: string;
  language: string;
  code: string;
  savedBaseline: string;
  isDirty: boolean;
  input: string;
  outputResult?: ExecutionResult | null;
}

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: 'off' | 'on';
  minimap: boolean;
  lineNumbers: 'on' | 'off';
  renderWhitespace: 'none' | 'selection' | 'all';
  autocomplete: boolean;
  automaticSuggestions: boolean;
  parameterHints: boolean;
  hover: boolean;
  codeNavigation: boolean;
  bracketMatching: boolean;
  autoClosingBrackets: boolean;
  autoIndentation: boolean;
  formatOnPaste: boolean;
  formatOnType: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 14,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: 'off',
  minimap: true,
  lineNumbers: 'on',
  renderWhitespace: 'selection',
  autocomplete: true,
  automaticSuggestions: true,
  parameterHints: true,
  hover: true,
  codeNavigation: true,
  bracketMatching: true,
  autoClosingBrackets: true,
  autoIndentation: true,
  formatOnPaste: false,
  formatOnType: false
};

export interface WorkspaceFileNode {
  name: string;
  path: string;            // Absolute canonical path on disk
  relativePath: string;    // Relative path from workspace root
  isDirectory: boolean;
  children?: WorkspaceFileNode[];
  extension?: string;
}

export interface WorkspaceState {
  rootPath: string;
  name: string;
  tree: WorkspaceFileNode[];
}
