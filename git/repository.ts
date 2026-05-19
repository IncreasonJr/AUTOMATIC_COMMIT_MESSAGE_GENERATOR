import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface StagedFile {
  path: string;
  status: FileStatus;
  oldPath?: string; // for renames
}

export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'unknown';

export interface RepositoryInfo {
  rootPath: string;
  stagedFiles: StagedFile[];
  diff: string;
  branch: string;
  hasUnstaged: boolean;
}

function mapStatusChar(char: string): FileStatus {
  const map: Record<string, FileStatus> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    '?': 'untracked',
  };
  return map[char] ?? 'unknown';
}

async function exec(
  cwd: string,
  cmd: string,
  args: string[]
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git command failed: ${message}`);
  }
}

export async function getRepositoryInfo(
  workspaceRoot: string,
  maxDiffLines: number
): Promise<RepositoryInfo> {
  // Get branch name
  let branch = 'HEAD';
  try {
    branch = await exec(workspaceRoot, 'git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    // detached HEAD or empty repo — ignore
  }

  // Get staged files (--diff-filter=ACDMRT excludes unmerged)
  const statusOutput = await exec(workspaceRoot, 'git', [
    'diff',
    '--cached',
    '--name-status',
    '--diff-filter=ACDMRT',
  ]);

  const stagedFiles: StagedFile[] = [];

  if (statusOutput) {
    for (const line of statusOutput.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      const parts = line.split('\t');
      const statusChar = parts[0].charAt(0).toUpperCase();
      const status = mapStatusChar(statusChar);

      if (status === 'renamed' && parts.length >= 3) {
        stagedFiles.push({ path: parts[2], status, oldPath: parts[1] });
      } else if (parts[1]) {
        stagedFiles.push({ path: parts[1], status });
      }
    }
  }

  // Get staged diff (truncated)
  let diff = '';
  if (stagedFiles.length > 0) {
    const fullDiff = await exec(workspaceRoot, 'git', [
      'diff',
      '--cached',
      '--unified=3',
      '--no-color',
    ]);
    const lines = fullDiff.split('\n');
    diff = lines.slice(0, maxDiffLines).join('\n');
    if (lines.length > maxDiffLines) {
      diff += `\n\n... [diff truncated at ${maxDiffLines} lines, ${lines.length - maxDiffLines} more lines]`;
    }
  }

  // Check for unstaged changes
  let hasUnstaged = false;
  try {
    const unstagedOutput = await exec(workspaceRoot, 'git', [
      'diff',
      '--name-only',
    ]);
    hasUnstaged = unstagedOutput.length > 0;
  } catch {
    // ignore
  }

  return { rootPath: workspaceRoot, stagedFiles, diff, branch, hasUnstaged };
}

export async function stageAll(workspaceRoot: string): Promise<void> {
  await exec(workspaceRoot, 'git', ['add', '-A']);
}

export async function getWorkspaceRoot(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }

  // If multiple folders, try to find the one with git
  for (const folder of folders) {
    try {
      await exec(folder.uri.fsPath, 'git', ['rev-parse', '--git-dir']);
      return folder.uri.fsPath;
    } catch {
      // not a git repo
    }
  }

  return undefined;
}

export function getSCMInputBox(): vscode.SourceControlInputBox | undefined {
  // Access via the Git extension's public API
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension || !gitExtension.isActive) {
    return undefined;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const git = gitExtension.exports.getAPI(1) as any;
    if (git.repositories.length > 0) {
      return git.repositories[0].inputBox as vscode.SourceControlInputBox;
    }
  } catch {
    // Git extension API not available
  }
  return undefined;
}
