import * as vscode from 'vscode';
import { getConfig, openSettings } from './config/settings';
import {
  getWorkspaceRoot,
  getRepositoryInfo,
  getSCMInputBox,
  stageAll,
} from './git/repository';
import { analyzeDiff } from './git/diffAnalyzer';
import { generateRuleBased } from './generators/ruleBased';
import { showMessagePreview, showError, showInfo, showWarning } from './ui/messagePreview';
import { StatusBarManager } from './ui/scmButton';

// ─── Core Generation Flow ─────────────────────────────────────────────────────

interface GenerationResult {
  messages: string[];
  provider: string;
  model: string;
}

function helpfulError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('no git repository')) {
    return `${message} Open a folder that contains a .git directory or run "git init" first.`;
  }
  if (lower.includes('no staged changes')) {
    return `${message} Stage files in Source Control, run "git add <file>", or enable autoCommitGen.autoStage.`;
  }
  if (lower.includes('cannot connect to ollama')) {
    return `${message} Start Ollama with "ollama serve", check autoCommitGen.ollamaEndpoint, or switch provider to rule-based.`;
  }
  if (lower.includes('api key not set')) {
    return `${message} Add autoCommitGen.apiKey in settings, or switch provider to rule-based/ollama.`;
  }
  if (lower.includes('invalid api key')) {
    return `${message} Recheck autoCommitGen.apiKey and make sure the selected provider matches the key.`;
  }
  if (lower.includes('timed out')) {
    return `${message} Increase autoCommitGen.aiTimeoutSeconds, reduce autoCommitGen.maxDiffLines, or use rule-based mode.`;
  }
  if (lower.includes('git command failed')) {
    return `${message} Confirm Git is installed, the folder is a Git repository, and there are staged changes.`;
  }

  return message;
}

async function runWithProgress<T>(
  title: string,
  task: () => Promise<T>
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title,
      cancellable: false,
    },
    async progress => {
      progress.report({ message: 'Analyzing staged changes...' });
      return task();
    }
  );
}

