import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function execWithTimeout(
  command: string,
  timeoutMs: number,
  options?: { env?: NodeJS.ProcessEnv; cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = exec(
      command,
      {
        maxBuffer: 50 * 1024 * 1024,
        cwd: options?.cwd,
        env: { ...process.env, ...(options?.env || {}) },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      }
    );

    if (timeoutMs > 0) {
      setTimeout(() => {
        if (child) {
          child.kill("SIGKILL");
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        }
      }, timeoutMs);
    }
  });
}
