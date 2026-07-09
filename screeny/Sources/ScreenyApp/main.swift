#if os(macOS)
import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private let configuration = ScreenyConfiguration.default

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.title = "Screeny"
        statusItem?.menu = buildMenu()
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Capture Full Screen", action: #selector(captureFullScreen), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Capture Area", action: #selector(captureArea), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Capture Window", action: #selector(captureWindow), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Scrolling Capture", action: #selector(captureScrolling), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Preferences…", action: #selector(openPreferences), keyEquivalent: ","))
        menu.addItem(NSMenuItem(title: "Quit Screeny", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        return menu
    }

    @objc private func captureFullScreen() { announcePendingCapture(.fullScreen) }
    @objc private func captureArea() { announcePendingCapture(.selectedArea) }
    @objc private func captureWindow() { announcePendingCapture(.selectedWindow) }
    @objc private func captureScrolling() { announcePendingCapture(.scrolling) }
    @objc private func openPreferences() { NSApp.activate(ignoringOtherApps: true) }

    private func announcePendingCapture(_ mode: CaptureMode) {
        NSLog("Screeny capture requested: \(mode.rawValue), autoCopy=\(configuration.autoCopyAfterCapture)")
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
#else
print("Screeny is a macOS menu bar screenshot app. Build on macOS to run the native app.")
#endif
