import fs from 'fs';
import path from 'path';

/**
 * Resolved executable information including custom local environment variables
 * (such as local PATH prepending for GCC/G++ support binaries).
 */
export interface ResolvedTool {
  /** Command or absolute path to the executable to spawn */
  command: string;
  /** Custom environment variables to pass to child_process.spawn (isolated to child only) */
  env?: Record<string, string>;
  /** Whether the tool was resolved from a bundled toolchain directory */
  isBundled: boolean;
}

/**
 * Known logical tool commands used across our language definitions.
 */
export type ToolCommand = 'gcc' | 'g++' | 'javac' | 'java' | 'python' | 'node';

/**
 * Locates the root directory for toolchains.
 * 
 * Production (Packaged Electron):
 *   process.resourcesPath/toolchains
 * 
 * Development (Unpackaged Electron / Node Dev Server):
 *   <project_root>/toolchains
 */
export function getToolchainsRootDir(): string {
  // Check if running inside packaged Electron
  const isPackaged = typeof process !== 'undefined' && 
    (Boolean((process as any).resourcesPath) && (process as any).defaultApp === false || (process as any).isPackaged === true);

  if (isPackaged && (process as any).resourcesPath) {
    return path.join((process as any).resourcesPath, 'toolchains');
  }

  // Development: Check relative to current working directory or directory traversal
  const devCandidate = path.resolve(process.cwd(), 'toolchains');
  if (fs.existsSync(devCandidate)) {
    return devCandidate;
  }

  // In case cwd is inside dist-electron or a subfolder:
  const subCandidate = path.resolve(__dirname, '..', '..', 'toolchains');
  if (fs.existsSync(subCandidate)) {
    return subCandidate;
  }

  // Default fallback to project root toolchains
  return devCandidate;
}

/**
 * Resolve a toolchain command to either its bundled executable (if found) or
 * fall back to the system command name (resolved via system PATH).
 * 
 * Supported:
 * - C: gcc -> toolchains/gcc/bin/gcc.exe
 * - C++: g++ -> toolchains/gcc/bin/g++.exe
 * - Java: javac -> toolchains/java/bin/javac.exe
 * - Java: java -> toolchains/java/bin/java.exe
 * - Python: python -> toolchains/python/python.exe
 * - JavaScript: node -> toolchains/node/node.exe
 */
export function resolveToolchainExecutable(cmd: string): ResolvedTool {
  const root = getToolchainsRootDir();

  // Normalize command name without .exe
  const baseCmd = cmd.replace(/\.exe$/i, '').toLowerCase();

  switch (baseCmd) {
    case 'gcc':
    case 'g++': {
      const gccBinDir = path.join(root, 'gcc', 'bin');
      const exeName = baseCmd === 'gcc' ? 'gcc.exe' : 'g++.exe';
      const bundledExe = path.join(gccBinDir, exeName);

      if (fs.existsSync(bundledExe)) {
        // Child-process isolated PATH with bundled GCC bin prepended
        const localPath = gccBinDir + path.delimiter + (process.env.PATH || '');
        return {
          command: bundledExe,
          env: {
            ...process.env as Record<string, string>,
            PATH: localPath
          },
          isBundled: true
        };
      }
      break;
    }

    case 'javac':
    case 'java': {
      const javaBinDir = path.join(root, 'java', 'bin');
      const exeName = baseCmd === 'javac' ? 'javac.exe' : 'java.exe';
      const bundledExe = path.join(javaBinDir, exeName);

      if (fs.existsSync(bundledExe)) {
        const javaHome = path.join(root, 'java');
        return {
          command: bundledExe,
          env: {
            ...process.env as Record<string, string>,
            JAVA_HOME: javaHome,
            PATH: javaBinDir + path.delimiter + (process.env.PATH || '')
          },
          isBundled: true
        };
      }
      break;
    }

    case 'python':
    case 'python3': {
      const pythonDir = path.join(root, 'python');
      const bundledExe = path.join(pythonDir, 'python.exe');

      if (fs.existsSync(bundledExe)) {
        return {
          command: bundledExe,
          env: {
            ...process.env as Record<string, string>,
            PATH: pythonDir + path.delimiter + (process.env.PATH || '')
          },
          isBundled: true
        };
      }
      break;
    }

    case 'node': {
      const nodeDir = path.join(root, 'node');
      const bundledExe = path.join(nodeDir, 'node.exe');

      if (fs.existsSync(bundledExe)) {
        return {
          command: bundledExe,
          env: {
            ...process.env as Record<string, string>,
            PATH: nodeDir + path.delimiter + (process.env.PATH || '')
          },
          isBundled: true
        };
      }
      break;
    }

    default:
      break;
  }

  // Fallback: Use system PATH executable (cmd unchanged, inherited process.env)
  return {
    command: cmd,
    isBundled: false
  };
}
