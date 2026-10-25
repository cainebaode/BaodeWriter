import AppKit

let destination = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
NSColor(calibratedRed: 0.035, green: 0.047, blue: 0.063, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 52, y: 52, width: 920, height: 920), xRadius: 212, yRadius: 212).fill()
NSColor(calibratedRed: 0.969, green: 0.965, blue: 0.941, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 256, y: 202, width: 512, height: 620), xRadius: 32, yRadius: 32).fill()
NSColor(calibratedRed: 0.839, green: 0.953, blue: 0.435, alpha: 1).setFill()
let bookmark = NSBezierPath()
bookmark.move(to: NSPoint(x: 602, y: 822)); bookmark.line(to: NSPoint(x: 686, y: 822))
bookmark.line(to: NSPoint(x: 686, y: 650)); bookmark.line(to: NSPoint(x: 644, y: 677))
bookmark.line(to: NSPoint(x: 602, y: 650)); bookmark.close(); bookmark.fill()
NSColor(calibratedRed: 0.08, green: 0.10, blue: 0.12, alpha: 1).setFill()
for (y, width) in [(584.0, 252.0), (496.0, 336.0), (408.0, 284.0)] {
    NSBezierPath(roundedRect: NSRect(x: 344, y: y, width: width, height: 18), xRadius: 9, yRadius: 9).fill()
}
NSColor(calibratedRed: 1, green: 0.412, blue: 0.369, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 344, y: 290, width: 48, height: 48)).fill()
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination))
