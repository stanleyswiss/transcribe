import Testing
@testable import ScreenyApp

@Test func defaultConfigurationMatchesMVPWorkflow() {
    let configuration = ScreenyConfiguration.default

    #expect(configuration.autoCopyAfterCapture)
    #expect(configuration.defaultOutputFormat == "png")
    #expect(configuration.pinsFloatAboveWindows)
    #expect(configuration.showsMenuBarIcon)
}

@Test func defaultShortcutsCoverAllCaptureModes() {
    let configuredModes = Set(ShortcutBinding.defaults.map(\.mode))

    #expect(configuredModes == Set(CaptureMode.allCases))
}
