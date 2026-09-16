import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Square,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  Settings as SettingsIcon,
  ChevronDown,
  FileText,
  Save
} from "lucide-react";
import { LANGUAGE_CONFIGS } from "../../electron/languages";
import { EditorDocument } from "../../electron/types";
import { TabBar } from "../TabBar/TabBar";
import { FileTypeIcon } from "../FileTree/FileTypeIcon";
import { isElectronAvailable, DESKTOP_APP_REQUIRED_MESSAGE } from "../../services/capability";

interface ToolbarProps {
  selectedLanguage: string;
  onLanguageChange: (langId: string) => void;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  documents: EditorDocument[];
  activeDocumentId: string;
  onSelectTab: (docId: string) => void;
  onCloseTab: (docId: string) => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onSaveFileAs: () => void;
  onSaveAll: () => void;
  recentFiles: string[];
  onOpenRecentFile: (path: string) => void;
  hasWorkspace?: boolean;
  onOpenFolder?: () => void;
  onCloseWorkspace?: () => void;
  isSidebarVisible?: boolean;
  onToggleSidebar?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  selectedLanguage,
  onLanguageChange,
  isRunning,
  onRun,
  onStop,
  isFullscreen,
  onToggleFullscreen,
  theme,
  onToggleTheme,
  onOpenSettings,
  documents,
  activeDocumentId,
  onSelectTab,
  onCloseTab,
  onNewFile,
  onOpenFile,
  onSaveFile,
  onSaveFileAs,
  onSaveAll,
  recentFiles,
  onOpenRecentFile,
  hasWorkspace,
  onOpenFolder,
  onCloseWorkspace,
  isSidebarVisible,
  onToggleSidebar
}) => {
  const isElectron = isElectronAvailable();
  const [isFileMenuOpen, setIsFileMenuOpen] = useState<boolean>(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState<boolean>(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const activeDoc = documents.find((d) => d.id === activeDocumentId);
  const langConfig = LANGUAGE_CONFIGS[selectedLanguage] || LANGUAGE_CONFIGS.java;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setIsFileMenuOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="top-toolbar">
      <div className="toolbar-left">
        <div className="coden-brand-group">
          <div className="coden-brand-box" title="CODEN">
            <span className="coden-symbol-arrow">&gt;</span>
            <span className="coden-symbol-cursor">_</span>
          </div>
          <div className="coden-brand-text-col">
            <span className="coden-brand" title="CODEN">
              coden<span className="coden-cursor">_</span>
            </span>
            <span className="coden-brand-tagline">Your Code. Your Machine.</span>
          </div>
        </div>

        {onToggleSidebar && (
          <button
            className={"toolbar-pill-btn" + (isSidebarVisible ? " active" : "")}
            onClick={onToggleSidebar}
            title={isSidebarVisible ? "Hide Workspace Explorer" : "Show Workspace Explorer"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="var(--color-primary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <span>workspace</span>
          </button>
        )}

        <div className="file-menu-container" ref={fileMenuRef}>
          <button
            className="toolbar-pill-btn"
            onClick={() => setIsFileMenuOpen((prev) => !prev)}
            title="File Menu"
          >
            <FileText size={13} />
            <span>File</span>
            <ChevronDown size={11} />
          </button>

          {isFileMenuOpen && (
            <div className="file-menu-dropdown">
              <button className="file-menu-item" onClick={() => { setIsFileMenuOpen(false); onNewFile(); }}>
                <span>New File</span><span className="shortcut-hint">Ctrl+N</span>
              </button>
              <button
                className={"file-menu-item" + (!isElectron ? " disabled" : "")}
                disabled={!isElectron}
                title={!isElectron ? DESKTOP_APP_REQUIRED_MESSAGE : "Open File (Ctrl+O)"}
                onClick={() => { if (!isElectron) return; setIsFileMenuOpen(false); onOpenFile(); }}
              >
                <span>Open File...</span><span className="shortcut-hint">Ctrl+O</span>
              </button>
              <button
                className={"file-menu-item" + (!isElectron ? " disabled" : "")}
                disabled={!isElectron}
                title={!isElectron ? DESKTOP_APP_REQUIRED_MESSAGE : "Open Folder"}
                onClick={() => { if (!isElectron) return; setIsFileMenuOpen(false); onOpenFolder?.(); }}
              >
                <span>Open Folder...</span><span className="shortcut-hint">Ctrl+K Ctrl+O</span>
              </button>
              <div className="file-menu-separator" />
              <button
                className={"file-menu-item" + (!isElectron ? " disabled" : "")}
                disabled={!isElectron}
                title={!isElectron ? DESKTOP_APP_REQUIRED_MESSAGE : "Save (Ctrl+S)"}
                onClick={() => { if (!isElectron) return; setIsFileMenuOpen(false); onSaveFile(); }}
              >
                <span>Save</span><span className="shortcut-hint">Ctrl+S</span>
              </button>
              <button
                className={"file-menu-item" + (!isElectron ? " disabled" : "")}
                disabled={!isElectron}
                title={!isElectron ? DESKTOP_APP_REQUIRED_MESSAGE : "Save As (Ctrl+Shift+S)"}
                onClick={() => { if (!isElectron) return; setIsFileMenuOpen(false); onSaveFileAs(); }}
              >
                <span>Save As...</span><span className="shortcut-hint">Ctrl+Shift+S</span>
              </button>
              <button
                className={"file-menu-item" + (!isElectron ? " disabled" : "")}
                disabled={!isElectron}
                title={!isElectron ? DESKTOP_APP_REQUIRED_MESSAGE : "Save All (Ctrl+Alt+S)"}
                onClick={() => { if (!isElectron) return; setIsFileMenuOpen(false); onSaveAll(); }}
              >
                <span>Save All</span><span className="shortcut-hint">Ctrl+Alt+S</span>
              </button>
              <div className="file-menu-separator" />
              <button className="file-menu-item" onClick={() => { setIsFileMenuOpen(false); onCloseTab(activeDocumentId); }}>
                <span>Close File</span><span className="shortcut-hint">Ctrl+W</span>
              </button>
              {hasWorkspace && (
                <button className="file-menu-item" onClick={() => { setIsFileMenuOpen(false); onCloseWorkspace?.(); }}>
                  <span>Close Folder</span>
                </button>
              )}
              {recentFiles.length > 0 && (
                <>
                  <div className="file-menu-separator" />
                  <div className="file-menu-header">Recent Files</div>
                  {recentFiles.map((rf) => {
                    const shortName = rf.split(/[/\\]/).pop() || rf;
                    return (
                      <button
                        key={rf}
                        className={"recent-file-item" + (!isElectron ? " disabled" : "")}
                        disabled={!isElectron}
                        title={!isElectron ? DESKTOP_APP_REQUIRED_MESSAGE : rf}
                        onClick={() => { if (!isElectron) return; setIsFileMenuOpen(false); onOpenRecentFile(rf); }}
                      >
                        <span className="recent-file-name">{shortName}</span>
                        <span className="recent-file-path" title={rf}>{rf}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <button
          className={
            "toolbar-pill-btn" +
            (activeDoc?.isDirty ? " save-dirty" : " save-clean") +
            (!isElectron ? " disabled" : "")
          }
          onClick={() => {
            if (isElectron) onSaveFile();
          }}
          disabled={!isElectron}
          title={
            !isElectron
              ? DESKTOP_APP_REQUIRED_MESSAGE
              : activeDoc?.isDirty
              ? "Save File (Ctrl+S) — Unsaved changes"
              : "Save File (Ctrl+S)"
          }
          aria-label="Save File"
        >
          <Save size={13} />
          <span>Save</span>
        </button>

        <div className="tab-bar-outer-group">
          <TabBar
            documents={documents}
            activeDocumentId={activeDocumentId}
            onSelectTab={onSelectTab}
            onCloseTab={(docId) => onCloseTab(docId)}
          />
          <button className="tab-new-btn" onClick={onNewFile} title="New File (Ctrl+N)">+</button>
        </div>
      </div>

      <div className="toolbar-right">
        {/* Language Selector (Relocated to right utility area) */}
        <div className="lang-selector-container" ref={langMenuRef}>
          <button
            className="lang-selector-btn"
            onClick={() => setIsLangMenuOpen((prev) => !prev)}
            title="Change language"
            aria-label={`Current language: ${langConfig.name}. Click to change language.`}
          >
            <span className="lang-selector-icon">
              <FileTypeIcon filename={langConfig.fileName} size={15} />
            </span>
            <span className="lang-selector-name">{langConfig.name}</span>
            <ChevronDown size={11} className={`lang-chevron ${isLangMenuOpen ? 'open' : ''}`} />
          </button>

          {isLangMenuOpen && (
            <div className="lang-menu-dropdown">
              <div className="lang-menu-header">Language</div>
              {Object.values(LANGUAGE_CONFIGS).map((lang) => (
                <button
                  key={lang.id}
                  className={"lang-menu-item" + (selectedLanguage === lang.id ? " active" : "")}
                  onClick={() => {
                    setIsLangMenuOpen(false);
                    if (lang.id !== selectedLanguage) onLanguageChange(lang.id);
                  }}
                  title={`Select ${lang.name}`}
                >
                  <span className="lang-menu-icon">
                    <FileTypeIcon filename={lang.fileName} size={14} />
                  </span>
                  <span className="lang-menu-name">{lang.name}</span>
                  {selectedLanguage === lang.id && (
                    <span className="lang-menu-active-dot" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {isRunning ? (
          <button className="btn-stop-action" onClick={onStop} title="Stop Execution">
            <Square size={13} fill="currentColor" />
            <span>Stop</span>
          </button>
        ) : (
          <button className="btn-run-action" onClick={onRun} title="Run Active Tab (Ctrl + Enter)">
            <Play size={13} fill="currentColor" strokeWidth={0} />
            <span>Run</span>
          </button>
        )}

        <div className="toolbar-icon-group">
          <button className="icon-action-btn" onClick={onToggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button className="icon-action-btn" onClick={onToggleTheme} title={"Switch to " + (theme === "dark" ? "Light" : "Dark") + " mode"}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="icon-action-btn" onClick={onOpenSettings} title="Settings and Compiler Status">
            <SettingsIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
