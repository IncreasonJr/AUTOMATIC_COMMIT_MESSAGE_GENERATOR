import * as vscode from 'vscode';

export interface PreviewResult {
  selected: string;
  cancelled: boolean;
}

interface MessageQuickPickItem extends vscode.QuickPickItem {
  commitMessage: string;
}

/**
 * Show a quick-pick with commit message suggestions.
 * Returns the selected message or null if cancelled.
 */
export async function showMessagePreview(
  messages: string[],
  provider: string,
  model: string
): Promise<PreviewResult> {
  if (messages.length === 0) {
    return { selected: '', cancelled: true };
  }

  // Single message — confirm or edit
  if (messages.length === 1) {
    const items: MessageQuickPickItem[] = [
      {
        label: '$(check) Use this message',
        description: messages[0],
        commitMessage: messages[0],
      },
      {
        label: '$(edit) Edit message',
        description: 'Open in input box to customize',
        commitMessage: '__EDIT__',
      },
      {
        label: '$(close) Cancel',
        description: '',
        commitMessage: '__CANCEL__',
      },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: `Auto Commit Gen — ${provider} (${model})`,
      placeHolder: messages[0],
      matchOnDescription: true,
    });

    if (!picked || picked.commitMessage === '__CANCEL__') {
      return { selected: '', cancelled: true };
    }
    if (picked.commitMessage === '__EDIT__') {
      return editMessage(messages[0]);
    }
    return { selected: picked.commitMessage, cancelled: false };
  }

  // Multiple suggestions — let user pick
  const suggestionItems: MessageQuickPickItem[] = messages.map((msg, i) => ({
    label: `$(git-commit) ${i === 0 ? '★ ' : ''}${msg.split('\n')[0]}`,
    description: msg.includes('\n') ? msg.split('\n').slice(1).join(' ').trim() : undefined,
    detail: i === 0 ? '  Recommended' : undefined,
    commitMessage: msg,
  }));

  const editItem: MessageQuickPickItem = {
    label: '$(edit) Type my own...',
    description: 'Open input box',
    commitMessage: '__EDIT__',
  };

  const separator: vscode.QuickPickItem = {
    label: '',
    kind: vscode.QuickPickItemKind.Separator,
  };

  const allItems = [...suggestionItems, separator as MessageQuickPickItem, editItem];

  const picked = await vscode.window.showQuickPick(allItems, {
    title: `Auto Commit Gen — ${provider} (${model}) · ${messages.length} suggestions`,
    placeHolder: 'Select a commit message or type your own',
    matchOnDescription: true,
    matchOnDetail: false,
  });

  if (!picked) {
    return { selected: '', cancelled: true };
  }

  if (picked.commitMessage === '__EDIT__') {
    return editMessage(messages[0]);
  }

  return { selected: picked.commitMessage, cancelled: false };
}

async function editMessage(defaultValue: string): Promise<PreviewResult> {
  // Show just the first line for editing (multi-line is tricky in input box)
  const firstLine = defaultValue.split('\n')[0];
  const edited = await vscode.window.showInputBox({
    title: 'Edit Commit Message',
    value: firstLine,
    prompt: 'Press Enter to confirm, Escape to cancel',
    validateInput: val => {
      if (!val || !val.trim()) return 'Commit message cannot be empty';
      if (val.length > 72) return `Message is ${val.length} chars — consider keeping under 72`;
      return null;
    },
  });

  if (edited === undefined) {
    return { selected: '', cancelled: true };
  }

  return { selected: edited.trim(), cancelled: false };
}

/**
 * Show a simple error notification with an action button.
 */
export function showError(message: string, ...actions: string[]): Thenable<string | undefined> {
  return vscode.window.showErrorMessage(`Auto Commit Gen: ${message}`, ...actions);
}

export function showInfo(message: string): void {
  vscode.window.showInformationMessage(`Auto Commit Gen: ${message}`);
}

export function showWarning(message: string): void {
  vscode.window.showWarningMessage(`Auto Commit Gen: ${message}`);
}
