import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { executeCode, stopCurrentExecution } from './runner';
import { detectAllCompilers } from './toolDetector';
import { startDevServer } from './devServer';
import {
  handleOpenFile,
  handleSaveFile,
  handleSaveFileAs,
  handleReadSpecificFile,
  showUnsavedConfirmation,
  showMultipleUnsavedConfirmation,
  initFileManager,
  handleOpenWorkspace,
  handleGetWorkspaceTree,
  handleCreateWorkspaceFile,
  handleCreateWorkspaceFolder,
  handleCloseWorkspace,
  handleDeleteWorkspaceItem,
  handleRenameWorkspaceItem
} from './fileManager';

let mainWindow: BrowserWindow | null = null;
let isForceQuitting = false;
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: 'CODEN — Your Code. Your Machine.',
    icon: path.join(__dirname, '../build/icon.ico'),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.removeMenu();

  const devUrl = 'http://127.0.0.1:5173';

  console.log(`[Main] Preload path: ${path.join(__dirname, 'preload.js')}`);

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] WebContents finished loading');
  });

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[Main] Failed loading ${validatedURL}: ${errorCode} ${errorDescription}`);
    if (validatedURL.includes('5173')) {
      console.log('[Main] Falling back to dist/index.html after failure');
      mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  });

  if (app.isPackaged || process.argv.includes('--prod')) {
    console.log('[Main] Packaged or prod application detected, loading dist/index.html');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else if (isDev) {
    console.log(`[Main] Loading dev server URL: ${devUrl}`);
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadURL(devUrl).catch(() => {
      mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  }

  // Intercept window close to check for unsaved changes
  mainWindow.on('close', (e) => {
    if (!isForceQuitting && mainWindow) {
      e.preventDefault();
      // Ask renderer if document is dirty
      mainWindow.webContents.send('app:request-close');
    }
  });

  mainWindow.on('closed', () => {
    stopCurrentExecution();
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  initFileManager();

  // Setup IPC Handlers
  ipcMain.handle('compiler:run', async (_, { languageId, code, input, timeoutSeconds, executionId, fileName }) => {
    console.log(`[IPC] compiler:run invoked for ${languageId}, timeout=${timeoutSeconds}s, executionId=${executionId}, fileName=${fileName}`);
    try {
      const res = await executeCode(languageId, code, input, timeoutSeconds || 10, executionId, fileName);
      console.log(`[IPC] compiler:run finished: exitCode=${res.exitCode}, stdoutLen=${res.stdout.length}`);
      return res;
    } catch (err: any) {
      console.error('[IPC] compiler:run error:', err);
      return {
        stdout: '',
        stderr: err?.message || 'Unknown internal execution error',
        exitCode: 1,
        durationMs: 0
      };
    }
  });

  ipcMain.handle('compiler:stop', async (_, args?: { executionId?: string } | string) => {
    const targetId = typeof args === 'string' ? args : args?.executionId;
    return await stopCurrentExecution(targetId);
  });

  ipcMain.handle('compiler:check-compilers', async () => {
    return await detectAllCompilers();
  });

  ipcMain.handle('file:open', async () => {
    if (!mainWindow) return null;
    return await handleOpenFile(mainWindow);
  });

  ipcMain.handle('file:read-path', async (_, filePath: string) => {
    return await handleReadSpecificFile(filePath);
  });

  ipcMain.handle('file:save', async (_, { filePath, content, defaultExtension, defaultName }) => {
    if (!mainWindow) return null;
    return await handleSaveFile(mainWindow, filePath, content, defaultExtension, defaultName);
  });

  ipcMain.handle('file:save-as', async (_, { content, defaultExtension, defaultName }) => {
    if (!mainWindow) return null;
    return await handleSaveFileAs(mainWindow, content, defaultExtension, defaultName);
  });

  let testConfirmChoice: 'save' | 'dontsave' | 'cancel' | null = null;
  ipcMain.handle('test:set-confirm-choice', (_, choice) => {
    testConfirmChoice = choice;
    return true;
  });

  ipcMain.handle('file:confirm-unsaved', async (_, fileName: string) => {
    if (testConfirmChoice) {
      return testConfirmChoice;
    }
    if (process.env.CODEN_TEST_CONFIRM) {
      return process.env.CODEN_TEST_CONFIRM as 'save' | 'dontsave' | 'cancel';
    }
    if (!mainWindow) return 'cancel';
    return await showUnsavedConfirmation(mainWindow, fileName);
  });

  ipcMain.handle('file:confirm-multiple-unsaved', async (_, fileNames: string[]) => {
    if (!mainWindow) return 'cancel';
    return await showMultipleUnsavedConfirmation(mainWindow, fileNames);
  });

  ipcMain.handle('workspace:open', async () => {
    if (!mainWindow) return null;
    return await handleOpenWorkspace(mainWindow);
  });

  ipcMain.handle('workspace:get-tree', async (_, targetPath?: string) => {
    return handleGetWorkspaceTree(targetPath);
  });

  ipcMain.handle('workspace:create-file', async (_, { relativePath, content }) => {
    return await handleCreateWorkspaceFile(relativePath, content);
  });

  ipcMain.handle('workspace:create-folder', async (_, { relativePath }) => {
    return await handleCreateWorkspaceFolder(relativePath);
  });

  ipcMain.handle('workspace:close', async () => {
    return handleCloseWorkspace();
  });

  ipcMain.handle('workspace:delete-item', async (_, { relativePath, isDirectory }) => {
    return await handleDeleteWorkspaceItem(relativePath, isDirectory);
  });

  ipcMain.handle('workspace:rename-item', async (_, { oldRelativePath, newName, isDirectory }) => {
    return await handleRenameWorkspaceItem(oldRelativePath, newName, isDirectory);
  });

  ipcMain.handle('app:force-close', () => {
    isForceQuitting = true;
    if (mainWindow) {
      mainWindow.close();
    }
  });

  ipcMain.handle('window:toggle-fullscreen', async () => {
    if (!mainWindow) return false;
    const isFull = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFull);
    return !isFull;
  });

  ipcMain.handle('window:is-fullscreen', async () => {
    if (!mainWindow) return false;
    return mainWindow.isFullScreen();
  });

  createWindow();

  if (isDev) {
    startDevServer().catch((e) => {
      console.log('[Main] Dev server start notice (may already be running):', e.message);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopCurrentExecution();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
