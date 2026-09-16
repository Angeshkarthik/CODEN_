import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Bell, FolderOpen } from 'lucide-react';
import { EditorSettings, DEFAULT_EDITOR_SETTINGS } from '../../electron/types';

export interface CodeEditorHandle {
  openReplace: () => void;
  openFind: () => void;
  focus: () => void;
}

export interface CodeEditorProps {
  activeDocId: string;
  code: string;
  language: string;
  theme: 'dark' | 'light';
  editorSettings?: EditorSettings;
  navTarget?: { line: number; column?: number; nonce: number } | null;
  workspaceFolder?: string | null;
  onChange: (value: string | undefined, docId?: string) => void;
  onRun: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onSaveAll?: () => void;
  onOpen?: () => void;
  onNew?: () => void;
  onCloseTab?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onOpenWorkspace?: () => void;
  openDocIds: string[];
}

function buildMonacoOptions(settings: EditorSettings): any {
  return {
    automaticLayout: true,
    fontSize: settings.fontSize,
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
    wordWrap: settings.wordWrap,
    minimap: { enabled: settings.minimap },
    lineNumbers: settings.lineNumbers,
    renderWhitespace: settings.renderWhitespace,

    // Autocomplete & suggestions
    quickSuggestions:
      settings.autocomplete && settings.automaticSuggestions
        ? { other: true, comments: false, strings: false }
        : false,
    suggestOnTriggerCharacters: settings.autocomplete && settings.automaticSuggestions,
    suggest: {
      showWords: settings.autocomplete,
      showSnippets: settings.autocomplete,
      showClasses: settings.autocomplete,
      showFunctions: settings.autocomplete,
      showVariables: settings.autocomplete,
      showConstants: settings.autocomplete,
      showKeywords: settings.autocomplete
    },

    // Parameter hints & hover
    parameterHints: { enabled: settings.parameterHints },
    hover: { enabled: settings.hover },

    // Code navigation
    definition: settings.codeNavigation,
    gotoLocation: {
      multiple: 'peek'
    },

    // Bracket matching & auto-closing
    matchBrackets: settings.bracketMatching ? 'always' : 'never',
    autoClosingBrackets: settings.autoClosingBrackets ? 'always' : 'never',
    autoClosingQuotes: settings.autoClosingBrackets ? 'always' : 'never',

    // Indentation & formatting
    autoIndent: settings.autoIndentation ? 'full' : 'none',
    formatOnPaste: settings.formatOnPaste,
    formatOnType: settings.formatOnType,

    // Base styling
    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
    fontLigatures: true,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    lineNumbersMinChars: 3,
    folding: true,
    bracketPairColorization: { enabled: true },
    padding: { top: 12, bottom: 12 }
  };
}