async function generateMessages(): Promise<GenerationResult | null> {
  const config = getConfig();

  // Resolve workspace root
  const rootPath = await getWorkspaceRoot();
  if (!rootPath) {
    await showError(helpfulError('No Git repository found in workspace.'), 'Open Settings');
    return null;
  }

  // Auto-stage if configured
  if (config.autoStage) {
    try {
      await stageAll(rootPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await showError(helpfulError(`Failed to stage changes: ${msg}`), 'Open Settings');
      return null;
    }
  }

  // Get repo info
  let repoInfo;
  try {
    repoInfo = await getRepositoryInfo(rootPath, config.maxDiffLines);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await showError(helpfulError(`Failed to read git repository: ${msg}`), 'Open Settings');
    return null;
  }

  // Guard: nothing staged
  if (repoInfo.stagedFiles.length === 0) {
    const action = await showError(
      helpfulError('No staged changes found.'),
      repoInfo.hasUnstaged ? 'Stage All & Generate' : 'OK'
    );

    if (action === 'Stage All & Generate') {
      try {
        await stageAll(rootPath);
        repoInfo = await getRepositoryInfo(rootPath, config.maxDiffLines);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await showError(helpfulError(`Failed to stage: ${msg}`), 'Open Settings');
        return null;
      }
    } else {
      return null;
    }
  }

  // Analyze diff
  const diffCtx = analyzeDiff(repoInfo.stagedFiles, repoInfo.diff);

  // Generate based on provider
  switch (config.provider) {
    case 'rule-based': {
      const message = generateRuleBased(diffCtx, config.commitStyle);
      return { messages: [message], provider: 'Rule-based', model: 'deterministic' };
    }

    case 'hybrid': {
      const { generateHybrid } = await import('./generators/hybrid.js');
      const result = await generateHybrid(diffCtx, config, (reason: string) => {
        if (config.showFallbackWarnings) {
          showWarning(`AI unavailable (${reason}), using rule-based fallback.`);
        }
      });
      return {
        messages: result.messages,
        provider: result.provider,
        model: result.model,
      };
    }

    case 'ollama':
    case 'openai':
    case 'claude': {
      const { callAIProvider } = await import('./generators/aiProvider.js');
      const result = await callAIProvider(diffCtx, config);
      return {
        messages: result.messages,
        provider: result.provider,
        model: result.model,
      };
    }

    default:
      await showError(`Unknown provider: ${config.provider}`);
      return null;
  }
}

// ─── Apply Message to SCM Input Box ──────────────────────────────────────────

function applyMessage(message: string): boolean {
  const inputBox = getSCMInputBox();
  if (inputBox) {
    inputBox.value = message;
    // Focus the SCM view so user sees the message
    vscode.commands.executeCommand('workbench.view.scm');
    return true;
  }

  // Fallback: copy to clipboard and notify
  vscode.env.clipboard.writeText(message);
  showInfo(`Copied to clipboard: "${message.split('\n')[0]}"`);
  return false;
}

async function executeCommit(message: string, rootPath: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const lines = message.split('\n');
  const args = ['commit'];
  for (const line of lines) {
    args.push('-m', line);
  }

  try {
    await execFileAsync('git', args, { cwd: rootPath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  statusBar.showReady();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // ── Command: Generate only
  const generateCmd = vscode.commands.registerCommand(
    'autoCommitGen.generate',
    async () => {
      const config = getConfig();
      statusBar.showGenerating(config.provider);

      try {
        const result = await runWithProgress(
          'Auto Commit Gen: generating commit message',
          () => {
            statusBar.showProgress('Generating commit message...');
            return generateMessages();
          }
        );
        if (!result) {
          statusBar.showReady();
          return;
        }

        if (config.showPreview && result.messages.length > 0) {
          const preview = await showMessagePreview(
            result.messages,
            result.provider,
            result.model
          );

          if (preview.cancelled || !preview.selected) {
            statusBar.showReady();
            return;
          }

          applyMessage(preview.selected);
          statusBar.showReady();
        } else if (result.messages.length > 0) {
          applyMessage(result.messages[0]);
          statusBar.showReady();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const friendly = helpfulError(msg);
        statusBar.showError(friendly);
        const action = await showError(friendly, 'Open Settings');
        if (action === 'Open Settings') {
          await openSettings();
        }
      }
    }
  );

  // ── Command: Generate & Commit
  const generateAndCommitCmd = vscode.commands.registerCommand(
    'autoCommitGen.generateAndCommit',
    async () => {
      const config = getConfig();
      statusBar.showGenerating(config.provider);

      const rootPath = await getWorkspaceRoot();
      if (!rootPath) {
        statusBar.showReady();
        await showError(helpfulError('No Git repository found.'), 'Open Settings');
        return;
      }

      try {
        const result = await runWithProgress(
          'Auto Commit Gen: generating commit message',
          () => {
            statusBar.showProgress('Generating commit message...');
            return generateMessages();
          }
        );
        if (!result) {
          statusBar.showReady();
          return;
        }

        // Always show preview before committing
        const preview = await showMessagePreview(
          result.messages,
          result.provider,
          result.model
        );

        if (preview.cancelled || !preview.selected) {
          statusBar.showReady();
          return;
        }

        const message = preview.selected;

        // Confirm before committing
        if (config.confirmBeforeCommit) {
          const confirm = await vscode.window.showWarningMessage(
            `Commit with: "${message.split('\n')[0]}"?`,
            { modal: false },
            'Commit',
            'Cancel'
          );

          if (confirm !== 'Commit') {
            // Still put message in input box
            applyMessage(message);
            statusBar.showReady();
            return;
          }
        }

        statusBar.showProgress('Committing changes...');
        await executeCommit(message, rootPath);
        statusBar.showSuccess(message);
        showInfo(`Committed: "${message.split('\n')[0]}"`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const friendly = helpfulError(`Commit failed: ${msg}`);
        statusBar.showError(friendly);
        await showError(friendly, 'Open Settings');
      }
    }
  );

  // ── Command: Open Settings
  const configureCmd = vscode.commands.registerCommand(
    'autoCommitGen.configure',
    () => openSettings()
  );

  context.subscriptions.push(generateCmd, generateAndCommitCmd, configureCmd);

  // Show one-time privacy notice on first install
  const isFirstRun = context.globalState.get<boolean>('autoCommitGen.firstRun', true);
  if (isFirstRun) {
    context.globalState.update('autoCommitGen.firstRun', false);
    vscode.window.showInformationMessage(
      'Auto Commit Gen is ready. Rule-based mode keeps diffs local; AI providers send staged diffs to the selected service. Telemetry is off and no telemetry is currently sent.',
      'Open Settings',
      'Dismiss'
    ).then(action => {
      if (action === 'Open Settings') {
        openSettings();
      }
    });
  }
}

export function deactivate(): void {
  // Nothing to clean up (subscriptions handle disposal)
}
