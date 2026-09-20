import React, { useRef, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { PromptEntry } from '../../utils/inputDetection';

interface PromptInputPanelProps {
  /** Detected prompt entries from static code analysis */
  entries: PromptEntry[];
  /** Current raw stdin value (newline-separated). Controlled from parent. */
  value: string;
  /** Called whenever any field changes; argument is the updated newline-joined value */
  onChange: (newValue: string) => void;
  /** Called when user presses Ctrl+Enter — triggers Run */
  onRun?: () => void;
  /** Whether execution is currently running (disables fields) */
  isRunning: boolean;
}

/**
 * Prompt-aware input panel.
 *
 * Renders one row per PromptEntry:   "Enter the value of n:  [_____]"
 * The user enters only the value; the prompt label is read-only context.
 *
 * The runner still receives plain newline-separated stdin, constructed by joining
 * all field values — the same format as the raw textarea mode.
 */
export const PromptInputPanel: React.FC<PromptInputPanelProps> = ({
  entries,
  value,
  onChange,
  onRun,
  isRunning
}) => {
  // Parse incoming value string into per-field values
  const getLines = useCallback((): string[] => {
    return value === '' ? [] : value.split('\n');
  }, [value]);

  // Number of fields = number of detected entries + any extra manually added
  const entryCount = entries.length;
  const valueLines = getLines();
  // Extra manually-added fields (beyond detected entries)
  const extraCount = Math.max(0, valueLines.length - entryCount);

  // Field refs for focus management
  const fieldRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Error state — which fields are empty and have been submitted
  const [errorIndices, setErrorIndices] = React.useState<Set<number>>(new Set());

  // Update a single field and propagate via onChange
  const updateField = (index: number, newFieldValue: string) => {
    const lines = value === '' ? [] : value.split('\n');
    // Extend if needed
    while (lines.length <= index) lines.push('');
    lines[index] = newFieldValue;
    // Clear error for this index when user types
    if (errorIndices.has(index)) {
      setErrorIndices(prev => { const s = new Set(prev); s.delete(index); return s; });
    }
    onChange(lines.join('\n'));
  };

  // Add extra blank field
  const addField = () => {
    const lines = value === '' ? [] : value.split('\n');
    // Ensure all existing fields exist
    const totalExisting = entryCount + extraCount;
    while (lines.length < totalExisting) lines.push('');
    lines.push('');
    onChange(lines.join('\n'));
  };

  // Validate — mark empty fields that correspond to read calls
  // Returns true if all required fields are filled
  const validate = (): boolean => {
    const lines = value === '' ? [] : value.split('\n');
    const emptyIndices = new Set<number>();
    for (let i = 0; i < entryCount; i++) {
      const fieldVal = (lines[i] ?? '').trim();
      if (fieldVal === '') {
        emptyIndices.add(i);
      }
    }
    if (emptyIndices.size > 0) {
      setErrorIndices(emptyIndices);
      // Focus first empty field
      const firstEmpty = Math.min(...emptyIndices);
      fieldRefs.current[firstEmpty]?.focus();
      return false;
    }
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    // Ctrl+Enter → Run (after validation)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (validate()) {
        onRun?.();
      }
      return;
    }
    // Tab → move to next field
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const next = fieldRefs.current[index + 1];
      if (next) next.focus();
      return;
    }
    // Shift+Tab → move to previous field
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const prev = fieldRefs.current[index - 1];
      if (prev) prev.focus();
    }
  };

  // When entries change (code change or tab switch), reset errors
  useEffect(() => {
    setErrorIndices(new Set());
  }, [entries]);

  const lines = value === '' ? [] : value.split('\n');
  const totalFields = entryCount + extraCount;

  return (
    <div className="prompt-input-list">
      {Array.from({ length: Math.max(totalFields, entryCount) }, (_, i) => {
        const entry: PromptEntry | undefined = entries[i];
        const promptText = entry ? entry.prompt : '';
        const fieldValue = lines[i] ?? '';
        const hasError = errorIndices.has(i);
        const isExtra = i >= entryCount;

        return (
          <div key={i} className="prompt-input-row">
            {promptText ? (
              <span className="prompt-input-label" title={promptText}>
                {promptText}
              </span>
            ) : isExtra ? (
              <span className="prompt-input-label prompt-input-label--extra">
                {`stdin ${i + 1}:`}
              </span>
            ) : (
              <span className="prompt-input-label prompt-input-label--blank">&nbsp;</span>
            )}
            <input
              ref={el => { fieldRefs.current[i] = el; }}
              type="text"
              className={`prompt-input-field${hasError ? ' error' : ''}`}
              value={fieldValue}
              disabled={isRunning}
              spellCheck={false}
              autoComplete="off"
              placeholder={hasError ? 'Required' : ''}
              onChange={e => updateField(i, e.target.value)}
              onKeyDown={e => handleKeyDown(e, i)}
              aria-label={promptText || `Input ${i + 1}`}
            />
          </div>
        );
      })}

      {/* Add extra field button */}
      <div className="prompt-input-add-row">
        <button
          className="prompt-input-add-btn"
          onClick={addField}
          disabled={isRunning}
          title="Add another input field"
          type="button"
        >
          <Plus size={11} />
          <span>Add field</span>
        </button>
      </div>
    </div>
  );
};
