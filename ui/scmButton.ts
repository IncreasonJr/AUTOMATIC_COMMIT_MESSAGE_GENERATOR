import * as vscode from 'vscode';

/**
 * Manages the status bar item that shows generation status.
 * The SCM title buttons are registered via package.json menus.
 * This handles the ephemeral status bar feedback during generation.
 */
export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = 'autoCommitGen.generate';
  }

  showGenerating(provider: string, detail = 'Analyzing staged changes'): void {
    this.statusBarItem.text = `$(loading~spin) Generating commit message...`;
    this.statusBarItem.tooltip = `Auto Commit Gen: ${detail} with ${provider}`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showProgress(detail: string): void {
    this.statusBarItem.text = `$(loading~spin) ${detail}`;
    this.statusBarItem.tooltip = `Auto Commit Gen: ${detail}`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showReady(): void {
    this.statusBarItem.text = `$(sparkle) Auto Commit`;
    this.statusBarItem.tooltip = 'Auto Commit Gen: Click to generate commit message';
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  showSuccess(message: string): void {
    const firstLine = message.split('\n')[0];
    const truncated = firstLine.length > 40 ? firstLine.slice(0, 37) + '...' : firstLine;
    this.statusBarItem.text = `$(check) ${truncated}`;
    this.statusBarItem.tooltip = `Committed: ${message}`;
    this.statusBarItem.show();

    // Reset after 4 seconds
    setTimeout(() => this.showReady(), 4000);
  }

  showError(msg: string): void {
    this.statusBarItem.text = `$(error) Auto Commit failed`;
    this.statusBarItem.tooltip = `Auto Commit Gen error: ${msg}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBarItem.show();

    // Reset after 5 seconds
    setTimeout(() => this.showReady(), 5000);
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
