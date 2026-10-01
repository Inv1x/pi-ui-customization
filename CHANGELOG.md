# Changelog

## 0.2.0

### Minor Changes

- Require Pi 0.87.1, preserve embedded working/recovery indicators through editor composition, include standalone model usage in cost totals, and show a waiting-for-user marker during extension prompts. Refresh idle cache-warming costs and test session replacement, prompt lifecycles, and indicator opt-outs.

### Patch Changes

- df0d636: Allow footer-status navigation from the final visible line of non-empty drafts.
- b71de2a: Adopt Changesets for version and changelog management.

All notable changes to this project are documented here.

## Unreleased

### Fixed

- Allowed `Down` from the final visible line of a non-empty draft to enter footer-status navigation without stealing multiline or wrapped-line movement.

### Changed

- Modernized against Pi and Pi TUI 0.84.1 with Node.js 22.19 as the tested runtime floor.
- Switched thinking display to `ctx.thinkingLevel` and Git branch display to Pi's reactive footer provider.
- Limited Git polling to changed-file count.
- Included persisted nested-tool, compaction, and branch-summary usage in displayed session cost.
- Removed private TUI tree traversal previously used to hide the Themes resource section.
- Formalized exported inspector event constants and payload types.
- Added lifecycle, renderer-width, editor-composition, and package validation coverage.

### Added

- Repository/npm metadata, CI, a prepack validation gate, and compatibility documentation.
