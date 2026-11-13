# Changelog

All notable changes to Auto Commit Gen will be documented in this file.

## [0.1.1] - 2026-11-13

### Changed

- Updated extension icon, no functional changes.

## [0.0.1] - 2026-05-19

### Added

- Generate commit messages from staged Git changes.
- Support AI-powered generation through OpenAI, Claude, and Ollama.
- Add hybrid generation with rule-based commit type detection and AI-generated descriptions.
- Fall back to rule-based commit message generation when AI is unavailable or offline.
- Support Conventional Commit types including `feat`, `fix`, `docs`, `style`, `refactor`, `test`, and `chore`.
- Add commit styles for conventional, simple, detailed, and emoji-prefixed messages.
- Add preview UI so users can review or edit suggestions before applying them.
- Add Generate & Commit flow with confirmation before running `git commit`.
- Add status bar and progress feedback while generating messages.
- Add keyboard shortcuts for generating messages and generating commits.
- Add helpful error messages with suggested fixes.
- Add telemetry opt-out setting, defaulting to `false`; the extension currently sends no telemetry.

### Technical Implementation

- Analyze staged Git diffs only; unstaged changes are ignored unless auto-stage is enabled.
- Use native `fetch` for AI provider calls instead of heavy provider SDK packages.
- Lazy-load AI provider modules so extension startup stays fast.
- Truncate large diffs based on the configurable `autoCommitGen.maxDiffLines` setting.
- Provide configurable AI timeout, hybrid fallback timeout, subject line length, and temperature settings.
- Support local-first usage through the default rule-based provider and optional Ollama integration.

### Known Issues

- The extension only generates messages from staged Git changes.
- AI-generated quality depends on the selected model and the amount of diff context available.
- Large diffs may be truncated, which can reduce message accuracy.
- Editing a generated detailed message currently focuses on the first line.
- API keys are stored in VS Code settings rather than VS Code SecretStorage.
