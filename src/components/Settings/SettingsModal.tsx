import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sun,
  Moon,
  Clock,
  Cpu,
  Code2,
  Sliders
} from 'lucide-react';
import { CompilerStatus, EditorSettings, DEFAULT_EDITOR_SETTINGS } from '../../electron/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
  timeoutSeconds: number;
  onTimeoutChange: (val: number) => void;
  compilerStatuses: CompilerStatus[];
  onRefreshCompilers: () => void;
  isCheckingCompilers: boolean;
  editorSettings?: EditorSettings;
  onUpdateEditorSettings?: (newSettings: Partial<EditorSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  timeoutSeconds,
  onTimeoutChange,
  compilerStatuses,
  onRefreshCompilers,
  isCheckingCompilers,
  editorSettings = DEFAULT_EDITOR_SETTINGS,
  onUpdateEditorSettings
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'general'>('editor');

  if (!isOpen) return null;

  const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    onUpdateEditorSettings?.({ [key]: value });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-card-header">
          <span className="modal-card-title">CODEN Settings</span>
          <button className="icon-action-btn" onClick={onClose} title="Close Settings">
            <X size={16} />
          </button>
        </div>

        {/* Modal Nav Tabs */}
        <div className="modal-nav-tabs">
          <button
            className={`modal-nav-tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            <Code2 size={14} />
            <span>Editor</span>
          </button>
          <button
            className={`modal-nav-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={14} />
            <span>General & Compilers</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-card-body">
          {activeTab === 'editor' ? (
            <>
              {/* SECTION: Appearance & Layout */}
              <div className="modal-section">
                <span className="modal-section-title">Appearance & Layout</span>
                <span className="modal-section-desc">
                  Customize editor typography, spacing, and layout visual cues.
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {/* Font Size */}
                  <div className="settings-row">
                    <div className="settings-row-col">
                      <strong style={{ color: 'var(--text-bright)', fontSize: 13 }}>Font Size</strong>
                      <span className="modal-section-desc">Monaco editor font size (10px to 32px)</span>
                    </div>
                    <input
                      type="number"
                      className="settings-num-input"
                      value={editorSettings.fontSize}
                      min={10}
                      max={32}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 14;
                        updateSetting('fontSize', Math.min(Math.max(val, 10), 32));
                      }}
                    />
                  </div>

                  {/* Tab Size */}
                  <div className="settings-row">
                    <div className="settings-row-col">
                      <strong style={{ color: 'var(--text-bright)', fontSize: 13 }}>Tab Size</strong>
                      <span className="modal-section-desc">Number of spaces per indentation level</span>
                    </div>
                    <select
                      className="settings-select"
                      value={editorSettings.tabSize}
                      onChange={(e) => updateSetting('tabSize', parseInt(e.target.value) || 4)}
                    >
                      <option value={2}>2 spaces</option>
                      <option value={4}>4 spaces</option>
                      <option value={8}>8 spaces</option>
                    </select>
                  </div>

                  {/* Indentation (Spaces vs Tabs) */}
                  <div className="settings-row">
                    <div className="settings-row-col">
                      <strong style={{ color: 'var(--text-bright)', fontSize: 13 }}>Indentation</strong>
                      <span className="modal-section-desc">Insert spaces or real tab characters</span>
                    </div>
                    <div className="settings-radio-group">
                      <label className="settings-radio-label">
                        <input
                          type="radio"
                          name="insertSpaces"
                          checked={editorSettings.insertSpaces}
                          onChange={() => updateSetting('insertSpaces', true)}
                        />
                        <span>Spaces</span>
                      </label>
                      <label className="settings-radio-label">
                        <input
                          type="radio"
                          name="insertSpaces"
                          checked={!editorSettings.insertSpaces}
                          onChange={() => updateSetting('insertSpaces', false)}
                        />
                        <span>Tabs</span>
                      </label>
                    </div>
                  </div>

                  {/* Whitespace Rendering */}
                  <div className="settings-row">
                    <div className="settings-row-col">
                      <strong style={{ color: 'var(--text-bright)', fontSize: 13 }}>Render Whitespace</strong>
                      <span className="modal-section-desc">Display visual indicators for spaces/tabs</span>
                    </div>
                    <select
                      className="settings-select"
                      value={editorSettings.renderWhitespace}
                      onChange={(e) => updateSetting('renderWhitespace', e.target.value as any)}
                    >
                      <option value="none">None</option>
                      <option value="selection">Selection</option>
                      <option value="all">All</option>
                    </select>
                  </div>

                  {/* Visual Toggles Grid */}
                  <div className="settings-grid-2col">
                    <label className="settings-checkbox-item">
                      <input
                        type="checkbox"
                        checked={editorSettings.wordWrap === 'on'}
                        onChange={(e) => updateSetting('wordWrap', e.target.checked ? 'on' : 'off')}
                      />
                      <span>Word Wrap</span>
                    </label>

                    <label className="settings-checkbox-item">
                      <input
                        type="checkbox"
                        checked={editorSettings.minimap}
                        onChange={(e) => updateSetting('minimap', e.target.checked)}
                      />
                      <span>Minimap</span>
                    </label>

                    <label className="settings-checkbox-item">
                      <input
                        type="checkbox"
                        checked={editorSettings.lineNumbers === 'on'}
                        onChange={(e) => updateSetting('lineNumbers', e.target.checked ? 'on' : 'off')}
                      />
                      <span>Line Numbers</span>
                    </label>

                    <label className="settings-checkbox-item">
                      <input
                        type="checkbox"
                        checked={editorSettings.bracketMatching}
                        onChange={(e) => updateSetting('bracketMatching', e.target.checked)}
                      />
                      <span>Bracket Matching</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION: Editor Intelligence & Features */}
              <div className="modal-section">
                <span className="modal-section-title">Editor Features & Intelligence</span>
                <span className="modal-section-desc">
                  Configure Monaco code completion, parameter hints, and assistance.
                </span>

                <div className="settings-grid-2col" style={{ marginTop: 4 }}>
                  <label className="settings-checkbox-item" title="Enable Monaco completion suggestions">
                    <input
                      type="checkbox"
                      checked={editorSettings.autocomplete}
                      onChange={(e) => updateSetting('autocomplete', e.target.checked)}
                    />
                    <span>Autocomplete</span>
                  </label>

                  <label
                    className="settings-checkbox-item"
                    title="Automatically trigger suggestion popups as you type"
                  >
                    <input
                      type="checkbox"
                      checked={editorSettings.automaticSuggestions}
                      onChange={(e) => updateSetting('automaticSuggestions', e.target.checked)}
                    />
                    <span>Automatic Suggestions</span>
                  </label>

                  <label className="settings-checkbox-item" title="Show parameter and signature help">
                    <input
                      type="checkbox"
                      checked={editorSettings.parameterHints}
                      onChange={(e) => updateSetting('parameterHints', e.target.checked)}
                    />
                    <span>Parameter Hints</span>
                  </label>

                  <label className="settings-checkbox-item" title="Show type and documentation hovers">
                    <input
                      type="checkbox"
                      checked={editorSettings.hover}
                      onChange={(e) => updateSetting('hover', e.target.checked)}
                    />
                    <span>Hover Information</span>
                  </label>

                  <label className="settings-checkbox-item" title="Enable Peek / Go to Definition where supported">
                    <input
                      type="checkbox"
                      checked={editorSettings.codeNavigation}
                      onChange={(e) => updateSetting('codeNavigation', e.target.checked)}
                    />
                    <span>Code Navigation</span>
                  </label>

                  <label className="settings-checkbox-item" title="Automatically insert closing brackets and quotes">
                    <input
                      type="checkbox"
                      checked={editorSettings.autoClosingBrackets}
                      onChange={(e) => updateSetting('autoClosingBrackets', e.target.checked)}
                    />
                    <span>Auto Closing Brackets</span>
                  </label>

                  <label className="settings-checkbox-item" title="Automatically adjust indentation on newlines">
                    <input
                      type="checkbox"
                      checked={editorSettings.autoIndentation}
                      onChange={(e) => updateSetting('autoIndentation', e.target.checked)}
                    />
                    <span>Automatic Indentation</span>
                  </label>
                </div>
              </div>

              {/* SECTION: Formatting */}
              <div className="modal-section">
                <span className="modal-section-title">Code Formatting</span>
                <span className="modal-section-desc">
                  Monaco native indentation and formatting options.
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <label className="settings-checkbox-item">
                    <input
                      type="checkbox"
                      checked={editorSettings.formatOnPaste}
                      onChange={(e) => updateSetting('formatOnPaste', e.target.checked)}
                    />
                    <div>
                      <div>Format On Paste</div>
                      <div className="settings-disabled-note">
                        Uses Monaco native indentation. External formatters (e.g. clang-format) are not bundled offline.
                      </div>
                    </div>
                  </label>

                  <label className="settings-checkbox-item">
                    <input
                      type="checkbox"
                      checked={editorSettings.formatOnType}
                      onChange={(e) => updateSetting('formatOnType', e.target.checked)}
                    />
                    <div>
                      <div>Format On Type</div>
                      <div className="settings-disabled-note">
                        Triggers Monaco line re-indentation after typing punctuation.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* SECTION: Theme Appearance */}
              <div className="modal-section">
                <span className="modal-section-title">App Theme</span>
                <div className="theme-toggle-row">
                  <button
                    className={`theme-choice-btn ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => onThemeChange('dark')}
                  >
                    <Moon size={14} />
                    <span>Dark Mode</span>
                  </button>
                  <button
                    className={`theme-choice-btn ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => onThemeChange('light')}
                  >
                    <Sun size={14} />
                    <span>Light Mode</span>
                  </button>
                </div>
              </div>

              {/* Execution Timeout */}
              <div className="modal-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} />
                  <span className="modal-section-title">Execution Timeout</span>
                </div>
                <span className="modal-section-desc">
                  Automatic termination limit for long-running scripts or infinite loops.
                </span>
                <input
                  type="number"
                  className="timeout-input-field"
                  value={timeoutSeconds}
                  onChange={(e) => onTimeoutChange(Math.max(1, parseInt(e.target.value) || 10))}
                  min={1}
                  max={60}
                />
              </div>

              {/* Toolchains Status */}
              <div className="modal-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Cpu size={14} />
                    <span className="modal-section-title">Toolchains Status</span>
                  </div>
                  <button
                    className="icon-action-btn"
                    onClick={onRefreshCompilers}
                    disabled={isCheckingCompilers}
                    title="Refresh Detection"
                  >
                    <RefreshCw size={13} className={isCheckingCompilers ? 'spin-anim' : ''} />
                  </button>
                </div>
                <span className="modal-section-desc">
                  CODEN uses bundled offline compilers and runtimes for standalone execution (with local system fallback in development mode).
                </span>

                <div className="toolchain-status-box">
                  {compilerStatuses.map((item) => (
                    <div key={item.id} className="toolchain-row">
                      <div>
                        <strong style={{ color: 'var(--text-bright)' }}>{item.name}</strong>
                        {item.version && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                            {item.version}
                          </div>
                        )}
                      </div>
                      <div>
                        {item.installed ? (
                          <span className="badge-ok">
                            <CheckCircle2 size={14} /> Installed
                          </span>
                        ) : (
                          <span className="badge-missing">
                            <AlertCircle size={14} /> Not Found
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-card-footer">
          <button className="btn-modal-close" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
