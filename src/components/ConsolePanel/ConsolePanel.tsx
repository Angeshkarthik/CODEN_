import React, { useState, useRef, useEffect } from 'react';
import { Trash2, AlignLeft } from 'lucide-react';
import { OutputPanel } from '../OutputPanel/OutputPanel';
import { PromptInputPanel } from './PromptInputPanel';
import { ExecutionResult } from '../../electron/types';
import { requiresStdin, detectPrompts, PromptEntry } from '../../utils/inputDetection';

interface ConsolePanelProps {
  input: string;
  onInputChange: (val: string) => void;
  outputResult: ExecutionResult | null;
  isRunning: boolean;
  onClearOutput: () => void;
  onNavigateToLine?: (line: number, column?: number, fileName?: string) => void;
  onRun?: () => void;
  /** Source code for the active document (used for prompt detection) */
  code: string;
  /** Language id for the active document (used for prompt detection) */
  language: string;
  /**
   * Called whenever the rendered input mode changes.
   * `true`  → prompt-aware fields are currently shown.
   * `false` → raw textarea is currently shown.
   * Used by App.tsx to gate the legacy empty-input validation guard.
   */
  onPromptModeChange?: (active: boolean) => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  input,
  onInputChange,
  outputResult,
  isRunning,
  onClearOutput,
  onNavigateToLine,
  onRun,
  code,
  language,
  onPromptModeChange
}) => {
  // Vertical split percentage between Input and Output
  // Default: Input ~35%, Output ~65%
  const [splitPercent, setSplitPercent] = useState<number>(() => {
    const saved = localStorage.getItem('occ_console_split');
    return saved ? parseFloat(saved) : 35;
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force raw textarea mode toggle (per-session, not persisted — user can always switch back)
  const [forceRaw, setForceRaw] = useState<boolean>(false);

  // Compute prompt mode: only when not forced raw, code requires stdin, and prompts detected
  const needsInput = requiresStdin(code, language);
  let promptEntries: PromptEntry[] = [];
  let isPromptMode = false;

  if (!forceRaw && needsInput) {
    try {
      const detected = detectPrompts(code, language);
      if (detected.length > 0) {
        promptEntries = detected;
        isPromptMode = true;
      }
    } catch {
      // Any detection error → raw fallback
    }
  }

  // Notify parent whenever the rendered mode changes (prompt-aware vs raw).
  // Parent uses this to decide whether the legacy empty-input guard should fire.
  useEffect(() => {
    onPromptModeChange?.(isPromptMode);
  }, [isPromptMode, onPromptModeChange]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    const totalHeight = rect.height;
    if (totalHeight <= 0) return;

    // Minimum heights enforced: 45px min for Input and Output
    const minHeight = 45;
    if (currentY < minHeight || totalHeight - currentY < minHeight) {
      return;
    }

    const newPercent = (currentY / totalHeight) * 100;
    // Clamp between 15% and 85%
    const clamped = Math.min(Math.max(newPercent, 15), 85);
    setSplitPercent(clamped);
    localStorage.setItem('occ_console_split', clamped.toFixed(1));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
  };

  // Raw textarea keyboard handler
  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter -> Run Active Tab
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      onRun?.();
      return;
    }

    // Support Tab key insertion in input textarea
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      onInputChange(newValue);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      }, 0);
    }
  };

  return (
    <div className="console-panel-container" ref={containerRef}>
      {/* Top Section: Input */}
      <div
        className="console-input-section"
        style={{
          height: `${splitPercent}%`,
          pointerEvents: isDragging ? 'none' : 'auto',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        <div className="console-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div className="console-header-badge" title="Input">
              <span className="console-badge-arrow">&gt;</span>
            </div>
            <span className="console-section-title">Input</span>
            {isPromptMode && (
              <span className="prompt-mode-badge" title="Prompt-aware mode: fields detected from your code">
                prompt
              </span>
            )}
          </div>
          <div className="console-section-actions">
            {/* Toggle between prompt-aware and raw textarea */}
            {needsInput && (
              <button
                className="output-tool-btn"
                onClick={() => setForceRaw(r => !r)}
                title={isPromptMode ? 'Switch to raw stdin textarea' : 'Switch to prompt-aware fields'}
              >
                <AlignLeft size={13} />
                <span>{isPromptMode ? 'Raw' : 'Fields'}</span>
              </button>
            )}
            {input.length > 0 && (
              <button
                className="output-tool-btn"
                onClick={() => onInputChange('')}
                title="Clear Input"
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
        <div className="console-input-body">
          {isPromptMode ? (
            <PromptInputPanel
              entries={promptEntries}
              value={input}
              onChange={onInputChange}
              onRun={onRun}
              isRunning={isRunning}
            />
          ) : (
            <textarea
              className="console-input-textarea"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleRawKeyDown}
              placeholder="Enter input for your program..."
              spellCheck={false}
            />
          )}
        </div>
      </div>

      {/* Draggable Horizontal Divider */}
      <div
        className={`console-horizontal-divider ${isDragging ? 'dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Drag to resize Input / Output"
      >
        <div className="console-divider-grip" />
      </div>

      {/* Bottom Section: Output */}
      <div
        className="console-output-section"
        style={{
          height: `calc(${100 - splitPercent}% - 5px)`,
          pointerEvents: isDragging ? 'none' : 'auto',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        <OutputPanel
          result={outputResult}
          isRunning={isRunning}
          onClear={onClearOutput}
          onNavigateToLine={onNavigateToLine}
          promptEntries={isPromptMode ? promptEntries : undefined}
        />
      </div>
    </div>
  );
};
