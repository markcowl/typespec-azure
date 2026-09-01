import { execFile } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, relative, resolve } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface CheckoutResult {
  /** Absolute path to the checked-out worktree root. */
  worktreePath: string;
  /**
   * Remove the worktree and its temporary directory. Callers MUST call this
   * (ideally in a `finally` block) once analysis of the checked-out revision
   * is complete.
   */
  cleanup: () => Promise<void>;
}

/**
 * Return the absolute path of the git repository's working-tree root for
 * `anyPathInRepo`, which may be a file or a directory.
 */
export async function getRepoRoot(anyPathInRepo: string): Promise<string> {
  const dir = await directoryOf(anyPathInRepo);
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: dir });
  return resolve(stdout.trim());
}

/**
 * Resolve `commitish` (a SHA, branch, tag, or other git revision expression)
 * to a full commit SHA within the git repository containing `repoPath`.
 */
export async function resolveCommitish(commitish: string, repoPath: string): Promise<string> {
  const dir = await directoryOf(repoPath);
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--verify", `${commitish}^{commit}`],
    { cwd: dir },
  );
  return stdout.trim();
}

/**
 * Check out `commitish` into an isolated, disposable git worktree so that a
 * base revision can be analyzed without mutating the caller's working tree
 * or index.
 *
 * This uses `git worktree add --detach`, which is safe to run alongside other
 * operations against the same repository — unlike an in-place
 * `git checkout <sha> -- <path>` (as CI workflows have historically done),
 * which mutates the shared working tree AND index for the affected path and
 * must be manually, carefully unwound afterward.
 *
 * @param commitish - Any git revision expression (SHA, branch, tag, etc.)
 * @param repoPath - Any path inside the git repository to check out from.
 * @returns The worktree root path and a cleanup function. Callers MUST call
 *   `cleanup()` (ideally in a `finally` block) to remove the worktree,
 *   otherwise it will be left on disk as an orphaned temp directory and a
 *   registered git worktree.
 */
export async function checkoutRevision(
  commitish: string,
  repoPath: string,
): Promise<CheckoutResult> {
  const repoRoot = await getRepoRoot(repoPath);
  const sha = await resolveCommitish(commitish, repoRoot);
  const worktreeRoot = resolve(await mkdtemp(join(tmpdir(), "typespec-breaking-change-base-")));

  // `git worktree add` refuses to create a worktree at a path that already
  // exists (even if empty), so remove the directory mkdtemp just created and
  // let `worktree add` recreate it.
  await rm(worktreeRoot, { recursive: true, force: true });

  try {
    await execFileAsync("git", ["worktree", "add", "--detach", worktreeRoot, sha], {
      cwd: repoRoot,
    });
  } catch (error) {
    throw new Error(
      `Failed to check out revision "${commitish}" (resolved to ${sha}) as a git worktree: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let cleanedUp = false;
  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", worktreeRoot], {
        cwd: repoRoot,
      });
    } catch {
      // The worktree metadata may already be gone or corrupted (e.g. the
      // process was killed mid-checkout) — fall back to a plain directory
      // removal, then let `git worktree prune` reconcile stale metadata.
      await rm(worktreeRoot, { recursive: true, force: true });
      await execFileAsync("git", ["worktree", "prune"], { cwd: repoRoot }).catch(() => undefined);
    }
  };

  return { worktreePath: worktreeRoot, cleanup };
}

/**
 * Given a path within a checked-out revision's worktree and the corresponding
 * path in the caller's original working tree (both must live in the same
 * repository), compute the equivalent path inside `worktreePath`.
 */
export async function mapPathIntoWorktree(
  originalPath: string,
  repoPath: string,
  worktreePath: string,
): Promise<string> {
  const repoRoot = await getRepoRoot(repoPath);
  const relativePath = relative(repoRoot, resolve(originalPath));
  return join(worktreePath, relativePath);
}

async function directoryOf(path: string): Promise<string> {
  const resolved = resolve(path);
  const stats = await stat(resolved);
  return stats.isDirectory() ? resolved : dirname(resolved);
}
