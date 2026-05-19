# Auto Commit Gen

AI-optional commit message generation inside VS Code.

Auto Commit Gen reads your staged Git changes, analyzes the diff, and suggests useful commit messages. It works offline with a rule-based generator by default, and can optionally use Ollama, OpenAI, Claude, or hybrid mode for AI-assisted suggestions.

## Features

- Rule-based generation by default, with no API key required
- Optional AI generation with Ollama, OpenAI, or Claude
- Hybrid mode that tries AI first and falls back to local rules
- Conventional, simple, detailed, and emoji commit styles
- Preview picker before applying a generated message
- Generate & Commit command with confirmation
- Status bar and window progress while generating
- Helpful error messages with suggested fixes
- Advanced settings for timeout, temperature, message length, and fallback behavior
- Telemetry setting that defaults off; the extension currently sends no telemetry

## Commands

| Command | Description |
|---|---|
| `Auto Commit Gen: Generate Commit Message` | Generate a message and place it in the Source Control input |
| `Auto Commit Gen: Generate & Commit` | Generate, preview, confirm, and run `git commit` |
| `Auto Commit Gen: Open Settings` | Open this extension's settings |

## Keyboard Shortcuts

| Command | Windows/Linux | macOS |
|---|---|---|
| Generate Commit Message | `Ctrl+Alt+G` | `Cmd+Alt+G` |
| Generate & Commit | `Ctrl+Alt+C` | `Cmd+Alt+C` |

## Quick Start

1. Open a Git repository in VS Code.
2. Make changes to files.
3. Stage your changes in Source Control or with `git add`.
4. Run `Auto Commit Gen: Generate Commit Message`.
5. Pick or edit a suggestion.
6. Commit normally, or use `Auto Commit Gen: Generate & Commit`.

If no staged changes are found, the extension can offer to stage all changes and generate again.

## Providers

### Rule-Based

Default mode. It does not call any AI service.

```json
"autoCommitGen.provider": "rule-based"
```

This mode uses file names, file categories, additions, deletions, and change size to produce a deterministic message.

### Ollama

Uses a local Ollama server.

```json
"autoCommitGen.provider": "ollama",
"autoCommitGen.ollamaEndpoint": "http://localhost:11434",
"autoCommitGen.ollamaModel": "llama3.2"
```

Start Ollama before generating:

```bash
ollama serve
```

### OpenAI

Uses the OpenAI API.

```json
"autoCommitGen.provider": "openai",
"autoCommitGen.openaiModel": "gpt-4o-mini",
"autoCommitGen.apiKey": "sk-..."
```

### Claude

Uses the Anthropic Claude API.

```json
"autoCommitGen.provider": "claude",
"autoCommitGen.claudeModel": "claude-haiku-4-5-20251001",
"autoCommitGen.apiKey": "sk-ant-..."
```

### Hybrid

Generates a rule-based message first, then tries the selected AI provider. If AI fails or times out, the rule-based message is still available.

```json
"autoCommitGen.provider": "hybrid",
"autoCommitGen.hybridProvider": "ollama"
```

`hybridProvider` can be `ollama`, `openai`, or `claude`.

## Commit Styles

| Style | Example |
|---|---|
| `conventional` | `feat(auth): add refresh token support` |
| `simple` | `Add refresh token support` |
| `detailed` | `feat(auth): add refresh token support` plus a body |
| `emoji` | `✨ feat(auth): add refresh token support` |

## Settings

| Setting | Default | Description |
|---|---|---|
| `autoCommitGen.provider` | `rule-based` | Message generation provider |
| `autoCommitGen.hybridProvider` | `ollama` | AI provider used by hybrid mode |
| `autoCommitGen.commitStyle` | `conventional` | Generated message format |
| `autoCommitGen.maxDiffLines` | `300` | Maximum diff lines sent to AI |
| `autoCommitGen.autoStage` | `false` | Run `git add -A` before generating |
| `autoCommitGen.showPreview` | `true` | Show suggestion picker before applying |
| `autoCommitGen.numSuggestions` | `3` | Number of AI suggestions to request |
| `autoCommitGen.subjectMaxLength` | `72` | Preferred max length for the first line |
| `autoCommitGen.aiTemperature` | `0.5` | AI creativity level |
| `autoCommitGen.aiTimeoutSeconds` | `30` | Max wait time for AI providers |
| `autoCommitGen.hybridTimeoutSeconds` | `20` | Max wait time before hybrid fallback |
| `autoCommitGen.confirmBeforeCommit` | `true` | Confirm before running `git commit` |
| `autoCommitGen.showFallbackWarnings` | `true` | Warn when hybrid mode falls back |
| `autoCommitGen.telemetryEnabled` | `false` | Reserved opt-in flag; no telemetry is currently sent |

Open settings from the Command Palette:

```text
Auto Commit Gen: Open Settings
```

## Privacy

Rule-based mode keeps everything local.

Ollama sends the diff only to your local Ollama server.

OpenAI and Claude modes send staged diff content to the selected external API provider. Review your staged changes before using cloud providers if your repository contains private or sensitive code.

Auto Commit Gen does not currently send telemetry. The `autoCommitGen.telemetryEnabled` setting defaults to `false` and is included so privacy-conscious users can verify telemetry behavior from VS Code settings.

AI provider code is lazy-loaded. The OpenAI, Claude, and Ollama generation modules are imported only when you run a command with an AI-backed provider.

## Local Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Lint:

```bash
npm run lint
```

Run locally:

1. Open this folder in VS Code.
2. Press `F5`.
3. In the Extension Development Host window, open a Git repository.
4. Stage changes and run one of the Auto Commit Gen commands.

## Troubleshooting

### No Git repository found

Open a folder that contains a `.git` directory, or initialize one:

```bash
git init
```

### No staged changes found

Stage files first:

```bash
git add <file>
```

Or enable:

```json
"autoCommitGen.autoStage": true
```

### Cannot connect to Ollama

Start Ollama and confirm the endpoint setting:

```bash
ollama serve
```

```json
"autoCommitGen.ollamaEndpoint": "http://localhost:11434"
```

### API key not set or invalid

Set `autoCommitGen.apiKey`, or switch back to rule-based mode.

### AI times out

Try one of these:

- Increase `autoCommitGen.aiTimeoutSeconds`
- Lower `autoCommitGen.maxDiffLines`
- Use `rule-based` provider
- Use `hybrid` provider for fallback behavior

## Current Status

The extension is functional for local testing and includes Marketplace metadata, an icon, a changelog, and an MIT license. Before publishing to the VS Code Marketplace, install the packaged VSIX locally and test the main flows across several repositories.

## Support

- Report bugs or request features on [GitHub Issues](https://github.com/CalebEdudziDelator/vscode-auto-commit-gen/issues).
- View the source code in the [GitHub repository](https://github.com/CalebEdudziDelator/vscode-auto-commit-gen).
- Open an issue if you find a bug, want to suggest a provider, or have an idea for improving commit message generation.

## License

MIT
