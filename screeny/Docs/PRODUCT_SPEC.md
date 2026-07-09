# Screeny Product Spec

## Goal

Build a native macOS menu bar screenshot tool for fast capture, annotation, pinning, and export workflows. The product should cover Apple's built-in screenshot basics while adding convenience features commonly expected from dedicated tools such as CleanShot X.

## Non-goals for the first phase

- App Store submission.
- Cross-platform support.
- Cloud account system.
- Team sharing or collaboration.

## Core workflows

1. User triggers a global shortcut or selects a menu bar action.
2. Screeny opens a capture overlay or executes the requested capture mode.
3. The user optionally annotates the image.
4. Screeny saves a PNG, copies the image to the clipboard when enabled, and optionally shows a pinned/floating preview.

## MVP feature checklist

| Area | Features |
| --- | --- |
| Capture | full screen, area, window, timed, scrolling |
| Annotation | arrows, shapes, line, text, blur, highlight, crop, undo/redo |
| Export | PNG, auto-copy, configurable save directory, background canvas, torn edges |
| Menu bar | quick actions, recent captures, preferences, quit |
| Pinning | pin captures above other windows and drag them around |
| Shortcuts | configurable shortcuts for primary capture modes |
| Preferences | save path, clipboard behavior, launch at login, shortcut bindings |

## Native macOS implementation notes

- Use SwiftUI for preferences and lightweight panels.
- Use AppKit for menu bar lifecycle, overlays, floating pinned windows, and lower-level screen integration.
- Use ScreenCaptureKit where appropriate for modern capture APIs, with fallbacks where required.
- Use `NSPasteboard` for auto-copy behavior.
- Use `NSStatusItem` for the menu bar entry.
- Store preferences in `UserDefaults` initially.

## Open questions for tomorrow's testing

- Which macOS versions need support beyond macOS 14?
- Should scrolling capture target browsers first, generic scroll views first, or both?
- Should the annotation editor appear automatically or only when requested?
- What default shortcuts should be reserved?
- Should captures be saved immediately, only copied, or both by default?
