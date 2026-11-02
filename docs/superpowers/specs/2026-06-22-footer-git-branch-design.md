# Footer Git Branch Design

## Intent and scope
Match the user's active Oh My Zsh candy theme beside the footer directory: green `[branch]` when clean, green `[branch ` and `]` surrounding a red `*` when dirty. No branch means no indicator. Keep changed-file count on line two, without duplicating the branch. Startup header and title remain unchanged.

## Constraints
Preserve existing uncommitted changes. Reuse Pi's reactive branch provider and existing changed-file refresh. Sanitize branch labels and retain width-safe ANSI rendering. Use standard ANSI green/red, matching candy rather than theme-dependent success/error colors. No dependencies or shell execution.

## Approaches
Approved: render candy styling using existing Git state. Alternative: run zsh's prompt function; rejected because it loads shell configuration and duplicates Git polling. This matches candy's appearance, not all Oh My Zsh repository configuration and detached-HEAD resolution behavior.

## Approval
User approved the footer-only design and removal of the duplicate second-line branch.
