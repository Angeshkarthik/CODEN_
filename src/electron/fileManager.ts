import { dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { WorkspaceFileNode } from './types';

// Authoritative in-memory registry of paths authorized for read access
const authorizedPaths = new Set<string>();

// Active canonical workspace root
let currentWorkspaceRoot: string | null = null;

export function getWorkspaceRoot(): string | null {
  return currentWorkspaceRoot;
}

function getRecentStorePath(): string {
  if (!app || typeof app.getPath !== 'function') return '';
  return path.join(app.getPath('userData'), 'recent_opened.json');
}

export function initFileManager(): void {
  try {
    const storePath = getRecentStorePath();
    if (!storePath) return;
    if (fs.existsSync(storePath)) {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach((p) => {
          if (typeof p === 'string') {
            authorizedPaths.add(path.normalize(p));
          }
        });
      }
    }
  } catch (err) {
    console.error('[FileManager] Failed loading recent files registry:', err);
  }
}

export function persistAuthorizedPath(filePath: string): void {
  try {
    const normalized = path.normalize(filePath);
    authorizedPaths.add(normalized);
    const storePath = getRecentStorePath();
    if (!storePath) return;
    // Keep up to 20 most recent paths
    const list = Array.from(authorizedPaths).slice(-20);
    fs.writeFileSync(storePath, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[FileManager] Failed persisting authorized path:', err);
  }
}

/**
 * Strict path containment validation.
 * Verifies that child path resides inside parent path without escaping.
 * Handles platform differences (Windows case-insensitivity & separators).
 */
export function isSubpath(parent: string, child: string): boolean {
  if (!parent || !child) return false;
  const normParent = path.resolve(parent);
  const normChild = path.resolve(child);
  const isWindows = process.platform === 'win32';
  const p = isWindows ? normParent.toLowerCase() : normParent;
  const c = isWindows ? normChild.toLowerCase() : normChild;
  const rel = path.relative(p, c);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  '.next',
  '.turbo',
  '.idea',
  '.vscode',
  '__pycache__',
  '.DS_Store'
]);

/**
 * Recursively read directory entries for the workspace tree
 */
export function readWorkspaceTree(
  dirPath: string,
  rootPath: string = dirPath,
  maxDepth = 50,
  currentDepth = 0
): WorkspaceFileNode[] {
  if (currentDepth > maxDepth) return [];
  if (!fs.existsSync(dirPath)) return [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: WorkspaceFileNode[] = [];

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      // Canonicalize and verify containment
      if (!isSubpath(rootPath, fullPath)) continue;

      const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const children = readWorkspaceTree(fullPath, rootPath, maxDepth, currentDepth + 1);
        nodes.push({
          name: entry.name,
          path: fullPath,
          relativePath: relPath,
          isDirectory: true,
          children
        });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        nodes.push({
          name: entry.name,
          path: fullPath,
          relativePath: relPath,
          isDirectory: false,
          extension: ext
        });
      }
    }

    // Sort: directories first (alphabetical), then files (alphabetical)
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return nodes;
  } catch (err) {
    console.error(`[FileManager] Error reading directory ${dirPath}:`, err);
    return [];
  }
}

export async function handleOpenFile(win: BrowserWindow) {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Source Files',
          extensions: ['java', 'c', 'cpp', 'py', 'js', 'txt']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    // Authorize path in main process
    persistAuthorizedPath(filePath);
    return { filePath, content };
  } catch (err: any) {
    return { error: err?.message || 'Failed to open file.' };
  }
}

