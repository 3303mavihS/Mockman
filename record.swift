import Foundation
import AVFoundation

// Usage: record <output.wav>
// Records from the default mic (native format) until Enter is pressed
// (or SIGINT/SIGTERM), then closes the file cleanly.

let args = CommandLine.arguments
guard args.count > 1 else {
    FileHandle.standardError.write("usage: record <output.wav>\n".data(using: .utf8)!)
    exit(2)
}
let outputURL = URL(fileURLWithPath: args[1])

// --- Microphone permission (one-time TCC prompt, attributed to the terminal) ---
switch AVCaptureDevice.authorizationStatus(for: .audio) {
case .authorized:
    break
case .notDetermined:
    let sem = DispatchSemaphore(value: 0)
    AVCaptureDevice.requestAccess(for: .audio) { _ in sem.signal() }
    sem.wait()
    guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
        FileHandle.standardError.write("mic access denied\n".data(using: .utf8)!)
        exit(4)
    }
default:
    FileHandle.standardError.write("mic access denied — enable it in System Settings → Privacy & Security → Microphone for your terminal app\n".data(using: .utf8)!)
    exit(4)
}

let engine = AVAudioEngine()
let inputNode = engine.inputNode
let inputFormat = inputNode.outputFormat(forBus: 0)

var audioFile: AVAudioFile?
do {
    // Write the mic's native format directly; the Speech framework
    // transcriber accepts any AVAudioFile-readable format.
    audioFile = try AVAudioFile(forWriting: outputURL, settings: inputFormat.settings)
} catch {
    FileHandle.standardError.write("cannot open output file: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
}

var framesWritten: Int64 = 0

inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
    do {
        try audioFile?.write(from: buffer)
        framesWritten += Int64(buffer.frameLength)
    } catch {
        FileHandle.standardError.write("write error: \(error.localizedDescription)\n".data(using: .utf8)!)
    }
}

do {
    try engine.start()
} catch {
    FileHandle.standardError.write("engine start failed: \(error.localizedDescription)\n".data(using: .utf8)!)
    exit(1)
}

FileHandle.standardError.write("recording… press Enter to stop\n".data(using: .utf8)!)

let startedAt = Date()
var drainBuf = [UInt8](repeating: 0, count: 256)

func stopAndExit() {
    inputNode.removeTap(onBus: 0)
    engine.stop()
    audioFile = nil // forces close/flush of the WAV header
    FileHandle.standardError.write("saved \(framesWritten) frames\n".data(using: .utf8)!)
    exit(0)
}

// Stop on Enter from stdin (also handles pipe EOF).
// Grace period: input already buffered when recording starts (e.g. an Enter
// pressed while the interviewer was still speaking) is stale — drain and
// ignore anything arriving in the first second.
let stdinSource = DispatchSource.makeReadSource(fileDescriptor: STDIN_FILENO, queue: .main)
stdinSource.setEventHandler {
    if Date().timeIntervalSince(startedAt) < 1.0 {
        _ = read(STDIN_FILENO, &drainBuf, drainBuf.count)
        return
    }
    stdinSource.cancel()
    stopAndExit()
}
stdinSource.resume()

// Stop on SIGINT/SIGTERM so the orchestrator can kill us cleanly.
for sig in [SIGINT, SIGTERM] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { stopAndExit() }
    source.resume()
}

dispatchMain()
