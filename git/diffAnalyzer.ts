import { StagedFile } from './repository';

export interface DiffContext {
  summary: ChangeSummary;
  fileGroups: FileGroup[];
  rawDiff: string;
}

export interface ChangeSummary {
  totalFiles: number;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  linesAdded: number;
  linesRemoved: number;
  primaryLanguage: string | null;
  changeScope: ChangeScope;
}

export type ChangeScope = 'trivial' | 'small' | 'medium' | 'large';

export interface FileGroup {
  category: FileCategory;
  files: StagedFile[];
}

export type FileCategory =
  | 'source'
  | 'test'
  | 'config'
  | 'docs'
  | 'styles'
  | 'assets'
  | 'ci'
  | 'deps'
  | 'other';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript/React',
  js: 'JavaScript',
  jsx: 'JavaScript/React',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  rb: 'Ruby',
  php: 'PHP',
  vue: 'Vue',
  svelte: 'Svelte',
};

function detectLanguage(files: StagedFile[]): string | null {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const ext = f.path.split('.').pop()?.toLowerCase() ?? '';
    const lang = EXTENSION_LANGUAGE_MAP[ext];
    if (lang) {
      counts[lang] = (counts[lang] ?? 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

function categorizeFile(filePath: string): FileCategory {
  const lower = filePath.toLowerCase();
  const name = lower.split('/').pop() ?? lower;

  // Deps
  if (name === 'package.json' || name === 'package-lock.json' || name === 'yarn.lock'
    || name === 'cargo.toml' || name === 'cargo.lock' || name === 'go.mod'
    || name === 'requirements.txt' || name === 'gemfile' || name === 'gemfile.lock'
    || name === 'poetry.lock' || name === 'pyproject.toml') {
    return 'deps';
  }

  // CI/CD
  if (lower.includes('.github/') || lower.includes('.gitlab-ci')
    || lower.includes('dockerfile') || lower.includes('docker-compose')
    || lower.includes('.circleci') || lower.includes('jenkinsfile')
    || lower.includes('.travis') || lower.includes('azure-pipelines')) {
    return 'ci';
  }

  // Config
  if (name.endsWith('.json') || name.endsWith('.yaml') || name.endsWith('.yml')
    || name.endsWith('.toml') || name.endsWith('.ini') || name.endsWith('.env')
    || name.startsWith('.') || name.endsWith('rc') || name.endsWith('.config.ts')
    || name.endsWith('.config.js') || name === 'tsconfig.json') {
    return 'config';
  }

  // Docs
  if (name.endsWith('.md') || name.endsWith('.mdx') || name.endsWith('.txt')
    || name.endsWith('.rst') || lower.includes('/docs/') || lower.includes('readme')) {
    return 'docs';
  }

  // Styles
  if (name.endsWith('.css') || name.endsWith('.scss') || name.endsWith('.sass')
    || name.endsWith('.less') || name.endsWith('.styl')) {
    return 'styles';
  }

  // Assets
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')
    || name.endsWith('.gif') || name.endsWith('.ico') || name.endsWith('.webp')
    || name.endsWith('.woff') || name.endsWith('.woff2') || name.endsWith('.ttf')) {
    return 'assets';
  }

  // Tests
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__')
    || lower.includes('/test/') || lower.includes('/tests/') || lower.includes('/spec/')) {
    return 'test';
  }

  // Source code
  const sourceExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'kt',
    'swift', 'cs', 'cpp', 'c', 'h', 'rb', 'php', 'vue', 'svelte'];
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (sourceExts.includes(ext)) {
    return 'source';
  }

  return 'other';
}

function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }
  return { added, removed };
}

function determineScope(files: StagedFile[], linesChanged: number): ChangeScope {
  const fileCount = files.length;
  if (fileCount <= 1 && linesChanged <= 10) {
    return 'trivial';
  }
  if (fileCount <= 3 && linesChanged <= 50) {
    return 'small';
  }
  if (fileCount <= 10 && linesChanged <= 200) {
    return 'medium';
  }
  return 'large';
}

export function analyzeDiff(stagedFiles: StagedFile[], rawDiff: string): DiffContext {
  const { added: linesAdded, removed: linesRemoved } = countDiffLines(rawDiff);

  const byStatus = {
    added: stagedFiles.filter(f => f.status === 'added').length,
    modified: stagedFiles.filter(f => f.status === 'modified').length,
    deleted: stagedFiles.filter(f => f.status === 'deleted').length,
    renamed: stagedFiles.filter(f => f.status === 'renamed').length,
  };

  const primaryLanguage = detectLanguage(stagedFiles);
  const changeScope = determineScope(stagedFiles, linesAdded + linesRemoved);

  const summary: ChangeSummary = {
    totalFiles: stagedFiles.length,
    ...byStatus,
    linesAdded,
    linesRemoved,
    primaryLanguage,
    changeScope,
  };

  // Group files by category
  const groupMap = new Map<FileCategory, StagedFile[]>();
  for (const file of stagedFiles) {
    const cat = categorizeFile(file.path);
    if (!groupMap.has(cat)) {
      groupMap.set(cat, []);
    }
    groupMap.get(cat)!.push(file);
  }

  const fileGroups: FileGroup[] = Array.from(groupMap.entries()).map(([category, files]) => ({
    category,
    files,
  }));

  return { summary, fileGroups, rawDiff };
}

export function buildPromptContext(ctx: DiffContext): string {
  const { summary, fileGroups, rawDiff } = ctx;

  const lines: string[] = [
    `Files changed: ${summary.totalFiles} (${summary.added} added, ${summary.modified} modified, ${summary.deleted} deleted, ${summary.renamed} renamed)`,
    `Lines: +${summary.linesAdded} -${summary.linesRemoved}`,
  ];

  if (summary.primaryLanguage) {
    lines.push(`Primary language: ${summary.primaryLanguage}`);
  }

  for (const group of fileGroups) {
    const filePaths = group.files.map(f => {
      if (f.status === 'renamed' && f.oldPath) {
        return `  ${f.oldPath} → ${f.path} (renamed)`;
      }
      return `  ${f.path} (${f.status})`;
    });
    lines.push(`\n[${group.category}]`);
    lines.push(...filePaths);
  }

  if (rawDiff) {
    lines.push('\n--- DIFF ---');
    lines.push(rawDiff);
    lines.push('--- END DIFF ---');
  }

  return lines.join('\n');
}
