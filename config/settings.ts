import * as vscode from 'vscode';

export type Provider = 'rule-based' | 'ollama' | 'openai' | 'claude' | 'hybrid';
export type AIProvider = 'ollama' | 'openai' | 'claude';
export type CommitStyle = 'conventional' | 'simple' | 'detailed' | 'emoji';

export interface ExtensionConfig {
  provider: Provider;
  hybridProvider: AIProvider;
  ollamaEndpoint: string;
  ollamaModel: string;
  openaiModel: string;
  claudeModel: string;
  apiKey: string;
  commitStyle: CommitStyle;
  maxDiffLines: number;
  autoStage: boolean;
  showPreview: boolean;
  numSuggestions: number;
  subjectMaxLength: number;
  aiTemperature: number;
  aiTimeoutSeconds: number;
  hybridTimeoutSeconds: number;
  confirmBeforeCommit: boolean;
  showFallbackWarnings: boolean;
  telemetryEnabled: boolean;
}

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('autoCommitGen');
  return {
    provider: cfg.get<Provider>('provider', 'rule-based'),
    hybridProvider: cfg.get<AIProvider>('hybridProvider', 'ollama'),
    ollamaEndpoint: cfg.get<string>('ollamaEndpoint', 'http://localhost:11434'),
    ollamaModel: cfg.get<string>('ollamaModel', 'llama3.2'),
    openaiModel: cfg.get<string>('openaiModel', 'gpt-4o-mini'),
    claudeModel: cfg.get<string>('claudeModel', 'claude-haiku-4-5-20251001'),
    apiKey: cfg.get<string>('apiKey', ''),
    commitStyle: cfg.get<CommitStyle>('commitStyle', 'conventional'),
    maxDiffLines: cfg.get<number>('maxDiffLines', 300),
    autoStage: cfg.get<boolean>('autoStage', false),
    showPreview: cfg.get<boolean>('showPreview', true),
    numSuggestions: cfg.get<number>('numSuggestions', 3),
    subjectMaxLength: cfg.get<number>('subjectMaxLength', 72),
    aiTemperature: cfg.get<number>('aiTemperature', 0.5),
    aiTimeoutSeconds: cfg.get<number>('aiTimeoutSeconds', 30),
    hybridTimeoutSeconds: cfg.get<number>('hybridTimeoutSeconds', 20),
    confirmBeforeCommit: cfg.get<boolean>('confirmBeforeCommit', true),
    showFallbackWarnings: cfg.get<boolean>('showFallbackWarnings', true),
    telemetryEnabled: cfg.get<boolean>('telemetryEnabled', false),
  };
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:your-publisher-id.auto-commit-gen'
  );
}
