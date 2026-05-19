import { DiffContext, buildPromptContext } from '../git/diffAnalyzer';
import { ExtensionConfig, CommitStyle } from '../config/settings';

export interface AIResult {
  messages: string[];
  provider: string;
  model: string;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(
  style: CommitStyle,
  numSuggestions: number,
  subjectMaxLength: number
): string {
  const styleGuide: Record<CommitStyle, string> = {
    conventional: `Use Conventional Commits format: <type>(<scope>): <description>
Types: feat, fix, chore, refactor, docs, style, test, perf, ci, build
- scope is optional but use it when clear (e.g. feat(auth): ...)
- description is lowercase imperative ("add", "fix", "update", not "added", "fixed")
- optionally add a blank line + body for complex changes`,
    simple: `Write a single imperative sentence starting with a verb.
Capitalize first word. No period. Max ${subjectMaxLength} chars.
Example: "Add user authentication middleware"`,
    detailed: `Use Conventional Commits format for the header.
Always include a body paragraph (2-4 sentences) explaining WHY the change was made,
what problem it solves, and any notable implementation details.`,
    emoji: `Use Conventional Commits with an emoji prefix:
✨ feat, 🐛 fix, 🔧 chore, ♻️ refactor, 📝 docs, 💄 style, ✅ test, ⚡ perf, 👷 ci, 📦 build
Example: ✨ feat(auth): add JWT refresh token support`,
  };

  return `You are an expert git commit message writer. Analyze the provided git diff and generate ${numSuggestions} distinct, high-quality commit message suggestion${numSuggestions > 1 ? 's' : ''}.

STYLE GUIDE:
${styleGuide[style]}

RULES:
- Be specific and meaningful — describe WHAT changed and WHY when obvious from context
- Max ${subjectMaxLength} chars for the first line
- Do NOT say "update files" or vague summaries
- Infer intent from the actual code changes
- Each suggestion should be meaningfully different (vary scope, type, or emphasis)

OUTPUT FORMAT:
Return ONLY the commit message${numSuggestions > 1 ? 's' : ''}, one per line, no numbering, no explanations, no markdown.
${numSuggestions > 1 ? `Separate each message with a single blank line.` : ''}`;
}

function buildUserPrompt(ctx: DiffContext): string {
  return `Here are the staged changes:\n\n${buildPromptContext(ctx)}`;
}

function timeoutSignal(seconds: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1, seconds) * 1000);
}

function parseMessages(raw: string, numSuggestions: number): string[] {
  // Split on blank lines, clean each
  const blocks = raw.split(/\n\n+/).map(b => b.trim()).filter(Boolean);

  if (blocks.length >= numSuggestions) {
    return blocks.slice(0, numSuggestions);
  }

  // Fallback: split on newlines if blank-line split didn't produce enough
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  // Strip numbering like "1." or "1)"
  const cleaned = lines.map(l => l.replace(/^\d+[.)]\s*/, ''));
  return cleaned.slice(0, numSuggestions);
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

async function callOllama(
  ctx: DiffContext,
  config: ExtensionConfig
): Promise<AIResult> {
  const {
    ollamaEndpoint,
    ollamaModel,
    commitStyle,
    numSuggestions,
    subjectMaxLength,
    aiTemperature,
    aiTimeoutSeconds,
  } = config;
  const url = `${ollamaEndpoint.replace(/\/$/, '')}/api/chat`;

  const body = {
    model: ollamaModel,
    stream: false,
    messages: [
      { role: 'system', content: buildSystemPrompt(commitStyle, numSuggestions, subjectMaxLength) },
      { role: 'user', content: buildUserPrompt(ctx) },
    ],
    options: {
      temperature: aiTemperature,
      top_p: 0.9,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(aiTimeoutSeconds),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      throw new Error(`Cannot connect to Ollama at ${ollamaEndpoint}. Is it running? (ollama serve)`);
    }
    throw new Error(`Ollama request failed: ${msg}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama returned ${response.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as any;
  const content: string = data?.message?.content ?? data?.response ?? '';

  if (!content) {
    throw new Error('Ollama returned an empty response');
  }

  return {
    messages: parseMessages(content, numSuggestions),
    provider: 'Ollama',
    model: ollamaModel,
  };
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(
  ctx: DiffContext,
  config: ExtensionConfig
): Promise<AIResult> {
  const {
    apiKey,
    openaiModel,
    commitStyle,
    numSuggestions,
    subjectMaxLength,
    aiTemperature,
    aiTimeoutSeconds,
  } = config;

  if (!apiKey) {
    throw new Error('OpenAI API key not set. Add it to autoCommitGen.apiKey in settings.');
  }

  const body = {
    model: openaiModel,
    temperature: aiTemperature,
    messages: [
      { role: 'system', content: buildSystemPrompt(commitStyle, numSuggestions, subjectMaxLength) },
      { role: 'user', content: buildUserPrompt(ctx) },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(aiTimeoutSeconds),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('OpenAI: Invalid API key. Check autoCommitGen.apiKey in settings.');
    }
    throw new Error(`OpenAI returned ${response.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as any;
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return {
    messages: parseMessages(content, numSuggestions),
    provider: 'OpenAI',
    model: openaiModel,
  };
}

// ─── Claude ───────────────────────────────────────────────────────────────────

async function callClaude(
  ctx: DiffContext,
  config: ExtensionConfig
): Promise<AIResult> {
  const {
    apiKey,
    claudeModel,
    commitStyle,
    numSuggestions,
    subjectMaxLength,
    aiTemperature,
    aiTimeoutSeconds,
  } = config;

  if (!apiKey) {
    throw new Error('Anthropic API key not set. Add it to autoCommitGen.apiKey in settings.');
  }

  const body = {
    model: claudeModel,
    max_tokens: 1024,
    temperature: aiTemperature,
    system: buildSystemPrompt(commitStyle, numSuggestions, subjectMaxLength),
    messages: [
      { role: 'user', content: buildUserPrompt(ctx) },
    ],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(aiTimeoutSeconds),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('Claude: Invalid API key. Check autoCommitGen.apiKey in settings.');
    }
    throw new Error(`Claude returned ${response.status}: ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await response.json() as any;
  const content: string = data?.content?.[0]?.text ?? '';

  if (!content) {
    throw new Error('Claude returned an empty response');
  }

  return {
    messages: parseMessages(content, numSuggestions),
    provider: 'Claude',
    model: claudeModel,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function callAIProvider(
  ctx: DiffContext,
  config: ExtensionConfig
): Promise<AIResult> {
  switch (config.provider) {
    case 'ollama':
      return callOllama(ctx, config);
    case 'openai':
      return callOpenAI(ctx, config);
    case 'claude':
      return callClaude(ctx, config);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
