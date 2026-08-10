# Changelog

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
