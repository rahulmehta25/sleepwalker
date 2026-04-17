import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Create an isolated $HOME for a test. Returns the path and a cleanup fn.
 *
 * Lib code reads ~/.sleepwalker/ via os.homedir(). By overriding HOME we make
 * the libs operate against a temp directory without modifying real user state.
 */
export function makeTempHome(): { home: string; restore: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sleepwalker-test-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  return {
    home,
    restore: () => {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

/**
 * Force os.homedir() to return our temp dir. Node's os.homedir() reads $HOME
 * on POSIX systems, so setting process.env.HOME is sufficient.
 */
export function ensureSleepwalkerDir(home: string): string {
  const dir = path.join(home, ".sleepwalker");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
