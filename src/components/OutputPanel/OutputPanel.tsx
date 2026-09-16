import React, { useState } from 'react';
import { Trash2, Copy, Check, CheckCircle2, AlertCircle, AlertTriangle, StopCircle, RefreshCw } from 'lucide-react';
import { ExecutionResult } from '../../electron/types';

interface OutputPanelProps {
  result: ExecutionResult | null;
  isRunning: boolean;
  onClear: () => void;
  onNavigateToLine?: (line: number, column?: number, fileName?: string) => void;
}

const FormattedErrorOutput: React.FC<{
  text: string;
  onNavigate?: (line: number, column?: number, fileName?: string) => void;
}> = ({ text, onNavigate }) => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Regex patterns:
  // 1. GCC / G++: filename.cpp:12:5: error: ...
  const gccPattern = /^(?:.*[/\\])?([a-zA-Z0-9_.-]+\.(?:c|cpp|cc|h|hpp)):(\d+)(?::(\d+))?:(\s*(?:fatal )?(?:error|warning):.*)$/i;
  // 2. Java: filename.java:12: error: ...
  const javaPattern = /^(?:.*[/\\])?([a-zA-Z0-9_.-]+\.java):(\d+):(\s*error:.*)$/i;
  // 3. Python: File "filename.py", line 12, in ...
  const pythonPattern = /^(\s*File "(?:.*[/\\])?([a-zA-Z0-9_.-]+\.py)", line )(\d+)(, in .*)$/i;
  // 4. JS: filename.js:12:5
  const jsPattern = /^(.*?(?:[/\\]|\())([a-zA-Z0-9_.-]+\.js):(\d+)(?::(\d+))?(\)?.*)$/i;

  return (
    <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {lines.map((lineStr, idx) => {
        // Test GCC
        const gccMatch = lineStr.match(gccPattern);
        if (gccMatch) {
          const file = gccMatch[1];
          const lineNum = parseInt(gccMatch[2], 10);
          const colNum = gccMatch[3] ? parseInt(gccMatch[3], 10) : undefined;
          const rest = gccMatch[4];
          return (
            <div key={idx}>
              {onNavigate ? (
                <button
                  type="button"
                  className="error-location-link"
                  onClick={() => onNavigate(lineNum, colNum, file)}
                  title={`Jump to line ${lineNum}${colNum ? `:${colNum}` : ''}`}
                >
                  {file}:{lineNum}{colNum ? `:${colNum}` : ''}
                </button>
              ) : (
                `${file}:${lineNum}${colNum ? `:${colNum}` : ''}`
              )}
              <span>:{rest}</span>
            </div>
          );
        }

        // Test Java
        const javaMatch = lineStr.match(javaPattern);
        if (javaMatch) {
          const file = javaMatch[1];
          const lineNum = parseInt(javaMatch[2], 10);
          const rest = javaMatch[3];
          return (
            <div key={idx}>
              {onNavigate ? (
                <button
                  type="button"
                  className="error-location-link"
                  onClick={() => onNavigate(lineNum, 1, file)}
                  title={`Jump to line ${lineNum}`}
                >
                  {file}:{lineNum}
                </button>
              ) : (
                `${file}:${lineNum}`
              )}
              <span>:{rest}</span>
            </div>
          );
        }

        // Test Python
        const pyMatch = lineStr.match(pythonPattern);
        if (pyMatch) {
          const prefix = pyMatch[1];
          const file = pyMatch[2];
          const lineNum = parseInt(pyMatch[3], 10);
          const suffix = pyMatch[4];
          return (
            <div key={idx}>
              <span>{prefix}</span>
              {onNavigate ? (
                <button
                  type="button"
                  className="error-location-link"
                  onClick={() => onNavigate(lineNum, 1, file)}
                  title={`Jump to line ${lineNum}`}
                >
                  {file}:{lineNum}
                </button>
              ) : (
                lineNum
              )}
              <span>{suffix}</span>
            </div>
          );
        }

        // Test JS
        const jsMatch = lineStr.match(jsPattern);
        if (jsMatch) {
          const prefix = jsMatch[1];
          const file = jsMatch[2];
          const lineNum = parseInt(jsMatch[3], 10);
          const colNum = jsMatch[4] ? parseInt(jsMatch[4], 10) : undefined;
          const suffix = jsMatch[5];
          return (
            <div key={idx}>
              <span>{prefix}</span>
              {onNavigate ? (
                <button
                  type="button"
                  className="error-location-link"
                  onClick={() => onNavigate(lineNum, colNum, file)}
                  title={`Jump to line ${lineNum}${colNum ? `:${colNum}` : ''}`}
                >
                  {file}:{lineNum}{colNum ? `:${colNum}` : ''}
                </button>
              ) : (
                `${file}:${lineNum}${colNum ? `:${colNum}` : ''}`
              )}
              <span>{suffix}</span>
            </div>
          );
        }

        return <div key={idx}>{lineStr || '\u00A0'}</div>;
      })}
    </pre>
  );
};