export async function handleSaveFile(
  win: BrowserWindow,
  filePath: string | null,
  content: string,
  defaultExtension: string = '.txt',
  defaultName: string = 'Main'
) {
  try {
    let targetPath = filePath;

    if (!targetPath) {
      const extWithoutDot = defaultExtension.replace('.', '');
      const result = await dialog.showSaveDialog(win, {
        defaultPath: `${defaultName}${defaultExtension}`,
        filters: [
          { name: 'Source Code', extensions: [extWithoutDot] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      targetPath = result.filePath;
    }

    fs.writeFileSync(targetPath, content, 'utf8');
    persistAuthorizedPath(targetPath);
    return { filePath: targetPath, success: true };
  } catch (err: any) {
    return { error: err?.message || 'Failed to save file.' };
  }
}

export async function handleSaveFileAs(
  win: BrowserWindow,
  content: string,
  defaultExtension: string = '.txt',
  defaultName: string = 'Main'
) {
  try {
    const extWithoutDot = defaultExtension.replace('.', '');
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `${defaultName}${defaultExtension}`,
      filters: [
        { name: 'Source File', extensions: [extWithoutDot] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(result.filePath, content, 'utf8');
    persistAuthorizedPath(result.filePath);
    return { filePath: result.filePath, success: true };
  } catch (err: any) {
    return { error: err?.message || 'Failed to save file as.' };
  }
}

export async function handleOpenWorkspace(win: BrowserWindow) {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const rawPath = result.filePaths[0];
    const canonicalRoot = path.resolve(rawPath);
    currentWorkspaceRoot = canonicalRoot;

    persistAuthorizedPath(canonicalRoot);

    const folderName = path.basename(canonicalRoot) || canonicalRoot;
    const tree = readWorkspaceTree(canonicalRoot, canonicalRoot);

    return {
      rootPath: canonicalRoot,
      name: folderName,
      tree
    };
  } catch (err: any) {
    return { error: err?.message || 'Failed to open workspace.' };
  }
}

export function handleGetWorkspaceTree(targetPath?: string) {
  try {
    const root = targetPath ? path.resolve(targetPath) : currentWorkspaceRoot;
    if (!root || !fs.existsSync(root)) {
      return { error: 'Workspace path does not exist.' };
    }
    currentWorkspaceRoot = root;
    const folderName = path.basename(root) || root;
    const tree = readWorkspaceTree(root, root);
    return {
      rootPath: root,
      name: folderName,
      tree
    };
  } catch (err: any) {
    return { error: err?.message || 'Failed to get workspace tree.' };
  }
}

export function handleCloseWorkspace() {
  currentWorkspaceRoot = null;
  return true;
}

export async function handleCreateWorkspaceFile(relativePath: string, content: string = '') {
  try {
    if (!currentWorkspaceRoot) {
      return { error: 'No workspace is currently open.' };
    }

    if (!relativePath || typeof relativePath !== 'string') {
      return { error: 'Invalid file name or path.' };
    }

    const trimmed = relativePath.trim();
    if (!trimmed) {
      return { error: 'File name cannot be empty.' };
    }

    const targetPath = path.resolve(currentWorkspaceRoot, trimmed);

    // SECURITY CHECK: Target must be strictly inside workspace root
    if (!isSubpath(currentWorkspaceRoot, targetPath)) {
      return { error: 'Access denied: Target path escapes workspace root.' };
    }

    const fileName = path.basename(targetPath);
    if (/[<>:"/\\|?*]/.test(fileName)) {
      return { error: 'File name contains invalid characters.' };
    }

    if (fs.existsSync(targetPath)) {
      return { error: `File '${fileName}' already exists.` };
    }

    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(targetPath, content, 'utf8');
    persistAuthorizedPath(targetPath);

    return {
      success: true,
      filePath: targetPath
    };
  } catch (err: any) {
    return { error: err?.message || 'Failed to create file.' };
  }
}

export async function handleCreateWorkspaceFolder(relativePath: string) {
  try {
    if (!currentWorkspaceRoot) {
      return { error: 'No workspace is currently open.' };
    }

    if (!relativePath || typeof relativePath !== 'string') {
      return { error: 'Invalid folder name or path.' };
    }

    const trimmed = relativePath.trim();
    if (!trimmed) {
      return { error: 'Folder name cannot be empty.' };
    }

    const targetPath = path.resolve(currentWorkspaceRoot, trimmed);

    // SECURITY CHECK: Target must be strictly inside workspace root
    if (!isSubpath(currentWorkspaceRoot, targetPath)) {
      return { error: 'Access denied: Target path escapes workspace root.' };
    }

    const folderName = path.basename(targetPath);
    if (/[<>:"/\\|?*]/.test(folderName)) {
      return { error: 'Folder name contains invalid characters.' };
    }

    if (fs.existsSync(targetPath)) {
      return { error: `Folder '${folderName}' already exists.` };
    }

    fs.mkdirSync(targetPath, { recursive: true });
    return { success: true, folderPath: targetPath };
  } catch (err: any) {
    return { error: err?.message || 'Failed to create folder.' };
  }
}

export async function handleReadSpecificFile(filePath: string) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { error: 'Invalid file path.' };
    }

    const normalized = path.normalize(filePath);
    const isInsideWorkspace = currentWorkspaceRoot && isSubpath(currentWorkspaceRoot, normalized);

    // SECURITY CHECK: Verify filePath was previously authorized via Open / Save dialogs OR inside current workspace
    if (!authorizedPaths.has(normalized) && !isInsideWorkspace) {
      console.warn(`[Security] Blocked unauthorized file read attempt: ${filePath}`);
      return { error: 'Access denied: Path is not authorized in recent documents.' };
    }

    if (!fs.existsSync(normalized)) {
      return { error: 'File does not exist.' };
    }

    const content = fs.readFileSync(normalized, 'utf8');
    if (isInsideWorkspace) {
      persistAuthorizedPath(normalized);
    }
    return { filePath: normalized, content };
  } catch (err: any) {
    return { error: err?.message || 'Could not read file.' };
  }
}

export async function showUnsavedConfirmation(win: BrowserWindow, fileName: string) {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: `Save changes to ${fileName}?`,
    detail: 'Your changes will be lost if you don’t save them.'
  });

  // 0 = Save, 1 = Don't Save, 2 = Cancel
  const responses = ['save', 'dontsave', 'cancel'] as const;
  return responses[result.response];
}

export async function showMultipleUnsavedConfirmation(win: BrowserWindow, fileNames: string[]) {
  const fileList = fileNames.map((fn) => ` • ${fn}`).join('\n');
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save All', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'Save changes to the following documents?',
    detail: `${fileList}\n\nYour changes will be lost if you don’t save them.`
  });

  // 0 = Save All, 1 = Don't Save, 2 = Cancel
  const responses = ['saveall', 'dontsave', 'cancel'] as const;
  return responses[result.response];
}

