# Screeny

Screeny is a planned private macOS menu bar screenshot utility inspired by CleanShot X and Apple's built-in screenshot tools. The first iteration focuses on a lightweight capture workflow with fast keyboard shortcuts, automatic clipboard support, PNG output, pinning, and practical annotations.

> Repository visibility: this project is intended to live in a private repository. No App Store packaging is planned for the initial phase.

## Product direction

Screeny should feel native on macOS and stay out of the way until needed from the menu bar or global shortcuts.

### Planned MVP

- Menu bar app with capture actions and preferences.
- Capture modes:
  - Full screen.
  - Selected area.
  - Selected window.
  - Timed capture.
  - Scrolling capture for long pages or documents.
- Annotation basics:
  - Arrow, rectangle, ellipse, line, text, blur/pixelate, highlight, and crop.
  - Undo/redo while editing.
- Output and workflow:
  - Save as PNG.
  - Auto-copy after capture.
  - Configurable save location.
  - Optional floating thumbnail/pin-to-screen previews.
  - Background canvas options for exports.
  - Torn-edge effect for partial screenshots.
- Shortcuts:
  - Configurable global shortcuts for common capture modes.
  - Avoid conflicts with macOS defaults where possible.

### Later ideas

- Screen recording and GIF export.
- OCR and text extraction.
- Cloud sharing targets.
- Preset export styles.
- Recent captures history.
- Multi-display workflow polish.

## Technical starting point

This folder contains an initial Swift Package skeleton for the macOS app. The Linux fallback entry point exists only so CI or this development container can validate package structure before native macOS implementation work continues.

## Local development

```bash
swift test
swift run Screeny
```

On macOS, the executable starts the native menu bar app. On non-macOS platforms, it prints a short message explaining that Screeny is macOS-only.