export const OutputPanel: React.FC<OutputPanelProps> = ({
  result,
  isRunning,
  onClear,
  onNavigateToLine
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    if (!result) return;
    const parts = [
      result.stdout,
      result.compilationError ? `\n=== Compilation Error ===\n${result.compilationError}` : '',
      result.stderr && !result.compilationError ? `\n=== Runtime Error ===\n${result.stderr}` : ''
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(parts);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="output-pane-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div className="console-header-badge" title="Output">
            <span className="console-badge-arrow">&gt;</span>
          </div>
          <span className="output-pane-title">Output</span>
        </div>
        <div className="output-header-actions">
          {result && (
            <button className="output-tool-btn" onClick={handleCopy} title="Copy Output">
              {copied ? <Check size={13} color="var(--color-success)" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
          <button className="output-tool-btn" onClick={onClear} title="Clear Output">
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="output-body-scroll">
        {/* RUNNING STATE */}
        {isRunning && (
          <div className="state-banner state-running">
            <RefreshCw size={14} className="spin-anim" />
            <span>Running...</span>
          </div>
        )}

        {/* INITIAL EMPTY STATE MATCHING REFERENCE */}
        {!isRunning && !result && (
          <div className="output-empty-state-wrap">
            <div className="output-empty-icon-box">
              <span className="output-empty-arrow">&gt;</span>
              <span className="output-empty-cursor">_</span>
            </div>
            <div className="output-placeholder-text">
              Run your code to see the output here.
            </div>
          </div>
        )}

        {/* COMPLETED RESULTS */}
        {!isRunning && result && (
          <div>
            {/* USER INPUT VALIDATION MESSAGE (Not an error) */}
            {result.isValidationMessage ? (
              <div style={{ color: 'var(--text-bright)', fontSize: '13px', lineHeight: '1.6' }}>
                {result.stdout}
              </div>
            ) : (
              <>
                {/* Standard Output */}
                {result.stdout && <div>{result.stdout}</div>}

                {/* 1. USER-REQUESTED STOP STATE */}
                {result.isStopped && (
                  <div>
                    {result.stderr && (
                      <div style={{ color: 'var(--color-danger)', marginTop: 4, marginBottom: 6 }}>
                        <FormattedErrorOutput text={result.stderr} onNavigate={onNavigateToLine} />
                      </div>
                    )}
                    <div className="state-banner state-error">
                      <StopCircle size={14} />
                      <span>Execution Stopped</span>
                    </div>
                  </div>
                )}

                {/* 2. TIMEOUT STATE */}
                {!result.isStopped && result.isTimeout && (
                  <div>
                    {result.stderr && (
                      <div style={{ color: 'var(--color-danger)', marginTop: 4, marginBottom: 6 }}>
                        <FormattedErrorOutput text={result.stderr} onNavigate={onNavigateToLine} />
                      </div>
                    )}
                    <div className="state-banner state-timeout">
                      <AlertTriangle size={14} />
                      <span>Execution Timed Out (The program exceeded the time limit)</span>
                    </div>
                  </div>
                )}

                {/* 3. COMPILATION ERROR STATE */}
                {!result.isStopped && !result.isTimeout && result.compilationError && (
                  <div>
                    <div className="state-banner state-error">
                      <AlertCircle size={14} />
                      <span>Compilation Error</span>
                    </div>
                    <div style={{ color: 'var(--color-danger)', marginTop: 4 }}>
                      <FormattedErrorOutput text={result.compilationError} onNavigate={onNavigateToLine} />
                    </div>
                  </div>
                )}

                {/* 4. SUCCESS STATE (exitCode === 0) */}
                {!result.isStopped && !result.isTimeout && !result.compilationError && result.exitCode === 0 && (
                  <div>
                    {result.stderr && (
                      <div style={{ color: 'var(--text-secondary)', marginTop: 4, marginBottom: 6 }}>
                        <FormattedErrorOutput text={result.stderr} onNavigate={onNavigateToLine} />
                      </div>
                    )}
                    <div className="state-banner state-success">
                      <CheckCircle2 size={14} />
                      <span>Execution Successful ({result.durationMs}ms)</span>
                    </div>
                  </div>
                )}

                {/* 5. RUNTIME / PROCESS FAILURE STATE (exitCode !== 0) */}
                {!result.isStopped && !result.isTimeout && !result.compilationError && result.exitCode !== 0 && (
                  <div>
                    <div className="state-banner state-error">
                      <AlertCircle size={14} />
                      <span>
                        {result.exitCode !== null ? `Runtime Error (Exit code ${result.exitCode})` : 'Runtime Error'}
                      </span>
                    </div>
                    {result.stderr && (
                      <div style={{ color: 'var(--color-danger)', marginTop: 4 }}>
                        <FormattedErrorOutput text={result.stderr} onNavigate={onNavigateToLine} />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