export async function handleDeleteWorkspaceItem(relativePath: string, isDirectory: boolean) {
  try {
    if (!currentWorkspaceRoot) {
      return { error: 'No workspace is currently open.' };
    }

    if (!relativePath || typeof relativePath !== 'string') {
      return { error: 'Invalid path.' };
    }

    const trimmed = relativePath.trim();
    if (!trimmed) {
      return { error: 'Path cannot be empty.' };
    }

    const targetPath = path.resolve(currentWorkspaceRoot, trimmed);

    // SECURITY CHECK 1: Target must reside strictly inside workspace root
    if (!isSubpath(currentWorkspaceRoot, targetPath)) {
      return { error: 'Access denied: Target path escapes workspace root.' };
    }

    // SECURITY CHECK 2: Cannot delete the workspace root itself
    const normRoot = path.resolve(currentWorkspaceRoot).toLowerCase();
    const normTarget = path.resolve(targetPath).toLowerCase();
    if (normRoot === normTarget) {
      return { error: 'Access denied: Cannot delete workspace root.' };
    }

    if (!fs.existsSync(targetPath)) {
      return { error: 'Item does not exist on disk.' };
    }

    const stat = fs.statSync(targetPath);
    if (isDirectory || stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }

    return { success: true, targetPath };
  } catch (err: any) {
    return { error: err?.message || 'Failed to delete item.' };
  }
}

export async function handleRenameWorkspaceItem(oldRelativePath: string, newName: string, isDirectory: boolean) {
  try {
    if (!currentWorkspaceRoot) {
      return { error: 'No workspace is currently open.' };
    }

    if (!oldRelativePath || typeof oldRelativePath !== 'string') {
      return { error: 'Invalid source path.' };
    }

    const trimmedOld = oldRelativePath.trim();
    if (!trimmedOld) {
      return { error: 'Source path cannot be empty.' };
    }

    const oldPath = path.resolve(currentWorkspaceRoot, trimmedOld);

    // SECURITY CHECK 1: Source must be inside workspace root
    if (!isSubpath(currentWorkspaceRoot, oldPath)) {
      return { error: 'Access denied: Source path escapes workspace root.' };
    }

    // SECURITY CHECK 2: Cannot rename workspace root itself
    const normRoot = path.resolve(currentWorkspaceRoot).toLowerCase();
    const normOld = path.resolve(oldPath).toLowerCase();
    if (normRoot === normOld) {
      return { error: 'Access denied: Cannot rename workspace root.' };
    }

    if (!fs.existsSync(oldPath)) {
      return { error: 'Source item does not exist on disk.' };
    }

    // Validate newName
    if (!newName || typeof newName !== 'string') {
      return { error: 'New name is required.' };
    }

    const trimmedNew = newName.trim();
    if (!trimmedNew) {
      return { error: 'New name cannot be empty.' };
    }

    // Must be a simple name, not a path
    if (trimmedNew.includes('/') || trimmedNew.includes('\\')) {
      return { error: 'New name cannot contain path separators.' };
    }

    if (/[<>:"/\\|?*]/.test(trimmedNew)) {
      return { error: 'New name contains invalid characters.' };
    }

    const parentDir = path.dirname(oldPath);
    const newPath = path.resolve(parentDir, trimmedNew);

    // SECURITY CHECK 3: Destination must be inside workspace root
    if (!isSubpath(currentWorkspaceRoot, newPath)) {
      return { error: 'Access denied: Destination path escapes workspace root.' };
    }

    // Check if new name is identical to old name
    if (path.resolve(oldPath).toLowerCase() === path.resolve(newPath).toLowerCase() && path.basename(oldPath) === trimmedNew) {
      return { error: 'New name is identical to current name.' };
    }

    // Check collision with another item in parentDir (allowing case-only rename on Windows)
    if (fs.existsSync(newPath) && path.resolve(oldPath).toLowerCase() !== path.resolve(newPath).toLowerCase()) {
      return { error: `An item named '${trimmedNew}' already exists.` };
    }

    fs.renameSync(oldPath, newPath);

    return {
      success: true,
      oldPath,
      newPath,
      newRelativePath: path.relative(currentWorkspaceRoot, newPath).replace(/\\/g, '/')
    };
  } catch (err: any) {
    return { error: err?.message || 'Failed to rename item.' };
  }
}

