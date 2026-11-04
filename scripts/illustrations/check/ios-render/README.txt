The iOS app's own drawing code, compiled for the Mac, for the render check.
Render/ also needs, copied from the iOS repo at the commit under test:
- PeachMark.swift, with `private struct PartsLayer` made `struct PartsLayer`
- Crown.swift: `private struct Crown: Shape` from App/CompletionCard.swift, `private` dropped
- ArchiveCellFace.swift: `struct ArchiveCellFace` from App/ArchiveSheet.swift
- Theme.swift: Cute's `static let x = Color(hex:)` lines and `extension Color { init(hex:) }`
  from App/CuteTheme.swift, which itself imports UIKit
and a symlink PeachEngine -> <iOS repo>/Sources/PeachEngine.
