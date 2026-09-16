import { spawn } from 'child_process';
import { LANGUAGE_CONFIGS } from './languages';
import { CompilerStatus } from './types';
import { resolveToolchainExecutable } from './toolchains';

export async function detectAllCompilers(): Promise<CompilerStatus[]> {
  const statuses: CompilerStatus[] = [];

  for (const lang of Object.values(LANGUAGE_CONFIGS)) {
    const check = lang.versionCheck;
    const resolved = resolveToolchainExecutable(check.command);

    try {
      const version = await runCommandForVersion(resolved.command, check.args, resolved.env);
      statuses.push({
        id: lang.id,
        name: lang.name,
        installed: true,
        version: version.trim().split('\n')[0]
      });
    } catch (err: any) {
      statuses.push({
        id: lang.id,
        name: lang.name,
        installed: false,
        error: `Not found: ${check.command}`
      });
    }
  }

  return statuses;
}

function runCommandForVersion(command: string, args: string[], env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const proc = spawn(command, args, {
        shell: false,
        env: env ? (env as NodeJS.ProcessEnv) : process.env
      });
      let output = '';
      let errOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errOutput += data.toString();
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('close', (code) => {
        const full = (output || errOutput).trim();
        if (
          code === 0 &&
          !full.includes('is not recognized') &&
          !full.includes('CommandNotFoundException') &&
          !full.includes('No such file')
        ) {
          resolve(full);
        } else {
          reject(new Error(`Command ${command} not found or failed: ${full}`));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}
