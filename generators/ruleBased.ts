import { DiffContext, FileCategory } from '../git/diffAnalyzer';
import { CommitStyle } from '../config/settings';
import { StagedFile } from '../git/repository';

// ─── Conventional Commit Types ───────────────────────────────────────────────

const EMOJI_MAP: Record<string, string> = {
  feat: '✨',
  fix: '🐛',
  chore: '🔧',
  refactor: '♻️',
  docs: '📝',
  style: '💄',
  test: '✅',
  perf: '⚡',
  ci: '👷',
  build: '📦',
  revert: '⏪',
  deps: '📦',
};

// ─── Rule Inference ───────────────────────────────────────────────────────────

interface InferredType {
  type: string;
  scope: string | null;
  description: string;
  body: string | null;
}

function inferCommitType(ctx: DiffContext): InferredType {
  const { summary, fileGroups } = ctx;
  const categories = new Set(fileGroups.map(g => g.category));
  const allFiles = fileGroups.flatMap(g => g.files);

  // ── Pure deletions
  if (summary.deleted > 0 && summary.added === 0 && summary.modified === 0) {
    const scope = detectScope(allFiles);
    return {
      type: 'chore',
      scope,
      description: `remove ${describeFiles(allFiles.filter(f => f.status === 'deleted'))}`,
      body: null,
    };
  }

  // ── Pure docs
  if (categories.size === 1 && categories.has('docs')) {
    return {
      type: 'docs',
      scope: null,
      description: buildDocsDescription(allFiles),
      body: null,
    };
  }

  // ── Pure dependency updates
  if (categories.size === 1 && categories.has('deps')) {
    return {
      type: 'chore',
      scope: 'deps',
      description: buildDepsDescription(allFiles),
      body: null,
    };
  }

  // ── Pure CI changes
  if (categories.size === 1 && categories.has('ci')) {
    return {
      type: 'ci',
      scope: null,
      description: 'update pipeline configuration',
      body: null,
    };
  }

  // ── Pure config
  if (categories.size === 1 && categories.has('config')) {
    return {
      type: 'chore',
      scope: 'config',
      description: `update ${describeFiles(allFiles)} configuration`,
      body: null,
    };
  }

  // ── Pure styles
  if (categories.size === 1 && categories.has('styles')) {
    return {
      type: 'style',
      scope: detectScope(allFiles),
      description: 'update styles',
      body: null,
    };
  }

  // ── Pure tests
  if (categories.size === 1 && categories.has('test')) {
    const scope = detectScope(allFiles);
    const action = summary.added > 0 ? 'add' : 'update';
    return {
      type: 'test',
      scope,
      description: `${action} tests for ${describeFiles(allFiles)}`,
      body: null,
    };
  }

  // ── All new files (no modifications/deletions)
  if (summary.added > 0 && summary.modified === 0 && summary.deleted === 0) {
    const scope = detectScope(allFiles);
    const sourceFiles = allFiles.filter(f => f.status === 'added');
    return {
      type: 'feat',
      scope,
      description: `add ${describeNewFiles(sourceFiles)}`,
      body: null,
    };
  }

  // ── Only modifications (classic fix or refactor based on scale)
  if (summary.added === 0 && summary.deleted === 0 && summary.modified > 0) {
    const scope = detectScope(allFiles);
    const isSmall = summary.changeScope === 'trivial' || summary.changeScope === 'small';
    return {
      type: isSmall ? 'fix' : 'refactor',
      scope,
      description: isSmall
        ? `fix issue in ${describeFiles(allFiles)}`
        : `refactor ${describeFiles(allFiles)}`,
      body: null,
    };
  }

  // ── Mixed changes — use primary category as signal
  const dominantCategory = getDominantCategory(fileGroups);
  const scope = detectScope(allFiles);
  const type = categoryToType(dominantCategory, summary.linesAdded > summary.linesRemoved);

  return {
    type,
    scope,
    description: buildMixedDescription(allFiles, type),
    body: summary.changeScope === 'large'
      ? buildBody(fileGroups)
      : null,
  };
}

function getDominantCategory(fileGroups: { category: FileCategory; files: StagedFile[] }[]): FileCategory {
  const sorted = [...fileGroups].sort((a, b) => b.files.length - a.files.length);
  return sorted[0]?.category ?? 'other';
}

function categoryToType(cat: FileCategory, isAdditive: boolean): string {
  if (cat === 'test') return 'test';
  if (cat === 'docs') return 'docs';
  if (cat === 'ci') return 'ci';
  if (cat === 'deps') return 'chore';
  if (cat === 'config') return 'chore';
  if (cat === 'styles') return 'style';
  return isAdditive ? 'feat' : 'fix';
}

// ─── Scope Detection ──────────────────────────────────────────────────────────

