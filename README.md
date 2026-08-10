# pi-ui-customization

A standalone startup header and information-rich footer for [Pi](https://github.com/earendil-works/pi).

It installs:

- a centered blue-gradient Pi logo and current-folder startup header;
- a two-line footer with folder, provider/model, thinking level, context use, complete persisted session cost, generation speed, Git branch, and changed-file count;
- all other extensions' status lines below those two information rows;
- `Up`/`Down` selection for the background-terminal and subagent status rows, with `Enter` opening `/ps` or `/subagents-fleet` through a typed cross-extension event contract.

Model, context, cost, and Git data are collected directly by this package. The separate `model-info` and `git-info` extensions from the reference setup are not required. Pi's supported footer provider supplies the branch reactively; only changed-file count is polled, and Git failures quietly degrade outside a repository.

The cost includes persisted assistant usage, nested model usage reported by tools, compaction summaries, and branch summaries on the active branch.

## Requirements and compatibility

- Node.js 22.19 or newer.
- Tested floor: `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` 0.84.1.
- Both regular/main-screen and fullscreen/alternate-screen TUI modes are supported. Components honor every render width and do not depend on a concrete renderer.

Pi's core packages remain unbundled `peerDependencies` with `"*"` ranges, as required for Pi packages. Development and CI pin 0.84.1 to continuously test the documented floor.

## Install

Install the package persistently so `/reload` can rediscover it:

```bash
npm install
pi install /absolute/path/to/pi-ui-customization
```

Use `pi -e .` only for a temporary development smoke test. You can also add the absolute package path to Pi's package settings.

## Configuration and behavior

No configuration file is required. The package uses the active Pi theme for footer text and a fixed blue RGB gradient for the logo. Changed-file state refreshes at startup, after input/tool activity and turns, and every three seconds while a TUI session is open.

Because Pi supports one custom header and one custom footer owner, avoid loading another extension that calls `setHeader` or `setFooter`. Extensions using `setStatus` remain compatible and render below this package's footer information.

Press `Down` from the final visible line of the draft, including a non-empty draft, to enter footer-status selection. Continue with `Up`/`Down`, press `Enter` to open the selected inspector, or `Esc` to cancel; `Up` from the first status returns to the draft. Earlier lines in multiline or wrapped drafts retain `Down` for editor navigation. Autocomplete, remapped app keys, overlays, and an existing custom editor retain first ownership of input.

This package intentionally does **not** hide Pi's startup `[Themes]` resource section. Pi 0.84.1 has no public API for suppressing that section, and mutating private TUI children or matching rendered text is brittle across renderers and reloads.

On reload, new, resume, fork, and quit shutdown flows, the package clears timers and subscriptions, restores the previous editor factory when it still owns the editor, removes its header/footer, and resets the terminal title to `pi`. Pi does not expose the previous title, so exact third-party title restoration is not possible.

## Inspector event contracts

The package exports stable constants and payload interfaces from its main entry point:

```typescript
import {
  STATUS_ACTIVATION_EVENT,
  STATUS_OPTIONS_EVENT,
  type StatusActivationEvent,
  type StatusOptionsEvent,
  type UiCustomizationEventMap,
} from "@inv1x/pi-ui-customization";
```

A status-producing extension can preserve foreground/background colors while its row is selected:

```typescript
const options: StatusOptionsEvent = {
  key: "my-extension",
  preserveSelectedColors: true,
};
pi.events.emit(STATUS_OPTIONS_EVENT, options);
```

Emit `preserveSelectedColors: false` to remove the opt-in. Basic ANSI colors and semicolon-form 256/RGB SGR colors are retained. Other styling, OSC commands, cursor movement, and terminal controls are stripped.

Inspector owners can listen for activation:

```typescript
pi.events.on(STATUS_ACTIVATION_EVENT, (data) => {
  const activation = data as StatusActivationEvent;
  // Validate the session id, then open the matching inspector.
});
```

## Development

```bash
npm install
npm run validate
npm pack --dry-run
```

`prepack` runs the complete validation gate. CI tests the Node floor and a current Node release, then verifies the npm tarball.

## Versioning

Run `npm run changeset` for each user-facing change and commit the generated `.changeset/*.md` file. To prepare a release, run `npm run release:status` and then `npm run release:version`; Changesets consumes the pending files and updates `package.json`, `package-lock.json`, and `CHANGELOG.md`. These commands do not publish to npm or create a GitHub Release.

## Credits

The overall layout and gradient treatment follow the `ui-customization`, `model-info`, and `git-info` extensions in [davis7dotsh/my-pi-setup](https://github.com/davis7dotsh/my-pi-setup).

## License

MIT
