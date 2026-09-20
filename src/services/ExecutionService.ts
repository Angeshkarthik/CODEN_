import { ExecutionResult, CompilerStatus } from '../electron/types';
import { isElectronAvailable } from './capability';

export { isElectronAvailable };
export const isElectronMode = isElectronAvailable;

export class ExecutionService {
  private static activeBrowserExecutionId: string | null = null;

  /**
   * Run code either via Electron IPC or via localhost Dev API
   */
  static async runCode(
    languageId: string,
    code: string,
    input: string,
    timeoutSeconds: number,
    executionId?: string,
    fileName?: string
  ): Promise<ExecutionResult> {
    if (isElectronMode()) {
      return await window.electronAPI!.runCode(languageId, code, input, timeoutSeconds, executionId, fileName);
    }

    // Browser Localhost execution
    const effectiveExecId = executionId || `exec_browser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.activeBrowserExecutionId = effectiveExecId;

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          language: languageId,
          code,
          stdin: input,
          timeout: timeoutSeconds,
          executionId: effectiveExecId,
          fileName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          stdout: '',
          stderr: errorData.stderr || errorData.error || `Execution failed with status ${response.status}`,
          exitCode: 1,
          durationMs: 0
        };
      }

      const result: ExecutionResult = await response.json();
      return result;
    } catch (err: any) {
      return {
        stdout: '',
        stderr: 'Local execution service is unavailable.\nPlease start the local dev server or launch via Electron.',
        exitCode: 1,
        durationMs: 0
      };
    } finally {
      if (this.activeBrowserExecutionId === effectiveExecId) {
        this.activeBrowserExecutionId = null;
      }
    }
  }

  /**
   * Stop the active execution
   */
  static async stopExecution(executionId?: string): Promise<boolean> {
    if (isElectronMode()) {
      if (window.electronAPI?.stopExecution) {
        return await window.electronAPI.stopExecution(executionId);
      }
      return false;
    }

    // Browser stop
    const targetId = executionId || this.activeBrowserExecutionId;
    try {
      const response = await fetch('/api/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ executionId: targetId })
      });
      const data = await response.json();
      return Boolean(data?.success);
    } catch {
      return false;
    } finally {
      if (targetId && this.activeBrowserExecutionId === targetId) {
        this.activeBrowserExecutionId = null;
      }
    }
  }

  /**
   * Check installed compilers
   */
  static async checkCompilers(): Promise<CompilerStatus[]> {
    if (isElectronMode()) {
      if (window.electronAPI?.checkCompilers) {
        return await window.electronAPI.checkCompilers();
      }
      return [];
    }

    try {
      const response = await fetch('/api/compilers');
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch {
      return [];
    }
  }
}
