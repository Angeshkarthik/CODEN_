import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  FileCode,
  FileText,
  Pencil,
  Trash2
} from 'lucide-react';
import { WorkspaceState, WorkspaceFileNode } from '../../electron/types';
import { isElectronAvailable, OPEN_FOLDER_DESKTOP_MESSAGE } from '../../services/capability';
import { FileTypeIcon } from './FileTypeIcon';

interface FileTreeProps {
  workspace: WorkspaceState | null;
  activeFilePath: string | null;
  onOpenFile: (filePath: string) => void;
  onNewFile: (folderRelPath?: string) => void;
  onNewFolder: (folderRelPath?: string) => void;
  onDelete?: (path: string, relativePath: string, isDirectory: boolean, name: string) => void;
  onRename?: (path: string, relativePath: string, isDirectory: boolean, name: string) => void;
  onRefresh: () => void;
  onCloseWorkspace: () => void;
  onOpenWorkspace: () => void;
  onToggleCollapse: () => void;
  width: number;
}

// Canonical path comparison helper
export const isSamePath = (p1: string | null, p2: string | null): boolean => {
  if (!p1 || !p2) return false;
  const n1 = p1.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const n2 = p2.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return n1 === n2;
};

// Recursive node lookup based on canonical path at any nesting depth
export const findNodeByPath = (nodes: WorkspaceFileNode[], targetPath: string): WorkspaceFileNode | null => {
  if (!nodes || !targetPath) return null;
  for (const node of nodes) {
    if (isSamePath(node.path, targetPath)) {
      return node;
    }
    if (node.isDirectory && node.children && node.children.length > 0) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

export const FileTree: React.FC<FileTreeProps> = ({
  workspace,
  activeFilePath,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onDelete,
  onRename,
  onRefresh,
  onCloseWorkspace,
  onOpenWorkspace,
  onToggleCollapse,
  width
}) => {
  const isElectron = isElectronAvailable();
  // Set of expanded folder paths (canonical relative or absolute)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');

  const getSelectedFolderRelPath = (): string => {
    if (!selectedFolderPath || !workspace) return '';
    const node = findNodeByPath(workspace.tree, selectedFolderPath);
    if (node && node.isDirectory) {
      return node.relativePath;
    }
    return '';
  };

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
    setSelectedFolderPath(folderPath);
  };

  const renderNode = (node: WorkspaceFileNode, level: number = 0) => {
    const isDir = node.isDirectory;
    const isExpanded = expandedFolders.has(node.path);
    const isActive = !isDir && isSamePath(node.path, activeFilePath);
    const isSelectedDir = isDir && node.path === selectedFolderPath;
    const paddingLeft = level * 14 + 12;

    if (isDir) {
      return (
        <div key={node.path} className="tree-node-dir-group">
          <div
            className={`tree-node-item tree-node-dir ${isSelectedDir ? 'selected' : ''}`}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={(e) => toggleFolder(node.path, e)}
            title={node.relativePath}
          >
            <span className="tree-icon-chevron">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="tree-icon-folder">
              {isExpanded ? <FolderOpen size={15} color="var(--color-primary)" /> : <Folder size={15} color="var(--color-primary)" />}
            </span>
            <span className="tree-node-name">{node.name}</span>
            <div className="tree-node-dir-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="tree-mini-btn"
                title={`New File in ${node.name}`}
                onClick={() => onNewFile(node.relativePath)}
              >
                <FilePlus size={12} />
              </button>
              <button
                className="tree-mini-btn"
                title={`New Folder in ${node.name}`}
                onClick={() => onNewFolder(node.relativePath)}
              >
                <FolderPlus size={12} />
              </button>
              {isElectron && onRename && (
                <button
                  className="tree-mini-btn"
                  title={`Rename ${node.name}`}
                  onClick={() => onRename(node.path, node.relativePath, true, node.name)}
                >
                  <Pencil size={11} />
                </button>
              )}
              {isElectron && onDelete && (
                <button
                  className="tree-mini-btn tree-mini-btn-delete"
                  title={`Delete ${node.name}`}
                  onClick={() => onDelete(node.path, node.relativePath, true, node.name)}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>

          {isExpanded && node.children && (
            <div className="tree-node-children">
              {node.children.length === 0 ? (
                <div
                  className="tree-node-empty"
                  style={{ paddingLeft: `${paddingLeft + 20}px` }}
                >
                  (empty)
                </div>
              ) : (
                node.children.map((child) => renderNode(child, level + 1))
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        className={`tree-node-item tree-node-file ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${paddingLeft + 14}px` }}
        onClick={() => onOpenFile(node.path)}
        title={node.relativePath}
      >
        <span className="tree-file-icon-wrap" style={{ marginRight: '6px', display: 'inline-flex', alignItems: 'center' }}>
          <FileTypeIcon filename={node.name} extension={node.extension} size={14} />
        </span>
        <span className="tree-node-name">{node.name}</span>
        {isElectron && (
          <div className="tree-node-file-actions" onClick={(e) => e.stopPropagation()}>
            {onRename && (
              <button
                className="tree-mini-btn"
                title={`Rename ${node.name}`}
                onClick={() => onRename(node.path, node.relativePath, false, node.name)}
              >
                <Pencil size={11} />
              </button>
            )}
            {onDelete && (
              <button
                className="tree-mini-btn tree-mini-btn-delete"
                title={`Delete ${node.name}`}
                onClick={() => onDelete(node.path, node.relativePath, false, node.name)}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="workspace-sidebar" style={{ width: `${width}px` }}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div
          className="sidebar-title-row"
          onClick={() => setSelectedFolderPath('')}
          title={workspace ? `Workspace: ${workspace.name} (click to select root)` : 'Explorer'}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Folder size={14} color="var(--color-primary)" />
            <span className="sidebar-header-label">
              {workspace ? workspace.name : 'Explorer'}
            </span>
          </div>
          <div className="sidebar-header-actions" onClick={(e) => e.stopPropagation()}>
            {workspace && (
              <>
                <button
                  className="sidebar-icon-btn"
                  title="New File in Workspace"
                  onClick={() => onNewFile(getSelectedFolderRelPath())}
                >
                  <FilePlus size={14} />
                </button>
                <button
                  className="sidebar-icon-btn"
                  title="New Folder in Workspace"
                  onClick={() => onNewFolder(getSelectedFolderRelPath())}
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  className="sidebar-icon-btn"
                  title="Refresh Workspace Tree"
                  onClick={onRefresh}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="sidebar-icon-btn"
                  title="Close Workspace"
                  onClick={onCloseWorkspace}
                >
                  <X size={14} />
                </button>
              </>
            )}
            <button
              className="sidebar-icon-btn"
              title="Collapse Sidebar"
              onClick={onToggleCollapse}
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Workspace Content */}
      <div className="sidebar-content">
        {!workspace ? (
          <div className="sidebar-empty-state">
            <svg
              className="sidebar-empty-folder-svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: '14px' }}
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <p className="sidebar-empty-text">No folder open</p>
            <p className="sidebar-empty-subtext">Open a folder to start working on your projects.</p>
            <button
              className={`sidebar-open-folder-btn ${!isElectron ? 'disabled' : ''}`}
              onClick={isElectron ? onOpenWorkspace : undefined}
              disabled={!isElectron}
              title={!isElectron ? OPEN_FOLDER_DESKTOP_MESSAGE : 'Open Folder'}
            >
              <Folder size={14} style={{ marginRight: '6px' }} />
              <span>Open Folder</span>
            </button>
            {!isElectron && (
              <p className="sidebar-browser-notice">
                Available in the Electron desktop app
              </p>
            )}
          </div>
        ) : workspace.tree.length === 0 ? (
          <div className="sidebar-empty-workspace">
            <p>Workspace is empty.</p>
            <button
              className="tree-create-first-btn"
              onClick={() => onNewFile('')}
            >
              <FilePlus size={13} />
              <span>Create File</span>
            </button>
          </div>
        ) : (
          <div className="tree-list-root">
            {workspace.tree.map((node) => renderNode(node, 0))}
          </div>
        )}
      </div>
    </div>
  );
};