function detectScope(files: StagedFile[]): string | null {
  if (files.length === 0) return null;

  // All files in same top-level directory
  const dirs = files.map(f => f.path.split('/')[0]);
  const unique = [...new Set(dirs)];

  if (unique.length === 1) {
    const dir = unique[0];
    // Skip generic top-level names
    const skip = new Set(['src', 'lib', 'app', 'packages', '.']);
    if (!skip.has(dir) && dir !== undefined) {
      return dir;
    }

    // Go one level deeper
    const subdirs = files.map(f => f.path.split('/').slice(0, 2).join('/'));
    const uniqueSub = [...new Set(subdirs)];
    if (uniqueSub.length === 1 && uniqueSub[0].includes('/')) {
      return uniqueSub[0].split('/')[1];
    }
  }

  if (files.length === 1) {
    const name = files[0].path.split('/').pop()?.replace(/\.(ts|js|py|rs|go|java)$/, '') ?? null;
    return name;
  }

  return null;
}

// ─── Description Builders ─────────────────────────────────────────────────────

function describeFiles(files: StagedFile[]): string {
  if (files.length === 0) return 'files';
  if (files.length === 1) {
    return stripExtension(basename(files[0].path));
  }
  if (files.length <= 3) {
    return files.map(f => stripExtension(basename(f.path))).join(', ');
  }
  return `${files.length} files`;
}

function describeNewFiles(files: StagedFile[]): string {
  if (files.length === 1) {
    return stripExtension(basename(files[0].path));
  }
  const names = files.slice(0, 2).map(f => stripExtension(basename(f.path)));
  const rest = files.length - 2;
  return rest > 0 ? `${names.join(', ')} and ${rest} more` : names.join(' and ');
}

function buildDocsDescription(files: StagedFile[]): string {
  if (files.length === 1) {
    const name = basename(files[0].path).toLowerCase();
    if (name === 'readme.md' || name === 'readme') return 'update README';
    return `update ${stripExtension(basename(files[0].path))} documentation`;
  }
  return 'update documentation';
}

function buildDepsDescription(files: StagedFile[]): string {
  const names = files.map(f => basename(f.path).toLowerCase());
  if (names.includes('package.json') || names.includes('package-lock.json')) {
    return 'update npm dependencies';
  }
  if (names.includes('cargo.toml') || names.includes('cargo.lock')) {
    return 'update Cargo dependencies';
  }
  if (names.includes('requirements.txt') || names.includes('pyproject.toml')) {
    return 'update Python dependencies';
  }
  if (names.includes('go.mod') || names.includes('go.sum')) {
    return 'update Go modules';
  }
  return 'update dependencies';
}

function buildMixedDescription(files: StagedFile[], type: string): string {
  const scope = detectScope(files);
  if (type === 'feat') {
    return scope ? `add ${scope} functionality` : 'implement new feature';
  }
  if (type === 'fix') {
    return scope ? `fix ${scope} issue` : 'fix bug';
  }
  if (type === 'refactor') {
    return scope ? `refactor ${scope}` : 'refactor code';
  }
  return scope ? `update ${scope}` : 'update implementation';
}

function buildBody(fileGroups: { category: FileCategory; files: StagedFile[] }[]): string {
  const lines: string[] = [];
  for (const group of fileGroups) {
    if (group.files.length === 0) continue;
    lines.push(`- ${group.category}: ${describeFiles(group.files)}`);
  }
  return lines.join('\n');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

// ─── Format Commit Message ────────────────────────────────────────────────────

function formatConventional(inferred: InferredType): string {
  const { type, scope, description, body } = inferred;
  const header = scope
    ? `${type}(${scope}): ${description}`
    : `${type}: ${description}`;
  return body ? `${header}\n\n${body}` : header;
}

function formatSimple(inferred: InferredType): string {
  // Capitalize first letter of description only
  const desc = inferred.description;
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

function formatDetailed(inferred: InferredType): string {
  const header = formatConventional(inferred);
  const bodyParts: string[] = [];

  if (!inferred.body) {
    bodyParts.push(`Type: ${inferred.type}`);
    if (inferred.scope) bodyParts.push(`Scope: ${inferred.scope}`);
  }

  return inferred.body ? header : `${header}\n\n${bodyParts.join('\n')}`;
}

function formatEmoji(inferred: InferredType): string {
  const emoji = EMOJI_MAP[inferred.type] ?? '🔨';
  const base = formatConventional(inferred);
  return `${emoji} ${base}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateRuleBased(ctx: DiffContext, style: CommitStyle): string {
  const inferred = inferCommitType(ctx);
  switch (style) {
    case 'conventional':
      return formatConventional(inferred);
    case 'simple':
      return formatSimple(inferred);
    case 'detailed':
      return formatDetailed(inferred);
    case 'emoji':
      return formatEmoji(inferred);
  }
}
