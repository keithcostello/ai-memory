# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-02-06

### Added

- Initial release: ai-memory CLI for scaffolding persistent AI memory in Cursor IDE
- Commands: init, status, archive, help, version, completions
- Options: --force (init), --dry-run (archive), --json (status)
- Shell completions for bash, zsh, fish
- Memory tiers: Tier 1 (always-on), Tier 2 (on-demand log), Tier 3 (project-scoped), Tier 4 (sprint-scoped)
- memory-strategies.json for configurable retention and archive behavior
- AGENTS.md for cross-tool compatibility
