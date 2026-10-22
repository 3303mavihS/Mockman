import Foundation
import Speech
import AVFoundation

// Usage: transcribe <audio-file>
// Prints the transcript (plain text) to stdout.

func run() async throws {
    guard CommandLine.arguments.count > 1 else {
        FileHandle.standardError.write("usage: transcribe <audio-file>\n".data(using: .utf8)!)
        exit(2)
    }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])

    let locale = Locale(identifier: "en-US")
    let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)

    // Make sure on-device model assets for this locale are installed.
    // Status .supported means "can run, but assets may need downloading".
    let status = await AssetInventory.status(forModules: [transcriber])
    if status == .supported,
       let installRequest = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        FileHandle.standardError.write("downloading on-device speech assets (one-time)...\n".data(using: .utf8)!)
        try await installRequest.downloadAndInstall()
    }

    let audioFile = try AVAudioFile(forReading: url)

    // Empty capture: nothing to do. (SpeechAnalyzer otherwise never
    // terminates its results stream on zero-length audio.)
    guard audioFile.length > 0 else {
        exit(0)
    }

    let analyzer = SpeechAnalyzer(modules: [transcriber])

    // Collect results while analysis runs.
    let collector = Task { () -> String in
        var out = ""
        for try await result in transcriber.results {
            out += String(result.text.characters)
        }
        return out
    }

    try await analyzer.start(inputAudioFile: audioFile, finishAfterFile: true)
    let transcript = try await collector.value
    print(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
}

let semaphore = DispatchSemaphore(value: 0)
Task {
    do {
        try await run()
    } catch {
        FileHandle.standardError.write("error: \(error.localizedDescription)\n".data(using: .utf8)!)
    }
    semaphore.signal()
}
semaphore.wait()
