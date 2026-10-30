// GridHub の Mac のアプリ（CONTRACTS §72）。大工の縄張り。
// AppKit と WebKit だけで、Node の GridHub（gridhub app。§68）が 127.0.0.1 に配る画面を、ネイティブの窓（WKWebView）に映す。
// Swift が受け持つのは、窓・メニュー・フォルダのダイアログ・node を探して起こすこと・終わるときに止めることだけ。画面は web 側。
// 組み立ては mac/build.sh（swiftc だけ。Xcode は要らない）: swiftc -swift-version 5 -parse-as-library mac/GridHub.swift
import AppKit
import WebKit

@main
enum GridHubApp {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) {
            app.run()
        }
    }
}

// MARK: - node を探す（Finder から開いたアプリの PATH は短いので、ログインシェルの PATH を使う）

/// 別のスレッドから読み書きする小さな箱
final class Box<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value
    init(_ value: Value) { self.value = value }
    func get() -> Value { lock.lock(); defer { lock.unlock() }; return value }
    func update(_ change: (inout Value) -> Void) { lock.lock(); change(&value); lock.unlock() }
}

enum Lookup {
    /// コマンドを走らせて stdout を返す。timeout 秒で打ち切る（シェルの設定が入力を待っても固まらない）
    static func run(_ executable: String, _ arguments: [String], environment: [String: String]? = nil, timeout: TimeInterval = 8) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        if let environment { process.environment = environment }
        process.standardInput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        let pipe = Pipe()
        process.standardOutput = pipe
        let collected = Box(Data())
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            if !chunk.isEmpty { collected.update { $0.append(chunk) } }
        }
        let done = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in done.signal() }
        do {
            try process.run()
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            return nil
        }
        if done.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            _ = done.wait(timeout: .now() + 1)
        }
        // 終わりぎわの出力が届くのを少しだけ待つ（最後まで読むのは待たない。シェルの子が管を握ったままでも固まらない）
        usleep(150_000)
        pipe.fileHandleForReading.readabilityHandler = nil
        return String(data: collected.get(), encoding: .utf8)
    }

    /// ユーザーの既定のシェル（getpwuid の pw_shell。無ければ SHELL、それも無ければ zsh）
    static func userShell() -> String {
        if let entry = getpwuid(getuid()), let shell = entry.pointee.pw_shell {
            let path = String(cString: shell)
            if !path.isEmpty, FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        if let shell = ProcessInfo.processInfo.environment["SHELL"], !shell.isEmpty { return shell }
        return "/bin/zsh"
    }

    /// ログインシェルの PATH に、よくある場所を足したもの
    static func loginPath() -> String {
        let shell = userShell()
        let marker = "__GRIDHUB_PATH__"
        let script = "printf '\(marker)%s\(marker)' \"$PATH\""
        var found: String?
        // .zshrc に PATH を書く人（nvm など）もいるので、まず対話のログインシェル、だめならログインシェルだけ
        for flags in [["-l", "-i", "-c"], ["-l", "-c"]] {
            if let out = run(shell, flags + [script]),
               let start = out.range(of: marker),
               let end = out.range(of: marker, range: start.upperBound..<out.endIndex) {
                found = String(out[start.upperBound..<end.lowerBound])
                break
            }
        }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var dirs = (found ?? ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
        dirs += ["/opt/homebrew/bin", "/usr/local/bin", "\(home)/.local/bin", "\(home)/.volta/bin", "\(home)/.claude/local", "\(home)/.npm-global/bin"]
        dirs += nvmBins(home: home)
        dirs += ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        var seen = Set<String>()
        return dirs.filter { !$0.isEmpty && seen.insert($0).inserted }.joined(separator: ":")
    }

    /// nvm で入れた node（新しい版から）
    static func nvmBins(home: String) -> [String] {
        let root = "\(home)/.nvm/versions/node"
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: root) else { return [] }
        return names.sorted { $0.compare($1, options: .numeric) == .orderedDescending }.map { "\(root)/\($0)/bin" }
    }

    static func find(_ name: String, in path: String) -> String? {
        for dir in path.split(separator: ":") {
            let file = "\(dir)/\(name)"
            if FileManager.default.isExecutableFile(atPath: file) { return file }
        }
        return nil
    }

    /// node の版（例 "22.4.0"）
    static func nodeVersion(_ node: String, path: String) -> String? {
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = path
        let out = run(node, ["-p", "process.versions.node"], environment: environment, timeout: 15)
        return out?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func major(_ version: String) -> Int {
        Int(version.split(separator: ".").first ?? "") ?? 0
    }
}

struct Found: Sendable {
    let path: String
    let node: String?
    let version: String?
}

// MARK: - ことば（冒険のことば / 開発のことば。CONTRACTS §76.7）
// 盤面の右上のボタンで選んだことばを、web 側が postMessage({type: "words"}) で知らせてくる。アプリは UserDefaults に覚え、
// 自分の窓の字（フォルダのダイアログ・起動中と失敗の知らせ）に使い、次に開くページには window.__gridhubWords で渡す。

enum Words: String {
    case game
    case dev

    static let key = "GridHubWords"

    static func remembered() -> Words {
        Words(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .game
    }

    func remember() {
        UserDefaults.standard.set(rawValue, forKey: Words.key)
    }

    /// いまのことばの字。game は冒険のことば、dev は開発のことば
    func say(_ game: String, _ dev: String) -> String {
        self == .dev ? dev : game
    }
}

// MARK: - アプリ

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: Process?
    /// 命綱: gridhub app の標準入力。アプリが生きているあいだは閉じない。アプリが落ちれば OS が閉じ、サーバーも止まる（§68.2）
    private var lifeline: Pipe?
    private var buffer = Data()
    private var lines: [String] = []
    private var homeURL: URL?
    private var stopping = false
    /// いまのことば（§76.7）。web 側から知らされるたびに覚え直す
    private var words = Words.remembered()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        start()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServer()
    }

    // MARK: 窓とメニュー

    private func buildWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "gridhub")
        installWordsScript(configuration.userContentController)
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 880),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "GridHub"
        window.minSize = NSSize(width: 720, height: 520)
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("GridHub")
        window.makeKeyAndOrderFront(nil)
    }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: "GridHub")
        appMenu.addItem(withTitle: "GridHub について", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "GridHub を隠す", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "GridHub を終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "編集")
        edit.addItem(withTitle: "取り消す", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "やり直す", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "カット", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "コピー", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "ペースト", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "すべてを選択", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "表示")
        let home = NSMenuItem(title: "はじめの画面", action: #selector(goHome(_:)), keyEquivalent: "1")
        home.target = self
        view.addItem(home)
        let reload = NSMenuItem(title: "読み込み直す", action: #selector(reload(_:)), keyEquivalent: "r")
        reload.target = self
        view.addItem(reload)
        viewItem.submenu = view
        main.addItem(viewItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "ウインドウ")
        windowMenu.addItem(withTitle: "しまう", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "閉じる", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }

    /// ページを描く前に、覚えていることばを window.__gridhubWords に入れる（board/boot.js と board/words.js が読む。§76.7）
    private func installWordsScript(_ controller: WKUserContentController) {
        controller.removeAllUserScripts()
        let script = WKUserScript(source: "window.__gridhubWords = '\(words.rawValue)';", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        controller.addUserScript(script)
    }

    /// web 側で選ばれたことばを覚え、自分の字と次のページに効かせる
    private func wordsChanged(_ next: Words) {
        guard next != words else { return }
        words = next
        words.remember()
        installWordsScript(webView.configuration.userContentController)
    }

    @objc private func goHome(_ sender: Any?) {
        if let homeURL { webView.load(URLRequest(url: homeURL)) }
    }

    @objc private func reload(_ sender: Any?) {
        if homeURL == nil { start() } else { webView.reload() }
    }

    // MARK: node と gridhub app

    private func start() {
        stopServer()
        stopping = false
        showMessage(title: words.say("GridHub をひらいています…", "GridHub を起動しています…"),
                    body: words.say("<p>盤面を配る GridHub（Node.js）を起こしています。</p>", "<p>盤面のサーバー（Node.js）を起動しています。</p>"), retry: false)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let path = Lookup.loginPath()
            let node = Lookup.find("node", in: path)
            let version = node.flatMap { Lookup.nodeVersion($0, path: path) }
            let found = Found(path: path, node: node, version: version)
            Task { @MainActor in
                self?.launch(found)
            }
        }
    }

    private func launch(_ found: Found) {
        guard let node = found.node else {
            showMessage(title: "Node.js が見つかりません", body: nodeHelp(nil), retry: true)
            return
        }
        guard let version = found.version, Lookup.major(version) >= 22 else {
            showMessage(title: "Node.js が古いようです", body: nodeHelp(found.version), retry: true)
            return
        }
        guard let resources = Bundle.main.resourceURL else { return }
        let gridhub = resources.appendingPathComponent("gridhub/bin/gridhub.js").path
        guard FileManager.default.fileExists(atPath: gridhub) else {
            showMessage(title: "アプリの中身が足りません", body: "<p><code>\(escape(gridhub))</code> がありません。<code>sh mac/build.sh</code> で組み立て直してください。</p>", retry: false)
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [gridhub, "app", "--port", "0", "--lifeline"]
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = found.path
        environment["GRIDHUB_APP"] = "1"
        process.environment = environment
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
        let input = Pipe()
        let output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        process.standardError = output
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            Task { @MainActor in
                self?.serverSaid(chunk)
            }
        }
        process.terminationHandler = { [weak self] ended in
            let status = ended.terminationStatus
            let id = ObjectIdentifier(ended)
            Task { @MainActor in
                self?.serverEnded(id, status)
            }
        }
        do {
            try process.run()
        } catch {
            showMessage(title: words.say("GridHub を起こせませんでした", "GridHub を起動できませんでした"), body: "<p>\(escape(error.localizedDescription))</p>", retry: true)
            return
        }
        server = process
        lifeline = input
    }

    /// gridhub app の出力。1行目の「GridHub: http://127.0.0.1:<port>/」を窓に読み込む
    private func serverSaid(_ chunk: Data) {
        buffer.append(chunk)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = String(data: buffer[buffer.startIndex..<newline], encoding: .utf8) ?? ""
            buffer.removeSubrange(buffer.startIndex...newline)
            lines.append(line)
            if lines.count > 40 { lines.removeFirst(lines.count - 40) }
            if homeURL == nil, let range = line.range(of: "GridHub: ") {
                let text = line[range.upperBound...].trimmingCharacters(in: .whitespaces)
                if let url = URL(string: text), isLocal(url) {
                    homeURL = url
                    webView.load(URLRequest(url: url))
                }
            }
        }
    }

    private func serverEnded(_ id: ObjectIdentifier, _ status: Int32) {
        // 「もう一度さがす」で起こし直したあとに、前のサーバーの終わりが届いたら何もしない
        guard let current = server, ObjectIdentifier(current) == id else { return }
        server = nil
        lifeline = nil
        homeURL = nil
        if stopping { return }
        // 使う人に見せるのは、理由の1行（[E_…] の行があればそれ）と最後の数行だけ。残りは「くわしく」で畳む
        let shown = lines.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        let reason = shown.first { $0.hasPrefix("[E_") } ?? shown.last ?? "（何も出力されませんでした）"
        let last = shown.suffix(4).map(escape).joined(separator: "\n")
        let all = shown.suffix(40).map(escape).joined(separator: "\n")
        let body = """
        <p>終了コード \(status)。理由: <code>\(escape(reason))</code></p>
        <pre>\(last)</pre>
        <details><summary>くわしく（最後の出力）</summary><pre>\(all)</pre></details>
        <p>アプリを組み立て直す（<code>sh mac/build.sh</code>）か、下の「もう一度さがす」を押してください。</p>
        """
        showMessage(title: "盤面のサーバーが止まりました", body: body, retry: true)
    }

    private func stopServer() {
        stopping = true
        try? lifeline?.fileHandleForWriting.close()
        lifeline = nil
        guard let process = server else { return }
        server = nil
        homeURL = nil
        if process.isRunning { process.terminate() }
        let deadline = Date().addingTimeInterval(3)
        while process.isRunning && Date() < deadline { usleep(50_000) }
        if process.isRunning { kill(process.processIdentifier, SIGKILL) }
    }

    private func nodeHelp(_ version: String?) -> String {
        let now = version.map { "<p>いまの Node.js は <code>\(escape($0))</code> です。</p>" } ?? ""
        return """
        <p>GridHub を動かすには <b>Node.js 22 以上</b>が要ります。</p>
        \(now)
        <ol>
          <li><a href="https://nodejs.org/ja/download">https://nodejs.org</a> から「LTS」を入れる。</li>
          <li>または、Homebrew を使っているなら、ターミナルで <code>brew install node</code>。</li>
        </ol>
        <p>入れたら、下の「もう一度さがす」を押してください。</p>
        """
    }

    // MARK: 窓に出す知らせ（方眼ノートの紙）

    private func showMessage(title: String, body: String, retry: Bool) {
        let button = retry ? "<p><button onclick=\"window.webkit.messageHandlers.gridhub.postMessage({type: 'retry'})\">もう一度さがす</button></p>" : ""
        let html = """
        <!doctype html><html lang="ja"><head><meta charset="utf-8"><title>GridHub</title><style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #c9a47a; font-family: 'Hiragino Maru Gothic ProN', 'Hiragino Sans', sans-serif; color: #1d2b5c; }
        main { width: min(620px, 86vw); padding: 36px 40px; background-color: #fdfaf0;
          background-image: linear-gradient(#a6d2e4 1px, transparent 1px), linear-gradient(90deg, #a6d2e4 1px, transparent 1px);
          background-size: 20px 20px; border-radius: 6px; box-shadow: 0 10px 30px rgba(60, 38, 14, .35); line-height: 1.8; }
        h1 { font-size: 22px; margin: 0 0 12px; } code { background: rgba(29, 43, 92, .08); padding: 1px 5px; border-radius: 4px; }
        pre { white-space: pre-wrap; font-size: 12px; background: rgba(255, 255, 255, .7); padding: 8px; max-height: 40vh; overflow: auto; }
        details { margin: 8px 0; } summary { cursor: pointer; }
        button { font: inherit; padding: 6px 18px; border: 2px solid #1d2b5c; border-radius: 8px; background: #ffe45c; color: #1d2b5c; cursor: pointer; }
        a { color: #1d2b5c; }
        </style></head><body><main><h1>\(escape(title))</h1>\(body)\(button)</main></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    private func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private func isLocal(_ url: URL) -> Bool {
        guard let scheme = url.scheme, scheme == "http", let host = url.host else { return false }
        return host == "127.0.0.1" || host == "localhost"
    }

    // MARK: web 側からの合図（§70.2）

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "chooseFolder":
            chooseFolder()
        case "retry":
            start()
        case "words":
            // 盤面・はじめの画面で選んだことば（§76.7）
            if let text = body["words"] as? String, let next = Words(rawValue: text) { wordsChanged(next) }
        case "openExternal":
            if let text = body["url"] as? String, let url = URL(string: text) { NSWorkspace.shared.open(url) }
        case "badge":
            // 勇者の手帳（§79.14）: 未開封のシール袋の数を Dock のアイコンに
            let count = (body["count"] as? NSNumber)?.intValue ?? 0
            NSApp.dockTile.badgeLabel = count > 0 ? (count > 999 ? "999+" : String(count)) : nil
        case "attention":
            // 窓が後ろにあるあいだに、帰還・ボス戦・あがり・称号があったら Dock で知らせる（前にあれば何もしない）
            if !NSApp.isActive { NSApp.requestUserAttention(.informationalRequest) }
        default:
            break
        }
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = words.say("このフォルダで遊ぶ", "このフォルダを開く")
        panel.message = words.say("冒険の書のあるフォルダか、新しく冒険をはじめるフォルダを選んでください（「新規フォルダ」で作れます）。",
                                  "セーブデータ（.masume）のあるフォルダか、新しく始めるフォルダを選んでください（「新規フォルダ」で作れます）。")
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.folderChosen(url.path)
        }
    }

    private func folderChosen(_ path: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: path, options: [.fragmentsAllowed]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.gridhubApp && window.gridhubApp.folderChosen(\(json))", completionHandler: nil)
    }

    // MARK: WKUIDelegate（alert・confirm・新しい窓）

    // 終わりの合図を受け取る形（completionHandler）は SDK の版で型の注釈が変わるので、async の形で受ける
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = "GridHub"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = "GridHub"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "キャンセル")
        return alert.runModal() == .alertFirstButtonReturn
    }

    /// target="_blank" のリンク（判定の出力など）は、既定のブラウザで開く
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // MARK: WKNavigationDelegate（手元でない URL は既定のブラウザへ）

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let scheme = url.scheme else { return .allow }
        if scheme == "about" || scheme == "data" || isLocal(url) { return .allow }
        if navigationAction.navigationType == .linkActivated, scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
            return .cancel
        }
        return .allow
    }
}
