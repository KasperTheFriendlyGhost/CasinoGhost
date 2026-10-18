import AVFoundation

/// Table sounds, played through a small pool of audio players so cards can overlap.
/// Uses the ambient category: sounds respect the silent switch and mix with music.
@MainActor
final class SoundPlayer {
    static let shared = SoundPlayer()

    var enabled = true
    var volume: Float = 0.7 {
        didSet { engine.mainMixerNode.outputVolume = volume }
    }

    private let engine = AVAudioEngine()
    private var nodes: [AVAudioPlayerNode] = []
    private var buffers: [String: AVAudioPCMBuffer] = [:]
    private var next = 0
    private var ready = false

    private init() {}

    private func start() {
        guard !ready else { return }
        ready = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let names = ["card0", "card1", "card2", "card3", "chip0", "chip1", "chip2", "shuffle", "win", "blackjack", "mistake", "flip"]
        var format: AVAudioFormat?
        for n in names {
            guard let url = Bundle.main.url(forResource: n, withExtension: "wav"),
                  let file = try? AVAudioFile(forReading: url),
                  let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))
            else { continue }
            try? file.read(into: buf)
            buffers[n] = buf
            format = file.processingFormat
        }
        guard let format else { return }
        for _ in 0..<8 {
            let node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            nodes.append(node)
        }
        engine.mainMixerNode.outputVolume = volume
        try? engine.start()
    }

    private func play(_ name: String, after delay: Double = 0) {
        guard enabled else { return }
        if delay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.play(name) }
            return
        }
        start()
        guard let buf = buffers[name], !nodes.isEmpty else { return }
        if !engine.isRunning { try? engine.start() }
        let node = nodes[next]
        next = (next + 1) % nodes.count
        node.stop()
        node.scheduleBuffer(buf, at: nil, options: [])
        node.play()
    }

    func card(after delay: Double = 0) { play("card\(Int.random(in: 0...3))", after: delay) }
    func chip(after delay: Double = 0) { play("chip\(Int.random(in: 0...2))", after: delay) }
    func flip() { play("flip") }
    func shuffle() { play("shuffle") }
    func win(after delay: Double = 0) { play("win", after: delay) }
    func blackjack(after delay: Double = 0) { play("blackjack", after: delay) }
    func mistake() { play("mistake") }
}