const getLanguageDisplayName = (lang: string) => {
  const map: Record<string, string> = {
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    python: 'Python',
    javascript: 'JavaScript'
  };
  return map[lang] || lang.toUpperCase();
};

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(({
  activeDocId,
  code,
  language,
  theme,
  editorSettings = DEFAULT_EDITOR_SETTINGS,
  navTarget,
  workspaceFolder,
  onChange,
  onRun,
  onSave,
  onSaveAs,
  onSaveAll,
  onOpen,
  onNew,
  onCloseTab,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onOpenWorkspace,
  openDocIds
}, ref) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const viewStatesRef = useRef<Map<string, any>>(new Map());
  const activeDocIdRef = useRef<string>(activeDocId);
  const isSwitchingModelRef = useRef<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  const onRunRef = useRef(onRun);
  const onSaveRef = useRef(onSave);
  const onSaveAsRef = useRef(onSaveAs);
  const onSaveAllRef = useRef(onSaveAll);
  const onOpenRef = useRef(onOpen);
  const onNewRef = useRef(onNew);
  const onCloseTabRef = useRef(onCloseTab);
  const onZoomInRef = useRef(onZoomIn);
  const onZoomOutRef = useRef(onZoomOut);
  const onZoomResetRef = useRef(onZoomReset);
  const onOpenWorkspaceRef = useRef(onOpenWorkspace);

  onRunRef.current = onRun;
  onSaveRef.current = onSave;
  onSaveAsRef.current = onSaveAs;
  onSaveAllRef.current = onSaveAll;
  onOpenRef.current = onOpen;
  onNewRef.current = onNew;
  onCloseTabRef.current = onCloseTab;
  onZoomInRef.current = onZoomIn;
  onZoomOutRef.current = onZoomOut;
  onZoomResetRef.current = onZoomReset;
  onOpenWorkspaceRef.current = onOpenWorkspace;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const openReplaceWidget = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    editor.focus();
    const controller = editor.getContribution('editor.contrib.findController') as any;
    if (controller && typeof controller.start === 'function') {
      const currentSelection = editor.getSelection?.();
      const findInputFocused = typeof controller.isFindInputFocused === 'function' ? controller.isFindInputFocused() : false;
      const seedSearchString = currentSelection && !currentSelection.isEmpty() && currentSelection.startLineNumber === currentSelection.endLineNumber;
      const shouldFocus = findInputFocused || seedSearchString ? 2 : 1;
      controller.start({
        forceRevealReplace: true,
        seedSearchStringFromSelection: seedSearchString ? 'single' : 'none',
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: true,
        shouldFocus,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: true
      });
    } else {
      editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
    }
  };

  const openFindWidget = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    editorRef.current.getAction('actions.find')?.run();
  };

  useImperativeHandle(ref, () => ({
    openReplace: openReplaceWidget,
    openFind: openFindWidget,
    focus: () => editorRef.current?.focus()
  }));

  // Helper to get or create Monaco model for document
  const getOrCreateModel = (docId: string, initialCode: string, lang: string) => {
    if (!monacoRef.current) return null;
    const uri = monacoRef.current.Uri.parse(`occ-doc://workspace/${docId}`);
    let model = monacoRef.current.editor.getModel(uri);
    if (!model) {
      model = monacoRef.current.editor.createModel(initialCode, lang, uri);
    } else {
      if (model.getLanguageId() !== lang) {
        monacoRef.current.editor.setModelLanguage(model, lang);
      }
    }
    if (model) {
      model.updateOptions({
        tabSize: editorSettings.tabSize,
        insertSpaces: editorSettings.insertSpaces
      });
    }
    return model;
  };

  // Mount editor
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    (window as any).monaco = monaco;
    (window as any).codeEditor = editor;

    // Define custom CODEN editor dark theme:
    // Inherits Monaco's native Dark+ syntax highlighting rules (keywords, types,
    // strings, numbers, comments, functions, variables, operators),
    // while keeping CODEN's custom background (#161412) and editor chrome.
    monaco.editor.defineTheme('coden-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#161412',
        'editor.foreground': '#D4D4D4',
        'editorLineNumber.foreground': '#5C5A55',
        'editorLineNumber.activeForeground': '#A7ADB5',
        'editor.lineHighlightBackground': '#1F1C18',
        'editorCursor.foreground': '#A7ADB5',
        'editorWhitespace.foreground': '#282420'
      }
    });

    if (theme === 'dark') {
      monaco.editor.setTheme('coden-dark');
    } else {
      monaco.editor.setTheme('vs');
    }

    // Command: Ctrl+Enter -> Run Active Tab
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current();
    });

    // Command: Ctrl+S -> Save Active Tab
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    // Command: Ctrl+Shift+S -> Save As
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () => {
      onSaveAsRef.current?.();
    });

    // Command: Ctrl+Alt+S -> Save All
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyS, () => {
      onSaveAllRef.current?.();
    });

    // Command: Ctrl+O -> Open File
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, () => {
      onOpenRef.current?.();
    });

    // Command: Ctrl+N -> New File
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
      onNewRef.current?.();
    });

    // Command: Ctrl+W -> Close File (BUG-05)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      onCloseTabRef.current?.();
    });

    // Command: Ctrl+= -> Zoom In (BUG-04)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
      onZoomInRef.current?.();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Equal, () => {
      onZoomInRef.current?.();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadAdd, () => {
      onZoomInRef.current?.();
    });

    // Command: Ctrl+- -> Zoom Out (BUG-04)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
      onZoomOutRef.current?.();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadSubtract, () => {
      onZoomOutRef.current?.();
    });

    // Command: Ctrl+0 -> Zoom Reset (BUG-04)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
      onZoomResetRef.current?.();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Numpad0, () => {
      onZoomResetRef.current?.();
    });

    // Command: Ctrl+K Ctrl+O -> Open Workspace Folder chord (BUG-06)
    editor.addCommand(
      monaco.KeyMod.chord(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO
      ),
      () => {
        onOpenWorkspaceRef.current?.();
      }
    );

    // Command: Ctrl+F -> Monaco Native Find
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      openFindWidget();
    });

    // Command: Ctrl+H -> Monaco Native Find & Replace (BUG-07)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      openReplaceWidget();
    });

    // Command: Ctrl+G -> Monaco Native Go to Line
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      editor.getAction('editor.action.gotoLine')?.run();
    });

    // Track cursor movement for status bar
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, column: e.position.column });
    });

    // Attach initial model
    const initialModel = getOrCreateModel(activeDocId, code, language);
    if (initialModel) {
      isSwitchingModelRef.current = true;
      editor.setModel(initialModel);
      isSwitchingModelRef.current = false;
    }

    // Content change listener
    editor.onDidChangeModelContent(() => {
      if (isSwitchingModelRef.current) return;
      const currentVal = editor.getValue();
      onChangeRef.current(currentVal, activeDocIdRef.current);
    });

    editor.focus();
  };

  // Switch Monaco model when activeDocId changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const prevDocId = activeDocIdRef.current;
    if (prevDocId && prevDocId !== activeDocId) {
      // Save view state (cursor, scroll position) of the previous document
      const currentViewState = editorRef.current.saveViewState();
      if (currentViewState) {
        viewStatesRef.current.set(prevDocId, currentViewState);
      }
    }

    activeDocIdRef.current = activeDocId;

    // Switch to active document model
    const targetModel = getOrCreateModel(activeDocId, code, language);
    if (targetModel) {
      isSwitchingModelRef.current = true;
      editorRef.current.setModel(targetModel);
      isSwitchingModelRef.current = false;

      // Restore view state if saved
      const savedViewState = viewStatesRef.current.get(activeDocId);
      if (savedViewState) {
        editorRef.current.restoreViewState(savedViewState);
      }

      // Update cursor position in status bar
      const pos = editorRef.current.getPosition();
      if (pos) {
        setCursorPos({ line: pos.lineNumber, column: pos.column });
      }

      editorRef.current.focus();
    }
  }, [activeDocId]);

  // Keep code in sync if updated externally (e.g. file open, baseline reset, template change)
  useEffect(() => {
    if (!monacoRef.current) return;
    const uri = monacoRef.current.Uri.parse(`occ-doc://workspace/${activeDocId}`);
    const targetModel = monacoRef.current.editor.getModel(uri);
    if (targetModel && targetModel.getValue() !== code) {
      isSwitchingModelRef.current = true;
      targetModel.setValue(code);
      isSwitchingModelRef.current = false;
    }
  }, [code, activeDocId]);

  // Update Monaco syntax language when tab language changes
  useEffect(() => {
    if (!monacoRef.current) return;
    const uri = monacoRef.current.Uri.parse(`occ-doc://workspace/${activeDocId}`);
    const targetModel = monacoRef.current.editor.getModel(uri);
    if (targetModel && targetModel.getLanguageId() !== language) {
      monacoRef.current.editor.setModelLanguage(targetModel, language);
    }
  }, [language, activeDocId]);

  // Update Monaco theme when app theme changes
  useEffect(() => {
    if (!monacoRef.current) return;
    monacoRef.current.editor.setTheme(theme === 'dark' ? 'coden-dark' : 'vs');
  }, [theme]);

  // Apply dynamic editor settings to Monaco instance and active model
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.updateOptions(buildMonacoOptions(editorSettings));

    const model = editorRef.current.getModel();
    if (model) {
      model.updateOptions({
        tabSize: editorSettings.tabSize,
        insertSpaces: editorSettings.insertSpaces
      });
    }
  }, [editorSettings]);

  // Jump to navigation target (e.g. compiler error line/column click)
  useEffect(() => {
    if (!editorRef.current || !navTarget) return;
    const targetLine = navTarget.line;
    const targetCol = navTarget.column || 1;
    editorRef.current.revealPositionInCenter({ lineNumber: targetLine, column: targetCol });
    editorRef.current.setPosition({ lineNumber: targetLine, column: targetCol });
    setCursorPos({ line: targetLine, column: targetCol });
    editorRef.current.focus();
  }, [navTarget?.nonce]);

  // Dispose models for closed documents to prevent memory leaks
  useEffect(() => {
    if (!monacoRef.current) return;
    const openSet = new Set(openDocIds);

    // Clean stored view states
    for (const id of viewStatesRef.current.keys()) {
      if (!openSet.has(id)) {
        viewStatesRef.current.delete(id);
      }
    }

    // Clean Monaco models
    const allModels = monacoRef.current.editor.getModels();
    for (const m of allModels) {
      if (m.uri.scheme === 'occ-doc') {
        const docId = m.uri.path.replace(/^\//, '');
        if (!openSet.has(docId)) {
          m.dispose();
        }
      }
    }
  }, [openDocIds]);

  return (
    <div className="editor-container-wrapper">
      <div className="editor-monaco-area">
        <Editor
          height="100%"
          width="100%"
          theme={theme === 'dark' ? 'coden-dark' : 'vs'}
          onMount={handleEditorDidMount}
          options={buildMonacoOptions(editorSettings)}
        />
      </div>

      {/* Status Bar */}
      <div className="editor-status-bar">
        {/* Left section: status + workspace */}
        <div className="status-bar-section">
          <span className="status-bar-item status-ready">
            <span className="status-dot" aria-hidden="true" />
            Ready
          </span>
          {workspaceFolder && (
            <>
              <span className="status-bar-sep" aria-hidden="true" />
              <span className="status-bar-item" title={workspaceFolder}>
                <FolderOpen size={11} />
                <span className="status-bar-ws-label">
                  {workspaceFolder.split(/[\/\\]/).pop() || workspaceFolder}
                </span>
              </span>
            </>
          )}
        </div>
        {/* Right section: cursor + encoding + language + bell */}
        <div className="status-bar-section">
          <span className="status-bar-item highlight">
            Ln {cursorPos.line}, Col {cursorPos.column}
          </span>
          <span className="status-bar-sep" aria-hidden="true" />
          <span className="status-bar-item">
            {editorSettings.insertSpaces ? 'Spaces' : 'Tabs'}: {editorSettings.tabSize}
          </span>
          <span className="status-bar-sep" aria-hidden="true" />
          <span className="status-bar-item">UTF-8</span>
          <span className="status-bar-sep" aria-hidden="true" />
          <span className="status-bar-item highlight">
            {getLanguageDisplayName(language)}
          </span>
          <span className="status-bar-sep" aria-hidden="true" />
          <span className="status-bar-item status-bell" title="No notifications">
            <Bell size={11} />
          </span>
        </div>
      </div>
    </div>
  );
});

CodeEditor.displayName = 'CodeEditor';
