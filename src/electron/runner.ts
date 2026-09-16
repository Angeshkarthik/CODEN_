import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import treeKill from 'tree-kill';
import { LANGUAGE_CONFIGS } from './languages';
import { ExecutionResult } from './types';
import { resolveToolchainExecutable } from './toolchains';

// Active execution instance tracker supporting both single (Electron) and multi-execution (Browser / executionId)
interface ActiveExecution {
  process: ChildProcess;
  timeoutHandle: NodeJS.Timeout;
}

const activeExecutions = new Map<string, ActiveExecution>();
const cancelledExecutions = new Set<string>();
let globalDefaultExecutionId: string | null = null;

/**
 * Terminate an execution by its executionId or the currently active default execution.
 */
export async function stopCurrentExecution(executionId?: string): Promise<boolean> {
  const targetId = executionId || globalDefaultExecutionId;
  if (!targetId) {
    return false;
  }

  cancelledExecutions.add(targetId);

  const active = activeExecutions.get(targetId);
  if (active) {
    clearTimeout(active.timeoutHandle);
    if (active.process.pid) {
      const pid = active.process.pid;
      try {
        treeKill(pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }
    activeExecutions.delete(targetId);
    if (globalDefaultExecutionId === targetId) {
      globalDefaultExecutionId = null;
    }
    return true;
  }

  return true;
}

export async function executeCode(
  languageId: string,
  code: string,
  input: string,
  timeoutSeconds: number = 10,
  executionId?: string
): Promise<ExecutionResult> {
  const effectiveId = executionId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Always track as current active execution and stop any prior execution
  await stopCurrentExecution();
  globalDefaultExecutionId = effectiveId;

  const lang = LANGUAGE_CONFIGS[languageId];
  if (!lang) {
    throw new Error(`Unsupported language: ${languageId}`);
  }

  // Create isolated temp workspace
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `occ_${languageId}_`));
  const sourceFilePath = path.join(tempDir, lang.fileName);
  const outputExePath = path.join(tempDir, 'Main.exe');

  fs.writeFileSync(sourceFilePath, code, 'utf8');

  const startTime = Date.now();

  try {
    if (cancelledExecutions.has(effectiveId)) {
      return { stdout: '', stderr: '', exitCode: null, isStopped: true, durationMs: 0 };
    }

    // 1. Compilation Step (if required)
    if (lang.requiresCompilation && lang.compilerCommand && lang.compilerArgs) {
      const compileArgs = lang.compilerArgs(lang.fileName, outputExePath);
      const resolvedCompiler = resolveToolchainExecutable(lang.compilerCommand);

      const compileResult = await runProcessInDir(
        tempDir,
        resolvedCompiler.command,
        compileArgs,
        '',
        Math.max(timeoutSeconds, 30) * 1000,
        effectiveId,
        resolvedCompiler.env
      );

      if (compileResult.isStopped) {
        return {
          stdout: '',
          stderr: '',
          exitCode: null,
          isStopped: true,
          durationMs: Date.now() - startTime
        };
      }

      if (compileResult.exitCode !== 0) {
        let errMessage = compileResult.stderr || compileResult.stdout || 'Compilation failed.';
        if (compileResult.stderr?.includes('ENOENT') || compileResult.stderr?.includes('not found')) {
          errMessage = `${lang.name} compiler (${lang.compilerCommand}) not found.\nPlease make sure ${lang.compilerCommand} is available.`;
        }
        return {
          stdout: '',
          stderr: errMessage,
          exitCode: compileResult.exitCode,
          compilationError: errMessage,
          durationMs: Date.now() - startTime
        };
      }
    }

    // 2. Execution Step
    let runtimeCmd = lang.runtimeCommand;
    let runtimeArgs = lang.runtimeArgs(lang.fileName);
    let runtimeEnv: Record<string, string> | undefined = undefined;

    if (runtimeCmd === 'Main.exe') {
      runtimeCmd = outputExePath;
    } else {
      const resolvedRuntime = resolveToolchainExecutable(runtimeCmd);
      runtimeCmd = resolvedRuntime.command;
      runtimeEnv = resolvedRuntime.env;
    }

    if (cancelledExecutions.has(effectiveId)) {
      return { stdout: '', stderr: '', exitCode: null, isStopped: true, durationMs: Date.now() - startTime };
    }

    const execResult = await runProcessInDir(
      tempDir,
      runtimeCmd,
      runtimeArgs,
      input,
      timeoutSeconds * 1000,
      effectiveId,
      runtimeEnv
    );

    const wasCancelled = cancelledExecutions.has(effectiveId) || Boolean(execResult.isStopped);
    let stderrMsg = execResult.stderr;
    if (stderrMsg?.includes('ENOENT') || stderrMsg?.includes('not found')) {
      stderrMsg = `${lang.name} runtime (${lang.runtimeCommand}) not found.\nPlease make sure ${lang.runtimeCommand} is available.`;
    }

    return {
      stdout: execResult.stdout,
      stderr: wasCancelled ? '' : stderrMsg,
      exitCode: wasCancelled ? null : execResult.exitCode,
      isTimeout: execResult.isTimeout,
      isStopped: wasCancelled,
      durationMs: Date.now() - startTime
    };
  } finally {
    if (globalDefaultExecutionId === effectiveId) {
      globalDefaultExecutionId = null;
    }
    activeExecutions.delete(effectiveId);
    cancelledExecutions.delete(effectiveId);

    // Attempt cleanup of temp files
    try {
      setTimeout(() => {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }, 2000);
    } catch {}
  }
}

function runProcessInDir(
  cwd: string,
  command: string,
  args: string[],
  stdinInput: string,
  timeoutMs: number,
  executionId: string,
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number | null; isTimeout?: boolean; isStopped?: boolean }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let isTimeout = false;
    let finished = false;

    if (cancelledExecutions.has(executionId)) {
      return resolve({ stdout: '', stderr: '', exitCode: null, isStopped: true });
    }

    // Spawn directly without shell option where possible to prevent shell injection and avoid DEP0190
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: env ? (env as NodeJS.ProcessEnv) : process.env
    });

    if (cancelledExecutions.has(executionId)) {
      if (child.pid) {
        try {
          treeKill(child.pid, 'SIGKILL');
        } catch {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch {}
        }
      }
      return resolve({ stdout: '', stderr: '', exitCode: null, isStopped: true });
    }

    const timeoutHandle = setTimeout(() => {
      isTimeout = true;
      if (child.pid) {
        try {
          treeKill(child.pid, 'SIGKILL');
        } catch {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch {}
        }
      }
    }, timeoutMs);

    activeExecutions.set(executionId, {
      process: child,
      timeoutHandle
    });

    if (stdinInput && child.stdin) {
      try {
        child.stdin.write(stdinInput);
        child.stdin.end();
      } catch {}
    } else if (child.stdin) {
      try {
        child.stdin.end();
      } catch {}
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        activeExecutions.delete(executionId);
        const wasCancelled = cancelledExecutions.has(executionId);
        resolve({
          stdout,
          stderr: wasCancelled ? '' : (stderr ? `${stderr}\n${err.message}` : err.message),
          exitCode: wasCancelled ? null : 1,
          isTimeout,
          isStopped: wasCancelled
        });
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        activeExecutions.delete(executionId);
        const wasCancelled = cancelledExecutions.has(executionId);
        resolve({
          stdout,
          stderr: wasCancelled ? '' : stderr,
          exitCode: isTimeout || wasCancelled ? null : code,
          isTimeout,
          isStopped: wasCancelled
        });
      }
    });
  });
}
