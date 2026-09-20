import { contextBridge, ipcRenderer } from 'electron';
import { ExecutionResult, CompilerStatus } from './types';

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    runCode: (languageId: string, code: string, input: string, timeoutSeconds: number, executionId?: string, fileName?: string): Promise<ExecutionResult> =>
      ipcRenderer.invoke('compiler:run', { languageId, code, input, timeoutSeconds, executionId, fileName }),

    stopExecution: (executionId?: string): Promise<boolean> =>
      ipcRenderer.invoke('compiler:stop', { executionId }),

    checkCompilers: (): Promise<CompilerStatus[]> =>
      ipcRenderer.invoke('compiler:check-compilers'),

    openFile: () =>
      ipcRenderer.invoke('file:open'),

    readFile: (filePath: string) =>
      ipcRenderer.invoke('file:read-path', filePath),

    saveFile: (filePath: string | null, content: string, defaultExtension: string, defaultName: string) =>
      ipcRenderer.invoke('file:save', { filePath, content, defaultExtension, defaultName }),

    saveFileAs: (content: string, defaultExtension: string, defaultName: string) =>
      ipcRenderer.invoke('file:save-as', { content, defaultExtension, defaultName }),

    confirmUnsaved: (fileName: string): Promise<'save' | 'dontsave' | 'cancel'> =>
      ipcRenderer.invoke('file:confirm-unsaved', fileName),

    setTestConfirmChoice: (choice: 'save' | 'dontsave' | 'cancel' | null) =>
      ipcRenderer.invoke('test:set-confirm-choice', choice),

    confirmMultipleUnsaved: (fileNames: string[]): Promise<'saveall' | 'dontsave' | 'cancel'> =>
      ipcRenderer.invoke('file:confirm-multiple-unsaved', fileNames),

    forceClose: () =>
      ipcRenderer.invoke('app:force-close'),

    onCloseRequested: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('app:request-close', handler);
      return () => {
        ipcRenderer.removeListener('app:request-close', handler);
      };
    },

    toggleFullscreen: (): Promise<boolean> =>
      ipcRenderer.invoke('window:toggle-fullscreen'),

    isFullscreen: (): Promise<boolean> =>
      ipcRenderer.invoke('window:is-fullscreen'),

    openWorkspace: () =>
      ipcRenderer.invoke('workspace:open'),

    getWorkspaceTree: (targetPath?: string) =>
      ipcRenderer.invoke('workspace:get-tree', targetPath),

    createWorkspaceFile: (relativePath: string, content: string = '') =>
      ipcRenderer.invoke('workspace:create-file', { relativePath, content }),

    createWorkspaceFolder: (relativePath: string) =>
      ipcRenderer.invoke('workspace:create-folder', { relativePath }),

    closeWorkspace: () =>
      ipcRenderer.invoke('workspace:close'),

    deleteWorkspaceItem: (relativePath: string, isDirectory: boolean) =>
      ipcRenderer.invoke('workspace:delete-item', { relativePath, isDirectory }),

    renameWorkspaceItem: (oldRelativePath: string, newName: string, isDirectory: boolean) =>
      ipcRenderer.invoke('workspace:rename-item', { oldRelativePath, newName, isDirectory })
  });
  console.log('[Preload] electronAPI exposed successfully');
} catch (err) {
  console.error('[Preload] Failed to expose electronAPI:', err);
}
