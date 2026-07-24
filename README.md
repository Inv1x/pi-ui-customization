# pi-ui-customization

A standalone UI package for [Pi](https://github.com/earendil-works/pi), targeting Pi 0.81.1.

It installs:

- a centered blue-gradient Pi logo and current-folder startup header;
- a two-line footer with folder, provider/model, thinking level, context use, session cost, generation speed, Git branch, and changed-file count;
- all other extensions' status lines below those two information rows;
- Up/Down selection for the background-terminal and subagent status rows, with Enter opening `/ps` or `/subagents-fleet`;
- the redundant startup `[Themes]` resource section hidden, matching the reference layout.

Model, context, cost, and Git data are collected directly by this package. The separate `model-info` and `git-info` extensions from the reference setup are not required. Git refreshes run asynchronously and quietly degrade outside a repository.

## Install

From this repository:

```bash
npm install
pi -e .
```

Or add the absolute package path to Pi's package settings.

## Configuration

No configuration file is required. The package uses the active Pi theme for footer text and a fixed blue RGB gradient for the logo. Git state refreshes at startup, after input/tool activity and turns, and every three seconds while the TUI session is open.

Because Pi supports one custom header and one custom footer owner, avoid loading another extension that calls `setHeader` or `setFooter`. Extensions using `setStatus` remain compatible and render below this package's footer information.

Press Down from the draft's last line to enter footer-status selection. Continue with Up/Down to move through statuses, press Enter to open the selected inspector, or Escape to cancel; Up from the first status returns to the draft. The selected row uses the active theme's blue `selectedBg` treatment. Navigation is implemented by the main editor component rather than a global terminal listener, so it does not intercept keys from overlays, autocomplete, selectors, or the inspectors themselves.

## Development

```bash
npm install
npm run check
npm run typecheck
npm test
npm pack --dry-run
```

The implementation uses Node promises and timers and has no Effect dependency.

## Credits

The overall layout and gradient treatment follow the `ui-customization`, `model-info`, and `git-info` extensions in [davis7dotsh/my-pi-setup](https://github.com/davis7dotsh/my-pi-setup).

## License

MIT
