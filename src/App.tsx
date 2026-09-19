import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar/Toolbar';
import { CodeEditor, CodeEditorHandle } from './components/CodeEditor/CodeEditor';
import { ConsolePanel } from './components/ConsolePanel/ConsolePanel';
import { ResizableLayout } from './components/ResizableLayout/ResizableLayout';
import { SettingsModal } from './components/Settings/SettingsModal';
import { FileTree } from './components/FileTree/FileTree';
import { NewFileDialog } from './components/NewFileDialog/NewFileDialog';
import { LANGUAGE_CONFIGS } from './electron/languages';
import {
  ExecutionResult,
  CompilerStatus,
  EditorDocument,
  EditorSettings,
  DEFAULT_EDITOR_SETTINGS,
  WorkspaceState,
  WorkspaceFileNode
} from './electron/types';
import { ExecutionService } from './services/ExecutionService';
import { isElectronAvailable } from './services/capability';
import { requiresStdin } from './utils/inputDetection';
import './styles/theme.css';

declare global {
  interface Window {
    electronAPI?: {
      runCode: (
        languageId: string,
        code: string,
        input: string,
        timeoutSeconds: number,
        executionId?: string
      ) => Promise<ExecutionResult>;
      stopExecution: (executionId?: string) => Promise<boolean>;
      checkCompilers: () => Promise<CompilerStatus[]>;
      openFile: () => Promise<{ filePath?: string; content?: string; error?: string } | null>;
      readFile: (filePath: string) => Promise<{ filePath?: string; content?: string; error?: string }>;
      saveFile: (
        filePath: string | null,
        content: string,
        defaultExtension: string,
        defaultName: string
      ) => Promise<{ filePath?: string; success?: boolean; canceled?: boolean; error?: string } | null>;
      saveFileAs: (
        content: string,
        defaultExtension: string,
        defaultName: string
      ) => Promise<{ filePath?: string; success?: boolean; canceled?: boolean; error?: string } | null>;
      confirmUnsaved: (fileName: string) => Promise<'save' | 'dontsave' | 'cancel'>;
      confirmMultipleUnsaved: (fileNames: string[]) => Promise<'saveall' | 'dontsave' | 'cancel'>;
      forceClose: () => Promise<void>;
      onCloseRequested: (callback: () => void) => () => void;
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      openWorkspace: () => Promise<WorkspaceState | null>;
      getWorkspaceTree: (
        targetPath?: string
      ) => Promise<{ rootPath?: string; name?: string; tree?: WorkspaceFileNode[]; error?: string } | null>;
      createWorkspaceFile: (
        relativePath: string,
        content?: string
      ) => Promise<{ success?: boolean; filePath?: string; error?: string }>;
      createWorkspaceFolder: (
        relativePath: string
      ) => Promise<{ success?: boolean; folderPath?: string; error?: string }>;
      closeWorkspace: () => Promise<boolean>;
      deleteWorkspaceItem: (
        relativePath: string,
        isDirectory: boolean
      ) => Promise<{ success?: boolean; error?: string }>;
      renameWorkspaceItem: (
        oldRelativePath: string,
        newName: string,
        isDirectory: boolean
      ) => Promise<{ success?: boolean; oldPath?: string; newPath?: string; newRelativePath?: string; error?: string }>;
    };
  }
}

// Canonical path normalization for Windows and Linux (renderer-safe)
const normalizePath = (p: string | null): string => {
  if (!p) return '';
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const isWindows =
    (typeof process !== 'undefined' && process.platform === 'win32') ||
    (typeof navigator !== 'undefined' && /windows|win32/i.test(navigator.userAgent));
  return isWindows ? normalized.toLowerCase() : normalized;
};

// Canonical path equality helper
const isSamePath = (p1: string | null, p2: string | null): boolean => {
  if (!p1 || !p2) return false;
  return normalizePath(p1) === normalizePath(p2);
};

// Canonical directory containment helper
const isInsideFolder = (filePath: string | null, dirPath: string | null): boolean => {
  if (!filePath || !dirPath) return false;
  const normFile = filePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const normDir = dirPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normFile.startsWith(normDir + '/');
};

// Determines whether an open scratchpad document is untouched and safely recyclable (BUG-09)
const isUntouchedInitialScratchpad = (doc: EditorDocument): boolean => {
  if (doc.filePath !== null) return false;
  if (doc.isDirty) return false;
  if (doc.code !== doc.savedBaseline) return false;
  const defaultCode = LANGUAGE_CONFIGS[doc.language]?.defaultCode ?? '';
  if (doc.code.trim() !== defaultCode.trim()) return false;
  if (doc.input && doc.input.trim().length > 0) return false;
  if (doc.outputResult) return false;
  return true;
};

// Helper to detect language from file extension
const detectLanguageFromExtension = (extWithDot: string, fallbackLang = 'java'): string => {
  const ext = extWithDot.toLowerCase();
  for (const [key, config] of Object.entries(LANGUAGE_CONFIGS)) {
    if (config.extension.toLowerCase() === ext) {
      return key;
    }
  }
  if (ext === '.cc' || ext === '.cxx' || ext === '.hpp' || ext === '.h') return 'cpp';
  return fallbackLang;
};

// Sensible temporary name generator: Main.java, Main-2.java, Main-3.java
const generateNewFileName = (langId: string, existingDocs: EditorDocument[]): string => {
  const config = LANGUAGE_CONFIGS[langId] || LANGUAGE_CONFIGS.java;
  const baseDefault = config.fileName;
  const dotIndex = baseDefault.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? baseDefault.slice(0, dotIndex) : baseDefault;
  const ext = dotIndex !== -1 ? baseDefault.slice(dotIndex) : '';

  const existingNames = new Set(existingDocs.map((d) => d.fileName.toLowerCase()));
  if (!existingNames.has(baseDefault.toLowerCase())) {
    return baseDefault;
  }

  let counter = 2;
  while (existingNames.has(`${baseName}-${counter}${ext}`.toLowerCase())) {
    counter++;
  }
  return `${baseName}-${counter}${ext}`;
};

