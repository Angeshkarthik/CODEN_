/**
 * Centralized runtime capability detection for Offline Code Compiler.
 * Distinguishes between native Electron desktop runtime and localhost browser runtime.
 */

export const isElectronAvailable = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.runCode);
};

export const DESKTOP_APP_REQUIRED_MESSAGE = 'Available in the Electron desktop app';
export const OPEN_FOLDER_DESKTOP_MESSAGE = 'Open Folder is available in the Electron desktop app';
