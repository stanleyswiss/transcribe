import Foundation

public enum CaptureMode: String, CaseIterable, Codable, Sendable {
    case fullScreen
    case selectedArea
    case selectedWindow
    case timed
    case scrolling
}

public struct ScreenyConfiguration: Equatable, Codable, Sendable {
    public var autoCopyAfterCapture: Bool
    public var defaultOutputFormat: String
    public var pinsFloatAboveWindows: Bool
    public var showsMenuBarIcon: Bool

    public init(
        autoCopyAfterCapture: Bool = true,
        defaultOutputFormat: String = "png",
        pinsFloatAboveWindows: Bool = true,
        showsMenuBarIcon: Bool = true
    ) {
        self.autoCopyAfterCapture = autoCopyAfterCapture
        self.defaultOutputFormat = defaultOutputFormat
        self.pinsFloatAboveWindows = pinsFloatAboveWindows
        self.showsMenuBarIcon = showsMenuBarIcon
    }

    public static let `default` = ScreenyConfiguration()
}

public struct ShortcutBinding: Equatable, Codable, Sendable {
    public var mode: CaptureMode
    public var displayName: String
    public var defaultShortcut: String

    public init(mode: CaptureMode, displayName: String, defaultShortcut: String) {
        self.mode = mode
        self.displayName = displayName
        self.defaultShortcut = defaultShortcut
    }

    public static let defaults: [ShortcutBinding] = [
        ShortcutBinding(mode: .fullScreen, displayName: "Capture Full Screen", defaultShortcut: "⌘⇧1"),
        ShortcutBinding(mode: .selectedArea, displayName: "Capture Selected Area", defaultShortcut: "⌘⇧2"),
        ShortcutBinding(mode: .selectedWindow, displayName: "Capture Window", defaultShortcut: "⌘⇧3"),
        ShortcutBinding(mode: .timed, displayName: "Timed Capture", defaultShortcut: "⌘⇧4"),
        ShortcutBinding(mode: .scrolling, displayName: "Scrolling Capture", defaultShortcut: "⌘⇧5")
    ]
}