export const App: React.FC = () => {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('occ_theme') as 'dark' | 'light') || 'dark';
  });

  // Recent files state (max 10, persisted)
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('occ_recent_files');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Initial document state
  const initialLang = localStorage.getItem('occ_last_lang') || 'java';
  const initialLangConfig = LANGUAGE_CONFIGS[initialLang] || LANGUAGE_CONFIGS.java;

  const [documents, setDocuments] = useState<EditorDocument[]>(() => [
    {
      id: 'doc-1',
      filePath: null,
      fileName: initialLangConfig.fileName,
      language: initialLang,
      code: initialLangConfig.defaultCode,
      savedBaseline: initialLangConfig.defaultCode,
      isDirty: false,
      input: '',
      outputResult: null
    }
  ]);

  const [activeDocId, setActiveDocId] = useState<string>('doc-1');

  // Resolved active document (fallback to first document)
  const activeDoc: EditorDocument =
    documents.find((d) => d.id === activeDocId) || documents[0] || {
      id: 'doc-fallback',
      filePath: null,
      fileName: 'Main.java',
      language: 'java',
      code: LANGUAGE_CONFIGS.java.defaultCode,
      savedBaseline: LANGUAGE_CONFIGS.java.defaultCode,
      isDirty: false,
      input: '',
      outputResult: null
    };

  const activeLangConfig = LANGUAGE_CONFIGS[activeDoc.language] || LANGUAGE_CONFIGS.java;

  // Running execution state and ownership tracking
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runningDocId, setRunningDocId] = useState<string | null>(null);
  const runningDocIdRef = useRef<string | null>(null);
  const runningExecIdRef = useRef<string | null>(null);
  const currentRunIdRef = useRef<number>(0);

  // Fullscreen & Settings
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(10);
  const [compilerStatuses, setCompilerStatuses] = useState<CompilerStatus[]>([]);
  const [isCheckingCompilers, setIsCheckingCompilers] = useState<boolean>(false);

  // Language change confirmation dialog state
  const [pendingLangChange, setPendingLangChange] = useState<{ newLangId: string; docId: string } | null>(null);

  // Delete Confirmation Dialog state (BUG-10)
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    path: string;
    relativePath: string;
    isDirectory: boolean;
    name: string;
    hasDirtyDocs: boolean;
    dirtyFileNames: string[];
  }>({
    isOpen: false,
    path: '',
    relativePath: '',
    isDirectory: false,
    name: '',
    hasDirtyDocs: false,
    dirtyFileNames: []
  });

  // Rename Dialog state (BUG-10)
  const [renameDialog, setRenameDialog] = useState<{
    isOpen: boolean;
    path: string;
    relativePath: string;
    isDirectory: boolean;
    oldName: string;
    newName: string;
    error?: string;
  }>({
    isOpen: false,
    path: '',
    relativePath: '',
    isDirectory: false,
    oldName: '',
    newName: ''
  });

  // Phase 6 Editor Settings State & Persistence
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    try {
      const saved = localStorage.getItem('occ_editor_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_EDITOR_SETTINGS, ...parsed };
      }
    } catch {
      // fallback to defaults
    }
    return DEFAULT_EDITOR_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('occ_editor_settings', JSON.stringify(editorSettings));
  }, [editorSettings]);

  const handleUpdateEditorSettings = useCallback((newSettings: Partial<EditorSettings>) => {
    setEditorSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  // Zoom handlers (BUG-04)
  const handleZoomIn = useCallback(() => {
    setEditorSettings((prev) => ({
      ...prev,
      fontSize: Math.min(32, prev.fontSize + 1)
    }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setEditorSettings((prev) => ({
      ...prev,
      fontSize: Math.max(10, prev.fontSize - 1)
    }));
  }, []);

  const handleZoomReset = useCallback(() => {
    setEditorSettings((prev) => ({
      ...prev,
      fontSize: DEFAULT_EDITOR_SETTINGS.fontSize
    }));
  }, []);

  const codeEditorRef = useRef<CodeEditorHandle>(null);
  const activeDocIdRef = useRef(activeDocId);
  activeDocIdRef.current = activeDocId;
  const handleCloseTabRef = useRef<((docId: string) => Promise<void>) | null>(null);
  const handleOpenWorkspaceRef = useRef<(() => Promise<void>) | null>(null);
  const handleRunRef = useRef<(() => Promise<void>) | null>(null);

  // Open Folder chord state (BUG-06)
  const pendingChordRef = useRef<string | null>(null);
  const chordTimerRef = useRef<any>(null);

  // Navigation target for compiler error line clicks
  const [navTarget, setNavTarget] = useState<{ line: number; column?: number; nonce: number } | null>(null);

  const handleNavigateToError = useCallback(
    (line: number, column?: number, fileName?: string) => {
      if (fileName) {
        const matchDoc = documents.find(
          (d) =>
            d.fileName.toLowerCase() === fileName.toLowerCase() ||
            (d.filePath && normalizePath(d.filePath).endsWith(fileName.toLowerCase()))
        );
        if (matchDoc && matchDoc.id !== activeDocId) {
          setActiveDocId(matchDoc.id);
        }
      }
      setNavTarget({ line, column, nonce: Date.now() });
    },
    [documents, activeDocId]
  );

  // Phase 7: Workspace / Project Management State
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(() => {
    const saved = localStorage.getItem('occ_sidebar_visible');
    return saved !== null ? saved === 'true' : true;
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('occ_sidebar_width');
    return saved ? Math.max(160, Math.min(450, parseInt(saved, 10))) : 220;
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);

  // New File / Folder dialog modals in workspace
  const [newFileDialog, setNewFileDialog] = useState<{
    isOpen: boolean;
    folderRelPath: string;
    fileName: string;
  }>({
    isOpen: false,
    folderRelPath: '',
    fileName: ''
  });

  const [newFolderDialog, setNewFolderDialog] = useState<{
    isOpen: boolean;
    folderRelPath: string;
    folderName: string;
  }>({
    isOpen: false,
    folderRelPath: '',
    folderName: ''
  });

  // Dialog for creating a new document tab with language selection
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('occ_sidebar_visible', String(isSidebarVisible));
  }, [isSidebarVisible]);

  // Restore workspace from localStorage
  useEffect(() => {
    const lastWorkspace = localStorage.getItem('occ_last_workspace');
    if (lastWorkspace && window.electronAPI?.getWorkspaceTree) {
      window.electronAPI.getWorkspaceTree(lastWorkspace).then((res) => {
        if (res && !res.error && res.rootPath && res.tree) {
          setWorkspace({
            rootPath: res.rootPath,
            name: res.name || res.rootPath.split(/[\\/]/).pop() || 'Workspace',
            tree: res.tree
          });
        } else {
          localStorage.removeItem('occ_last_workspace');
        }
      }).catch(() => {
        localStorage.removeItem('occ_last_workspace');
      });
    }
  }, []);

  const handleRefreshWorkspace = useCallback(async () => {
    if (!workspace?.rootPath || !window.electronAPI?.getWorkspaceTree) return;
    try {
      const res = await window.electronAPI.getWorkspaceTree(workspace.rootPath);
      if (res && !res.error && res.tree) {
        setWorkspace((prev) => (prev ? { ...prev, tree: res.tree || [] } : null));
      }
    } catch (e) {
      console.error('Failed to refresh workspace tree:', e);
    }
  }, [workspace?.rootPath]);

  const ensureDirtyDocsHandledBeforeWorkspaceChange = async (): Promise<boolean> => {
    const dirtyDocs = documents.filter((d) => d.isDirty);
    if (dirtyDocs.length === 0) return true;

    if (dirtyDocs.length === 1 && window.electronAPI?.confirmUnsaved) {
      const choice = await window.electronAPI.confirmUnsaved(dirtyDocs[0].fileName);
      if (choice === 'cancel') return false;
      if (choice === 'save') {
        const saved = await handleSaveDoc(dirtyDocs[0]);
        if (!saved) return false;
      }
      return true;
    }

    if (window.electronAPI?.confirmMultipleUnsaved) {
      const choice = await window.electronAPI.confirmMultipleUnsaved(
        dirtyDocs.map((d) => d.fileName)
      );
      if (choice === 'cancel') return false;
      if (choice === 'saveall') {
        for (const d of dirtyDocs) {
          const saved = await handleSaveDoc(d);
          if (!saved) return false;
        }
      }
      return true;
    }

    return true;
  };

  const handleOpenWorkspace = async () => {
    (window as any).__lastOpenWorkspaceTrigger = Date.now();
    if (!isElectronAvailable() || !window.electronAPI?.openWorkspace) {
      return;
    }

    const safeToProceed = await ensureDirtyDocsHandledBeforeWorkspaceChange();
    if (!safeToProceed) return;

    try {
      const res = await window.electronAPI.openWorkspace();
      if (res && res.rootPath && res.tree) {
        setWorkspace({
          rootPath: res.rootPath,
          name: res.name || res.rootPath.split(/[\\/]/).pop() || 'Workspace',
          tree: res.tree
        });
        setIsSidebarVisible(true);
        localStorage.setItem('occ_last_workspace', res.rootPath);
      }
    } catch (e: any) {
      alert(`Failed to open workspace: ${e?.message || e}`);
    }
  };

  const handleCloseWorkspace = async () => {
    const safeToProceed = await ensureDirtyDocsHandledBeforeWorkspaceChange();
    if (!safeToProceed) return;

    if (window.electronAPI?.closeWorkspace) {
      await window.electronAPI.closeWorkspace();
    }
    setWorkspace(null);
    localStorage.removeItem('occ_last_workspace');
  };

  const handleOpenFileFromTree = async (filePath: string) => {
    const norm = normalizePath(filePath);

    // If tab already exists, activate it
    const existing = documents.find((d) => d.filePath && normalizePath(d.filePath) === norm);
    if (existing) {
      setActiveDocId(existing.id);
      return;
    }

    if (!isElectronAvailable() || !window.electronAPI?.readFile) {
      return;
    }

    const res = await window.electronAPI.readFile(filePath);
    if (res.error) {
      alert(`Could not open file: ${res.error}`);
      handleRefreshWorkspace();
      return;
    }

    const ext = '.' + filePath.split('.').pop() || '';
    const lang = detectLanguageFromExtension(ext);
    const fileName = filePath.split(/[\\/]/).pop() || 'Untitled';
    const content = res.content || '';

    const newDoc: EditorDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filePath: res.filePath || filePath,
      fileName,
      language: lang,
      code: content,
      savedBaseline: content,
      isDirty: false,
      input: '',
      outputResult: null
    };

    setDocuments((prev) => {
      if (prev.length === 1 && isUntouchedInitialScratchpad(prev[0])) {
        return [newDoc];
      }
      return [...prev, newDoc];
    });
    setActiveDocId(newDoc.id);
    addRecentFile(filePath);
  };

  const handleCreateFileInWorkspace = async (folderRelPath: string, fileNameInput: string) => {
    if (!isElectronAvailable() || !window.electronAPI?.createWorkspaceFile || !workspace) {
      return;
    }

    const trimmed = fileNameInput.trim();
    if (!trimmed) {
      alert('Please provide a file name.');
      return;
    }

    const relPath = folderRelPath ? `${folderRelPath}/${trimmed}` : trimmed;
    const ext = '.' + trimmed.split('.').pop() || '';
    const lang = detectLanguageFromExtension(ext);
    const templateCode = LANGUAGE_CONFIGS[lang]?.defaultCode || '';

    const res = await window.electronAPI.createWorkspaceFile(relPath, templateCode);
    if (res.error) {
      alert(`File Creation Error: ${res.error}`);
      return;
    }

    if (res.success && res.filePath) {
      await handleRefreshWorkspace();
      await handleOpenFileFromTree(res.filePath);
      setNewFileDialog({ isOpen: false, folderRelPath: '', fileName: '' });
    }
  };

  const handleCreateFolderInWorkspace = async (folderRelPath: string, folderNameInput: string) => {
    if (!isElectronAvailable() || !window.electronAPI?.createWorkspaceFolder || !workspace) {
      return;
    }

    const trimmed = folderNameInput.trim();
    if (!trimmed) {
      alert('Please provide a folder name.');
      return;
    }

    const relPath = folderRelPath ? `${folderRelPath}/${trimmed}` : trimmed;
    const res = await window.electronAPI.createWorkspaceFolder(relPath);
    if (res.error) {
      alert(`Folder Creation Error: ${res.error}`);
      return;
    }

    if (res.success) {
      await handleRefreshWorkspace();
      setNewFolderDialog({ isOpen: false, folderRelPath: '', folderName: '' });
    }
  };

  const handleRequestDelete = (
    path: string,
    relativePath: string,
    isDirectory: boolean,
    name: string
  ) => {
    if (!isElectronAvailable() || !window.electronAPI?.deleteWorkspaceItem) return;

    // Identify all affected open documents using canonical comparison/containment
    const affected = isDirectory
      ? documents.filter((d) => isInsideFolder(d.filePath, path))
      : documents.filter((d) => isSamePath(d.filePath, path));

    const dirtyDocs = affected.filter((d) => d.isDirty);
    const dirtyFileNames = dirtyDocs.map((d) => d.fileName);

    setDeleteDialog({
      isOpen: true,
      path,
      relativePath,
      isDirectory,
      name,
      hasDirtyDocs: dirtyDocs.length > 0,
      dirtyFileNames
    });
  };

  const handleConfirmDelete = async () => {
    if (!isElectronAvailable() || !window.electronAPI?.deleteWorkspaceItem) return;

    const { path, relativePath, isDirectory } = deleteDialog;
    setDeleteDialog((prev) => ({ ...prev, isOpen: false }));

    // Identify affected open documents
    const affected = isDirectory
      ? documents.filter((d) => isInsideFolder(d.filePath, path))
      : documents.filter((d) => isSamePath(d.filePath, path));

    // Execution safety: terminate execution if any affected document owns active run (Batch 1 lifecycle)
    for (const d of affected) {
      if (runningDocIdRef.current === d.id) {
        await handleStop(d.id);
      }
    }

    const res = await window.electronAPI.deleteWorkspaceItem(relativePath, isDirectory);
    if (res.error) {
      alert(`Delete Error: ${res.error}`);
      return;
    }

    if (res.success) {
      // Remove affected documents from state
      setDocuments((prev) => {
        const remaining = prev.filter((d) => !affected.some((ad) => ad.id === d.id));

        if (remaining.length === 0) {
          const langConfig = LANGUAGE_CONFIGS.java;
          const freshDoc: EditorDocument = {
            id: `doc-${Date.now()}`,
            filePath: null,
            fileName: langConfig.fileName,
            language: 'java',
            code: langConfig.defaultCode,
            savedBaseline: langConfig.defaultCode,
            isDirty: false,
            input: '',
            outputResult: null
          };
          setActiveDocId(freshDoc.id);
          return [freshDoc];
        }

        if (affected.some((ad) => ad.id === activeDocId)) {
          const closeIndex = prev.findIndex((d) => d.id === activeDocId);
          const nextIndex = closeIndex > 0 ? closeIndex - 1 : 0;
          const nextDoc = remaining[nextIndex] || remaining[0];
          setActiveDocId(nextDoc.id);
        }

        return remaining;
      });

      // Remove from recent files
      affected.forEach((ad) => {
        if (ad.filePath) removeRecentFile(ad.filePath);
      });
      if (!isDirectory) {
        removeRecentFile(path);
      }

      await handleRefreshWorkspace();
    }
  };

  const handleRequestRename = (
    path: string,
    relativePath: string,
    isDirectory: boolean,
    name: string
  ) => {
    if (!isElectronAvailable() || !window.electronAPI?.renameWorkspaceItem) return;
    setRenameDialog({
      isOpen: true,
      path,
      relativePath,
      isDirectory,
      oldName: name,
      newName: name,
      error: undefined
    });
  };

  const handleConfirmRename = async () => {
    if (!isElectronAvailable() || !window.electronAPI?.renameWorkspaceItem) return;

    const trimmed = renameDialog.newName.trim();
    if (!trimmed) {
      setRenameDialog((prev) => ({ ...prev, error: 'Name cannot be empty.' }));
      return;
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      setRenameDialog((prev) => ({ ...prev, error: 'Name cannot contain path separators.' }));
      return;
    }
    if (/[<>:"/\\|?*]/.test(trimmed)) {
      setRenameDialog((prev) => ({ ...prev, error: 'Name contains invalid characters.' }));
      return;
    }
    if (trimmed === renameDialog.oldName) {
      setRenameDialog((prev) => ({ ...prev, error: 'New name is identical to current name.' }));
      return;
    }

    // Identify affected open documents
    const affected = renameDialog.isDirectory
      ? documents.filter((d) => isInsideFolder(d.filePath, renameDialog.path))
      : documents.filter((d) => isSamePath(d.filePath, renameDialog.path));

    // Execution safety: terminate execution if any affected document owns active run (Batch 1 lifecycle)
    for (const d of affected) {
      if (runningDocIdRef.current === d.id) {
        await handleStop(d.id);
      }
    }

    const res = await window.electronAPI.renameWorkspaceItem(
      renameDialog.relativePath,
      trimmed,
      renameDialog.isDirectory
    );

    if (res.error) {
      setRenameDialog((prev) => ({ ...prev, error: res.error }));
      return;
    }

    if (res.success && res.newPath) {
      const newPathOnDisk = res.newPath;
      const oldPathOnDisk = renameDialog.path;

      if (!renameDialog.isDirectory) {
        // Single file rename: update path, name, language without recreating tab/model
        const ext = '.' + trimmed.split('.').pop() || '';
        setDocuments((prev) =>
          prev.map((d) => {
            if (isSamePath(d.filePath, oldPathOnDisk)) {
              const detectedLang = detectLanguageFromExtension(ext, d.language);
              return {
                ...d,
                filePath: newPathOnDisk,
                fileName: trimmed,
                language: detectedLang
              };
            }
            return d;
          })
        );
        removeRecentFile(oldPathOnDisk);
        addRecentFile(newPathOnDisk);
      } else {
        // Directory rename: update all open documents nested inside
        const normOldDir = oldPathOnDisk.replace(/\\/g, '/').replace(/\/+$/, '');
        const normNewDir = newPathOnDisk.replace(/\\/g, '/').replace(/\/+$/, '');

        setDocuments((prev) =>
          prev.map((d) => {
            if (isInsideFolder(d.filePath, oldPathOnDisk)) {
              const normDoc = d.filePath!.replace(/\\/g, '/');
              const suffix = normDoc.slice(normOldDir.length);
              const updatedPath = normNewDir + suffix;
              return {
                ...d,
                filePath: updatedPath
              };
            }
            return d;
          })
        );
      }

      setRenameDialog({
        isOpen: false,
        path: '',
        relativePath: '',
        isDirectory: false,
        oldName: '',
        newName: ''
      });

      await handleRefreshWorkspace();
    }
  };

  const handleSidebarDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingSidebar(true);
  };

  const handleSidebarDragMove = (e: React.PointerEvent) => {
    if (!isDraggingSidebar) return;
    const newWidth = Math.max(160, Math.min(450, e.clientX));
    setSidebarWidth(newWidth);
    localStorage.setItem('occ_sidebar_width', String(newWidth));
  };

  const handleSidebarDragEnd = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDraggingSidebar(false);
  };

  // Apply theme & persist language
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('occ_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (activeDoc?.language) {
      localStorage.setItem('occ_last_lang', activeDoc.language);
    }
  }, [activeDoc?.language]);

  const addRecentFile = useCallback((fPath: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((p) => normalizePath(p) !== normalizePath(fPath));
      const updated = [fPath, ...filtered].slice(0, 10);
      localStorage.setItem('occ_recent_files', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeRecentFile = useCallback((fPath: string) => {
    setRecentFiles((prev) => {
      const updated = prev.filter((p) => normalizePath(p) !== normalizePath(fPath));
      localStorage.setItem('occ_recent_files', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Check compilers on mount
  const refreshCompilers = async () => {
    setIsCheckingCompilers(true);
    try {
      const statuses = await ExecutionService.checkCompilers();
      setCompilerStatuses(statuses);
    } catch (e) {
      console.error('Failed checking compilers', e);
    } finally {
      setIsCheckingCompilers(false);
    }
  };

  useEffect(() => {
    refreshCompilers();
  }, []);

  // Handle active document code update
  const handleCodeChange = (newCode: string | undefined, targetDocId?: string) => {
    const updatedCode = newCode ?? '';
    const idToUpdate = targetDocId || activeDocId;
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === idToUpdate) {
          return {
            ...doc,
            code: updatedCode,
            isDirty: updatedCode !== doc.savedBaseline
          };
        }
        return doc;
      })
    );
  };

  // Handle active document input update (Per-document stdin)
  const handleInputChange = (newInput: string) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === activeDoc.id ? { ...doc, input: newInput } : doc))
    );
  };

  // Save specific document
  const handleSaveDoc = async (docToSave: EditorDocument): Promise<boolean> => {
    if (!isElectronAvailable() || !window.electronAPI?.saveFile) {
      return false;
    }

    const langConfig = LANGUAGE_CONFIGS[docToSave.language] || LANGUAGE_CONFIGS.java;
    const baseName = docToSave.filePath
      ? docToSave.filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'Main'
      : docToSave.fileName.replace(/\.[^/.]+$/, '') || 'Main';

    const res = await window.electronAPI.saveFile(
      docToSave.filePath,
      docToSave.code,
      langConfig.extension,
      baseName
    );

    if (res?.canceled) {
      return false;
    }

    if (res?.error) {
      alert(`Save Error: ${res.error}`);
      return false;
    }

    if (res?.success && res.filePath) {
      const normPath = normalizePath(res.filePath);
      // Prevent two open tabs representing the same physical file
      const conflict = documents.find(
        (d) => d.id !== docToSave.id && d.filePath && normalizePath(d.filePath) === normPath
      );
      if (conflict) {
        alert(`Conflict: A tab for '${res.filePath}' is already open. Cannot open the same file in multiple tabs.`);
        return false;
      }

      const newFilePath = res.filePath;
      const newFileName = newFilePath.split(/[\\/]/).pop() || docToSave.fileName;
      const ext = '.' + newFilePath.split('.').pop();
      const newLang = detectLanguageFromExtension(ext, docToSave.language);

      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id === docToSave.id) {
            return {
              ...d,
              filePath: newFilePath,
              fileName: newFileName,
              language: newLang,
              savedBaseline: docToSave.code,
              isDirty: false
            };
          }
          return d;
        })
      );

      addRecentFile(newFilePath);
      handleRefreshWorkspace();
      return true;
    }

    return false;
  };

  // Save active document
  const handleSaveActive = async (): Promise<boolean> => {
    return await handleSaveDoc(activeDoc);
  };

  // Save As active document
  const handleSaveAs = async (): Promise<boolean> => {
    if (!isElectronAvailable() || !window.electronAPI?.saveFileAs) {
      return false;
    }

    const langConfig = LANGUAGE_CONFIGS[activeDoc.language] || LANGUAGE_CONFIGS.java;
    const baseName = activeDoc.filePath
      ? activeDoc.filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'Main'
      : activeDoc.fileName.replace(/\.[^/.]+$/, '') || 'Main';

    const res = await window.electronAPI.saveFileAs(
      activeDoc.code,
      langConfig.extension,
      baseName
    );

    if (res?.canceled) {
      return false;
    }

    if (res?.error) {
      alert(`Save As Error: ${res.error}`);
      return false;
    }

    if (res?.success && res.filePath) {
      const normPath = normalizePath(res.filePath);
      // Prevent two open tabs representing the same physical file
      const conflict = documents.find(
        (d) => d.id !== activeDoc.id && d.filePath && normalizePath(d.filePath) === normPath
      );
      if (conflict) {
        alert(`Conflict: A tab for '${res.filePath}' is already open. Cannot open the same file in multiple tabs.`);
        return false;
      }

      const newFilePath = res.filePath;
      const newFileName = newFilePath.split(/[\\/]/).pop() || activeDoc.fileName;
      const ext = '.' + newFilePath.split('.').pop();
      const newLang = detectLanguageFromExtension(ext, activeDoc.language);

      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id === activeDoc.id) {
            return {
              ...d,
              filePath: newFilePath,
              fileName: newFileName,
              language: newLang,
              savedBaseline: activeDoc.code,
              isDirty: false
            };
          }
          return d;
        })
      );

      addRecentFile(newFilePath);
      handleRefreshWorkspace();
      return true;
    }

    return false;
  };

  // Save All documents
  const handleSaveAll = async (): Promise<boolean> => {
    const dirtyDocs = documents.filter((d) => d.isDirty);
    if (dirtyDocs.length === 0) return true;

    for (const d of dirtyDocs) {
      const ok = await handleSaveDoc(d);
      if (!ok) {
        return false;
      }
    }
    return true;
  };

  // New File: opens the New File modal to choose language and filename
  const handleNewFile = () => {
    setIsNewDocModalOpen(true);
  };

  // Creates the new document once user confirms in the New File dialog
  const handleCreateNewDocument = (language: string, fileName: string) => {
    const langConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.java;
    const starterCode = langConfig.defaultCode;

    const newDoc: EditorDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      filePath: null,
      fileName: fileName,
      language: language,
      code: starterCode,
      savedBaseline: starterCode,
      isDirty: false,
      input: '',
      outputResult: null
    };

    setDocuments((prev) => [...prev, newDoc]);
    setActiveDocId(newDoc.id);
    setIsNewDocModalOpen(false);
  };

  // Open File: opens as a new tab (or activates existing if already open)
  const handleOpenFile = async () => {
    if (!isElectronAvailable() || !window.electronAPI?.openFile) {
      return;
    }

    const res = await window.electronAPI.openFile();
    if (!res || !res.filePath || res.content === undefined) return;

    if (res.error) {
      alert(`Open Error: ${res.error}`);
      return;
    }

    const normTarget = normalizePath(res.filePath);
    // If file is already open, activate existing tab
    const existing = documents.find((d) => d.filePath && normalizePath(d.filePath) === normTarget);
    if (existing) {
      setActiveDocId(existing.id);
      return;
    }

    const ext = '.' + res.filePath.split('.').pop();
    const detectedLang = detectLanguageFromExtension(ext, activeDoc.language);
    const fName = res.filePath.split(/[\\/]/).pop() || 'Untitled';

    const newDoc: EditorDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      filePath: res.filePath,
      fileName: fName,
      language: detectedLang,
      code: res.content,
      savedBaseline: res.content,
      isDirty: false,
      input: '',
      outputResult: null
    };

    setDocuments((prev) => {
      if (prev.length === 1 && isUntouchedInitialScratchpad(prev[0])) {
        return [newDoc];
      }
      return [...prev, newDoc];
    });
    setActiveDocId(newDoc.id);
    addRecentFile(res.filePath);
  };

  // Open Recent File: activates existing tab or opens new tab
  const handleOpenRecentFile = async (fPath: string) => {
    const normTarget = normalizePath(fPath);
    // If already open, activate existing tab
    const existing = documents.find((d) => d.filePath && normalizePath(d.filePath) === normTarget);
    if (existing) {
      setActiveDocId(existing.id);
      return;
    }

    if (!isElectronAvailable() || !window.electronAPI?.readFile) {
      return;
    }

    const res = await window.electronAPI.readFile(fPath);
    if (res?.error) {
      alert(`File not found: ${fPath}`);
      removeRecentFile(fPath);
      return;
    }

    if (res && res.filePath && res.content !== undefined) {
      const ext = '.' + res.filePath.split('.').pop();
      const detectedLang = detectLanguageFromExtension(ext, activeDoc.language);
      const fName = res.filePath.split(/[\\/]/).pop() || 'Untitled';

      const newDoc: EditorDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filePath: res.filePath,
        fileName: fName,
        language: detectedLang,
        code: res.content,
        savedBaseline: res.content,
        isDirty: false,
        input: '',
        outputResult: null
      };

      setDocuments((prev) => {
        if (prev.length === 1 && isUntouchedInitialScratchpad(prev[0])) {
          return [newDoc];
        }
        return [...prev, newDoc];
      });
      setActiveDocId(newDoc.id);
      addRecentFile(res.filePath);
    }
  };

  // Close Tab
  const handleCloseTab = async (docIdToClose: string) => {
    const targetDoc = documents.find((d) => d.id === docIdToClose);
    if (!targetDoc) return;

    if (targetDoc.isDirty) {
      if (isElectronAvailable() && window.electronAPI?.confirmUnsaved) {
        const choice = await window.electronAPI.confirmUnsaved(targetDoc.fileName);
        if (choice === 'cancel') return;
        if (choice === 'save') {
          const saved = await handleSaveDoc(targetDoc);
          if (!saved) return;
        }
      } else {
        const discard = window.confirm(`Close tab "${targetDoc.fileName}"? In-memory changes will be discarded.`);
        if (!discard) return;
      }
    }

    // If this tab owns the active execution, safely terminate it first
    if (runningDocIdRef.current === docIdToClose) {
      await handleStop(docIdToClose);
    }

    // Remove document
    setDocuments((prev) => {
      const remaining = prev.filter((d) => d.id !== docIdToClose);

      // Requirement 22: if last tab closed, create fresh unsaved document
      if (remaining.length === 0) {
        const langConfig = LANGUAGE_CONFIGS[targetDoc.language] || LANGUAGE_CONFIGS.java;
        const freshDoc: EditorDocument = {
          id: `doc-${Date.now()}`,
          filePath: null,
          fileName: langConfig.fileName,
          language: targetDoc.language,
          code: langConfig.defaultCode,
          savedBaseline: langConfig.defaultCode,
          isDirty: false,
          input: '',
          outputResult: null
        };
        setActiveDocId(freshDoc.id);
        return [freshDoc];
      }

      // If closing active tab, activate adjacent tab
      if (docIdToClose === activeDocId) {
        const closeIndex = prev.findIndex((d) => d.id === docIdToClose);
        const nextIndex = closeIndex > 0 ? closeIndex - 1 : 0;
        const nextDoc = remaining[nextIndex] || remaining[0];
        setActiveDocId(nextDoc.id);
      }

      return remaining;
    });
  };

  handleCloseTabRef.current = handleCloseTab;
  handleOpenWorkspaceRef.current = handleOpenWorkspace;

  // Check if a document has content meaningfully different from the language default template
  const isMeaningfullyEdited = (doc: EditorDocument): boolean => {
    const currentDefault = LANGUAGE_CONFIGS[doc.language]?.defaultCode ?? '';
    return doc.code.trim() !== currentDefault.trim();
  };

  // Apply a confirmed language change atomically.
  //
  // TWO CASES:
  //
  // A) Unsaved document (filePath === null)
  //    - The document was never written to disk.
  //    - Switch language, preserve base name if present (e.g. Main-2.java -> Main-2.py).
  //    - Use new template as both code and savedBaseline.
  //    - isDirty = false (fresh scratchpad in the new language).
  //    - filePath stays null.
  //
  // B) Saved document (filePath !== null, e.g. "C:/.../Main.java")
  //    - The old file on disk is NOT touched — we never rename or overwrite it.
  //    - filePath is CLEARED to null so the document becomes unbound.
  //    - Derive a display name from the existing base name + new extension (e.g. "Main.py").
  //    - CRITICAL INVARIANT: The document content has NOT been persisted to disk.
  //      Therefore, savedBaseline is set to an unmatchable sentinel ('\0_unsaved_')
  //      and isDirty is set to true.
  //    - The tab displays the dirty indicator (•).
  //    - The app never claims the document is clean/saved until persisted.
  //    - Ctrl+S or Save As will prompt the Save dialog with Main.py, never overwriting Main.java.
  //    - When actually saved, filePath and savedBaseline are updated, and isDirty becomes false.
  const applyLanguageChange = (docId: string, newLangId: string) => {
    const newConfig = LANGUAGE_CONFIGS[newLangId];
    if (!newConfig) return;

    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;

        const dotIdx = d.fileName.lastIndexOf('.');
        const basePart = dotIdx !== -1 ? d.fileName.slice(0, dotIdx) : d.fileName;
        const newFileName = basePart ? `${basePart}${newConfig.extension}` : newConfig.fileName;

        if (!d.filePath) {
          // Case A: unsaved document — fresh scratchpad
          return {
            ...d,
            language: newLangId,
            fileName: newFileName,
            filePath: null,
            code: newConfig.defaultCode,
            savedBaseline: newConfig.defaultCode,
            isDirty: false
          };
        } else {
          // Case B: saved document — unbound, dirty, original disk file untouched
          return {
            ...d,
            language: newLangId,
            fileName: newFileName,
            filePath: null,
            code: newConfig.defaultCode,
            savedBaseline: '\0_unsaved_',
            isDirty: true
          };
        }
      })
    );
  };

  // Language Change on Active Tab — with confirmation if meaningfully edited or already saved on disk
  const handleLanguageChange = (newLangId: string) => {
    if (newLangId === activeDoc.language) return;
    if (!LANGUAGE_CONFIGS[newLangId]) return;

    if (activeDoc.filePath !== null || isMeaningfullyEdited(activeDoc)) {
      // Show inline confirm dialog — do NOT apply any change yet
      setPendingLangChange({ newLangId, docId: activeDoc.id });
      return;
    }

    // Untouched unsaved scratchpad — switch immediately
    applyLanguageChange(activeDoc.id, newLangId);
  };

  // Confirm handler: apply the pending language change
  const handleConfirmLangChange = () => {
    if (pendingLangChange) {
      applyLanguageChange(pendingLangChange.docId, pendingLangChange.newLangId);
    }
    setPendingLangChange(null);
  };

  // Cancel handler: discard the pending language change entirely
  const handleCancelLangChange = () => {
    setPendingLangChange(null);
  };

  // Run Active Tab Only
  const handleRun = async () => {
    if (isRunning) return;

    const executingDoc = activeDoc;
    const thisRunId = ++currentRunIdRef.current;

    // Clear previous output for active doc
    setDocuments((prev) =>
      prev.map((d) => (d.id === executingDoc.id ? { ...d, outputResult: null } : d))
    );

    // Smart Empty Input Validation:
    // If the input box has no user-provided content (empty or whitespace only),
    // check if the program source code reasonably requires stdin.
    const isInputEmpty = !executingDoc.input || executingDoc.input.trim().length === 0;
    if (isInputEmpty && requiresStdin(executingDoc.code, executingDoc.language)) {
      const validationMsgResult: ExecutionResult = {
        stdout: 'Please enter the input.',
        stderr: '',
        exitCode: 0,
        isValidationMessage: true,
        durationMs: 0
      };

      setDocuments((prev) =>
        prev.map((d) => (d.id === executingDoc.id ? { ...d, outputResult: validationMsgResult } : d))
      );
      return;
    }

    const executionId = `exec_${executingDoc.id}_${Date.now()}`;

    setIsRunning(true);
    setRunningDocId(executingDoc.id);
    runningDocIdRef.current = executingDoc.id;
    runningExecIdRef.current = executionId;

    try {
      const result = await ExecutionService.runCode(
        executingDoc.language,
        executingDoc.code,
        executingDoc.input,
        timeoutSeconds,
        executionId
      );

      // Section 19: Associate execution result with the document that started it
      if (thisRunId === currentRunIdRef.current) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === executingDoc.id ? { ...d, outputResult: result } : d))
        );
      }
    } catch (err: any) {
      if (thisRunId === currentRunIdRef.current) {
        const errResult: ExecutionResult = {
          stdout: '',
          stderr: err?.message || 'Execution error',
          exitCode: 1,
          durationMs: 0
        };
        setDocuments((prev) =>
          prev.map((d) => (d.id === executingDoc.id ? { ...d, outputResult: errResult } : d))
        );
      }
    } finally {
      if (thisRunId === currentRunIdRef.current) {
        setIsRunning(false);
        setRunningDocId(null);
        runningDocIdRef.current = null;
        runningExecIdRef.current = null;
      }
    }
  };

  handleRunRef.current = handleRun;

  const handleStop = async (targetDocId?: string | unknown) => {
    // If targetDocId is explicitly specified as a string (e.g. from handleCloseTab),
    // only stop if this document actually owns the run
    if (typeof targetDocId === 'string' && runningDocIdRef.current !== targetDocId) {
      return;
    }

    const execIdToStop = runningExecIdRef.current || undefined;
    const currentRunningDocId = runningDocIdRef.current;

    currentRunIdRef.current++;
    setIsRunning(false);
    setRunningDocId(null);
    runningDocIdRef.current = null;
    runningExecIdRef.current = null;

    if (currentRunningDocId) {
      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id === currentRunningDocId) {
            return {
              ...d,
              outputResult: {
                stdout: d.outputResult?.stdout || '',
                stderr: '',
                exitCode: null,
                isStopped: true,
                durationMs: 0
              }
            };
          }
          return d;
        })
      );
    }

    await ExecutionService.stopExecution(execIdToStop);
  };

  const handleToggleFullscreen = async () => {
    if (window.electronAPI?.toggleFullscreen) {
      const newStatus = await window.electronAPI.toggleFullscreen();
      setIsFullscreen(newStatus);
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
          setIsFullscreen(false);
        }
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Intercept window close from Electron (Section 15: Check ALL dirty documents)
  useEffect(() => {
    if (!window.electronAPI?.onCloseRequested) return;

    const unsubscribe = window.electronAPI.onCloseRequested(async () => {
      const dirtyDocs = documents.filter((d) => d.isDirty);

      if (dirtyDocs.length === 0) {
        window.electronAPI?.forceClose();
        return;
      }

      if (dirtyDocs.length === 1) {
        const doc = dirtyDocs[0];
        let choice: 'save' | 'dontsave' | 'cancel' = 'cancel';
        if (window.electronAPI?.confirmUnsaved) {
          choice = await window.electronAPI.confirmUnsaved(doc.fileName);
        }
        if (choice === 'cancel') return;
        if (choice === 'save') {
          const saved = await handleSaveDoc(doc);
          if (!saved) return;
        }
        window.electronAPI?.forceClose();
        return;
      }

      // Multiple dirty documents
      if (window.electronAPI?.confirmMultipleUnsaved) {
        const choice = await window.electronAPI.confirmMultipleUnsaved(
          dirtyDocs.map((d) => d.fileName)
        );
        if (choice === 'cancel') return;
        if (choice === 'saveall') {
          for (const d of dirtyDocs) {
            const saved = await handleSaveDoc(d);
            if (!saved) return;
          }
        }
        window.electronAPI?.forceClose();
      } else {
        // Sequential confirmation fallback
        for (const d of dirtyDocs) {
          let choice: 'save' | 'dontsave' | 'cancel' = 'cancel';
          if (window.electronAPI?.confirmUnsaved) {
            choice = await window.electronAPI.confirmUnsaved(d.fileName);
          }
          if (choice === 'cancel') return;
          if (choice === 'save') {
            const saved = await handleSaveDoc(d);
            if (!saved) return;
          }
        }
        window.electronAPI?.forceClose();
      }
    });

    return () => unsubscribe();
  }, [documents]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter -> Run Active Tab
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey && !e.altKey) {
        if (isSettingsOpen || newFileDialog.isOpen || newFolderDialog.isOpen || renameDialog.isOpen || deleteDialog.isOpen || isNewDocModalOpen) {
          return;
        }
        e.preventDefault();
        handleRunRef.current?.();
        return;
      }

      // Ctrl+S -> Save Active Tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (isElectronAvailable()) {
          handleSaveActive();
        }
      }
      // Ctrl+Shift+S -> Save As
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (isElectronAvailable()) {
          handleSaveAs();
        }
      }
      // Ctrl+Alt+S or Ctrl+Shift+Alt+S -> Save All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && e.altKey) {
        e.preventDefault();
        if (isElectronAvailable()) {
          handleSaveAll();
        }
      }
      // Check active chord first (BUG-06: Ctrl+K Ctrl+O)
      if (pendingChordRef.current === 'ctrl-k') {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          pendingChordRef.current = null;
          clearTimeout(chordTimerRef.current);
          if (isElectronAvailable()) {
            handleOpenWorkspace();
          }
          return;
        } else if (e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Shift' && e.key !== 'Alt') {
          // Any other substantive key cancels the chord
          pendingChordRef.current = null;
          clearTimeout(chordTimerRef.current);
        }
      }

      // Chord start: Ctrl+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        pendingChordRef.current = 'ctrl-k';
        clearTimeout(chordTimerRef.current);
        chordTimerRef.current = setTimeout(() => {
          pendingChordRef.current = null;
        }, 1000);
        return;
      }

      // Ctrl+Shift+O -> Deprecated in favor of Ctrl+K Ctrl+O chord (BUG-06)

      // Ctrl+O -> Open File (regular single file)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (isElectronAvailable()) {
          handleOpenFile();
        }
        return;
      }
      // Ctrl+W -> Close active tab (BUG-05)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeDocId) {
          handleCloseTab(activeDocId);
        }
        return;
      }
      // Ctrl+= / Ctrl++ -> Zoom In (BUG-04)
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') && !e.altKey) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      // Ctrl+- / Ctrl+_ -> Zoom Out (BUG-04)
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') && !e.altKey) {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      // Ctrl+0 -> Reset Zoom (BUG-04)
      if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleZoomReset();
        return;
      }
      // Ctrl+H -> Monaco Replace (BUG-07)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        codeEditorRef.current?.openReplace();
        return;
      }
      // Ctrl+F -> Monaco Find
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        codeEditorRef.current?.openFind();
        return;
      }
      // Ctrl+B -> Toggle Workspace Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIsSidebarVisible((prev) => !prev);
      }
      // Ctrl+N -> New File
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewFile();
      }
      // Esc -> Exit fullscreen / close settings
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (isFullscreen) {
          if (window.electronAPI?.toggleFullscreen) {
            window.electronAPI.toggleFullscreen().then(setIsFullscreen);
          } else if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
            setIsFullscreen(false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [documents, activeDocId, isSettingsOpen, isFullscreen, handleZoomIn, handleZoomOut, handleZoomReset]);

  return (
    <div className="app-container">
      {/* Top Toolbar */}
      <Toolbar
        selectedLanguage={activeDoc.language}
        onLanguageChange={handleLanguageChange}
        isRunning={isRunning}
        onRun={handleRun}
        onStop={() => handleStop()}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onOpenSettings={() => setIsSettingsOpen(true)}
        documents={documents}
        activeDocumentId={activeDoc.id}
        onSelectTab={(docId) => setActiveDocId(docId)}
        onCloseTab={handleCloseTab}
        onNewFile={handleNewFile}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveActive}
        onSaveFileAs={handleSaveAs}
        onSaveAll={handleSaveAll}
        recentFiles={recentFiles}
        onOpenRecentFile={handleOpenRecentFile}
        hasWorkspace={Boolean(workspace)}
        onOpenFolder={handleOpenWorkspace}
        onCloseWorkspace={handleCloseWorkspace}
        isSidebarVisible={isSidebarVisible}
        onToggleSidebar={() => setIsSidebarVisible((prev) => !prev)}
      />

      {/* Main Content Layout with Workspace Sidebar */}
      <div className="main-content-layout">
        {isSidebarVisible && (
          <>
            <FileTree
              workspace={workspace}
              activeFilePath={activeDoc.filePath}
              onOpenFile={handleOpenFileFromTree}
              onNewFile={(folderRelPath) =>
                setNewFileDialog({
                  isOpen: true,
                  folderRelPath: folderRelPath || '',
                  fileName: ''
                })
              }
              onNewFolder={(folderRelPath) =>
                setNewFolderDialog({
                  isOpen: true,
                  folderRelPath: folderRelPath || '',
                  folderName: ''
                })
              }
              onDelete={handleRequestDelete}
              onRename={handleRequestRename}
              onRefresh={handleRefreshWorkspace}
              onCloseWorkspace={handleCloseWorkspace}
              onOpenWorkspace={handleOpenWorkspace}
              onToggleCollapse={() => setIsSidebarVisible(false)}
              width={sidebarWidth}
            />
            <div
              className={`sidebar-drag-bar ${isDraggingSidebar ? 'dragging' : ''}`}
              onPointerDown={handleSidebarDragStart}
              onPointerMove={handleSidebarDragMove}
              onPointerUp={handleSidebarDragEnd}
              onPointerCancel={handleSidebarDragEnd}
              title="Drag to resize Explorer"
            />
          </>
        )}

        {/* Main Workspace Layout */}
        <ResizableLayout
          defaultSplit={72}
          left={
            <CodeEditor
              ref={codeEditorRef}
              activeDocId={activeDoc.id}
              code={activeDoc.code}
              language={activeLangConfig.monacoLanguage}
              theme={theme}
              editorSettings={editorSettings}
              navTarget={navTarget}
              workspaceFolder={workspace?.rootPath || null}
              onChange={handleCodeChange}
              onRun={handleRun}
              onSave={handleSaveActive}
              onSaveAs={handleSaveAs}
              onSaveAll={handleSaveAll}
              onOpen={handleOpenFile}
              onNew={handleNewFile}
              onCloseTab={() => handleCloseTabRef.current?.(activeDocIdRef.current)}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
              onOpenWorkspace={() => handleOpenWorkspaceRef.current?.()}
              openDocIds={documents.map((d) => d.id)}
            />
          }
          right={
            <ConsolePanel
              input={activeDoc.input}
              onInputChange={handleInputChange}
              outputResult={activeDoc.outputResult || null}
              isRunning={isRunning && activeDoc.id === runningDocId}
              onClearOutput={() =>
                setDocuments((prev) =>
                  prev.map((d) => (d.id === activeDoc.id ? { ...d, outputResult: null } : d))
                )
              }
              onNavigateToLine={handleNavigateToError}
              onRun={handleRun}
            />
          }
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        timeoutSeconds={timeoutSeconds}
        onTimeoutChange={setTimeoutSeconds}
        compilerStatuses={compilerStatuses}
        onRefreshCompilers={refreshCompilers}
        isCheckingCompilers={isCheckingCompilers}
        editorSettings={editorSettings}
        onUpdateEditorSettings={handleUpdateEditorSettings}
      />

      {/* New File Dialog (Language & Filename selection) */}
      <NewFileDialog
        isOpen={isNewDocModalOpen}
        onClose={() => setIsNewDocModalOpen(false)}
        onCreate={handleCreateNewDocument}
        initialLanguage={activeDoc.language}
        existingDocs={documents}
      />

      {/* New File in Workspace Modal */}
      {newFileDialog.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-file-dialog-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewFileDialog({ isOpen: false, folderRelPath: '', fileName: '' });
          }}
        >
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '20px 24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: 'var(--shadow-md)'
          }}>
            <h3
              id="new-file-dialog-title"
              style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-bright)' }}
            >
              New File in Workspace
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Location: <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
                {newFileDialog.folderRelPath ? `${newFileDialog.folderRelPath}/` : '(root)'}
              </span>
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Solution.java, script.py, main.cpp"
              value={newFileDialog.fileName}
              onChange={(e) => setNewFileDialog((prev) => ({ ...prev, fileName: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFileInWorkspace(newFileDialog.folderRelPath, newFileDialog.fileName);
                if (e.key === 'Escape') setNewFileDialog({ isOpen: false, folderRelPath: '', fileName: '' });
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input-field)',
                color: 'var(--text-bright)',
                fontSize: '0.85rem',
                marginBottom: '16px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setNewFileDialog({ isOpen: false, folderRelPath: '', fileName: '' })}
                style={{
                  padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-main)', fontSize: '0.825rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateFileInWorkspace(newFileDialog.folderRelPath, newFileDialog.fileName)}
                style={{
                  padding: '6px 16px', borderRadius: '4px', cursor: 'pointer',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#14120F', fontWeight: 600, fontSize: '0.825rem'
                }}
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder in Workspace Modal */}
      {newFolderDialog.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-folder-dialog-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewFolderDialog({ isOpen: false, folderRelPath: '', folderName: '' });
          }}
        >
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '20px 24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: 'var(--shadow-md)'
          }}>
            <h3
              id="new-folder-dialog-title"
              style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-bright)' }}
            >
              New Folder in Workspace
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Location: <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
                {newFolderDialog.folderRelPath ? `${newFolderDialog.folderRelPath}/` : '(root)'}
              </span>
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. utils, tests, src"
              value={newFolderDialog.folderName}
              onChange={(e) => setNewFolderDialog((prev) => ({ ...prev, folderName: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolderInWorkspace(newFolderDialog.folderRelPath, newFolderDialog.folderName);
                if (e.key === 'Escape') setNewFolderDialog({ isOpen: false, folderRelPath: '', folderName: '' });
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input-field)',
                color: 'var(--text-bright)',
                fontSize: '0.85rem',
                marginBottom: '16px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setNewFolderDialog({ isOpen: false, folderRelPath: '', folderName: '' })}
                style={{
                  padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-main)', fontSize: '0.825rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateFolderInWorkspace(newFolderDialog.folderRelPath, newFolderDialog.folderName)}
                style={{
                  padding: '6px 16px', borderRadius: '4px', cursor: 'pointer',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#14120F', fontWeight: 600, fontSize: '0.825rem'
                }}
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Change Confirmation Dialog */}
      {pendingLangChange && (() => {
        const newCfg = LANGUAGE_CONFIGS[pendingLangChange.newLangId];
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lang-change-dialog-title"
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)'
            }}
            onClick={(e) => { if (e.target === e.currentTarget) handleCancelLangChange(); }}
          >
            <div style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '24px 28px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: 'var(--shadow-md)'
            }}>
              <h2
                id="lang-change-dialog-title"
                style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600,
                         color: 'var(--text-bright)' }}
              >
                Change Language to {newCfg?.name}?
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: '0.825rem',
                          color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Your current code will be replaced with the default{' '}
                <strong style={{ color: 'var(--text-bright)' }}>{newCfg?.name}</strong>{' '}
                template. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  id="lang-change-cancel-btn"
                  onClick={handleCancelLangChange}
                  style={{
                    padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--text-main)', fontSize: '0.825rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  id="lang-change-confirm-btn"
                  onClick={handleConfirmLangChange}
                  style={{
                    padding: '6px 16px', borderRadius: '4px', cursor: 'pointer',
                    border: 'none',
                    background: 'var(--color-primary)',
                    color: '#14120F', fontWeight: 600, fontSize: '0.825rem'
                  }}
                >
                  Change Language
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal (BUG-10) */}
      {deleteDialog.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteDialog((prev) => ({ ...prev, isOpen: false }));
          }}
        >
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '20px 24px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: 'var(--shadow-md)'
          }}>
            <h3
              id="delete-dialog-title"
              style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-bright)' }}
            >
              Delete {deleteDialog.isDirectory ? 'Folder' : 'File'}
            </h3>

            {deleteDialog.hasDirtyDocs ? (
              <>
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#ff6b6b', fontWeight: 500 }}>
                  Warning: The following document(s) have unsaved changes:
                </p>
                <ul style={{ margin: '0 0 12px 18px', padding: 0, fontSize: '0.825rem', color: 'var(--text-bright)' }}>
                  {deleteDialog.dirtyFileNames.map((fn, idx) => (
                    <li key={idx}>{fn}</li>
                  ))}
                </ul>
                <p style={{ margin: '0 0 16px', fontSize: '0.825rem', color: 'var(--text-dim)' }}>
                  Permanently delete {deleteDialog.isDirectory ? 'this folder and all its contents' : `"${deleteDialog.name}"`}? Unsaved changes will be lost.
                </p>
              </>
            ) : (
              <p style={{ margin: '0 0 18px', fontSize: '0.875rem', color: 'var(--text-main)' }}>
                {deleteDialog.isDirectory
                  ? `Delete "${deleteDialog.name}" and all its contents?`
                  : `Delete "${deleteDialog.name}"?`}
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                id="btn-delete-cancel"
                onClick={() => setDeleteDialog((prev) => ({ ...prev, isOpen: false }))}
                style={{
                  padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-main)', fontSize: '0.825rem'
                }}
              >
                Cancel
              </button>
              <button
                id="btn-delete-confirm"
                onClick={handleConfirmDelete}
                style={{
                  padding: '6px 16px', borderRadius: '4px', cursor: 'pointer',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff', fontWeight: 600, fontSize: '0.825rem'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal (BUG-10) */}
      {renameDialog.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-dialog-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setRenameDialog((prev) => ({ ...prev, isOpen: false }));
          }}
        >
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '20px 24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: 'var(--shadow-md)'
          }}>
            <h3
              id="rename-dialog-title"
              style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 600, color: 'var(--text-bright)' }}
            >
              Rename {renameDialog.isDirectory ? 'Folder' : 'File'}
            </h3>
            <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Current: <span style={{ color: 'var(--text-bright)', fontWeight: 500 }}>{renameDialog.oldName}</span>
            </p>
            <input
              id="rename-dialog-input"
              type="text"
              autoFocus
              value={renameDialog.newName}
              onChange={(e) => setRenameDialog((prev) => ({ ...prev, newName: e.target.value, error: undefined }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
                if (e.key === 'Escape') setRenameDialog((prev) => ({ ...prev, isOpen: false }));
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input-field)',
                color: 'var(--text-bright)',
                fontSize: '0.85rem',
                marginBottom: renameDialog.error ? '8px' : '16px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            {renameDialog.error && (
              <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#ff6b6b' }}>
                {renameDialog.error}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                id="btn-rename-cancel"
                onClick={() => setRenameDialog((prev) => ({ ...prev, isOpen: false }))}
                style={{
                  padding: '6px 14px', borderRadius: '4px', cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-main)', fontSize: '0.825rem'
                }}
              >
                Cancel
              </button>
              <button
                id="btn-rename-confirm"
                onClick={handleConfirmRename}
                style={{
                  padding: '6px 16px', borderRadius: '4px', cursor: 'pointer',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#14120F', fontWeight: 600, fontSize: '0.825rem'
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
