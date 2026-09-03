# cliphusk

**Windows & Mac 离线剪贴板历史 / Offline clipboard history for Windows & Mac** — copy anything, then summon the whole history with one hotkey, search it, pin what matters, paste anywhere. Free, private, zero network.

> **中文** — 免费离线剪贴板历史工具(Windows + macOS):复制过的内容自动进历史,`⌘⇧V`(Mac)/`Ctrl+⇧V`(Win)呼出面板,**键盘优先**(↑↓ 选择、⏎ 粘贴、Esc 收起),输入即搜全历史,常用条目可置顶(重复复制自动去重置顶),图片截图同样进历史。单文件存储在本机,断网可用,无任何网络请求——你的剪贴板数据不出设备。
>
> **English** — An offline clipboard history for Windows & macOS. Every copy lands in history; one hotkey summons a keyboard-first panel (arrows to select, Enter to paste, Esc to dismiss); type to search instantly; pin what you reuse; duplicates re-top instead of piling; images and screenshots included. Storage is a local file. Zero network requests after install — your clipboard never leaves the device.

## What it learned from the masters

cliphusk stands on the shoulders of tools that got individual things right — it is the deliberate intersection:

| 从谁学 | 借来的东西 |
|---|---|
| [Maccy](https://github.com/p0deje/Maccy) (macOS, ⭐21k) | keyboard-first flow · instant search · duplicate re-tops · pins |
| [CopyQ](https://github.com/hluk/CopyQ) (cross-platform, ⭐12k) | Windows+Mac from one codebase · image support |
| [Ditto](https://github.com/sablier1161/Ditto) (Windows) | search over content, not just titles |
| [Flycut](https://github.com/TermiT/Flycut) (Mac) | the restraint: do history only, no editors, no scripting |

What it deliberately does **not** have: editors, scripting, tabs, cloud sync, accounts. A clipboard is a clipboard.

## Design

Same house language as the browser-tool series — [yearpulse](https://w1977-0.github.io/yearpulse/) (年度进度), [idphoto-kit](https://w1977-0.github.io/idphoto-kit/) (证件照), [signpad-free](https://w1977-0.github.io/signpad-free/) (手写签名), [exactkb](https://w1977-0.github.io/exactkb/) (图片压缩), [tax-lens](https://w1977-0.github.io/tax-lens/) (个税五险), [meetzones](https://w1977-0.github.io/meetzones/) (会议排期): ink-and-paper Swiss typography, hairline rules, monospaced tabular numbers, pinned section on top. Dark mode follows the system; hover/focus/selection/scrollbars carry the same ink-and-paper treatment.

## Install

Download the artifact for your OS from [Actions](https://github.com/w1977-0/cliphusk/actions) (or build from source — see below). macOS: copy to /Applications; Windows: unzip and run.

> macOS first launch: unsigned builds — right-click → Open, or `xattr -d com.apple.quarantine cliphusk.app`.

## Build & verify from source

Zero npm runtime dependencies; Electron is the only dev dependency.

```
npm install --no-save electron@44
node --test test/cliplib.test.js   # pure core: 10 tests
node build.js                       # inline core into renderer
npx electron . --selftest           # real-clipboard self-check (system-verified)
npm start                           # run the app
```

The self-test verifies against the **system** pasteboard (pbpaste / PowerShell), not just the API's own echo — it can't pass by talking to itself.

## Architecture

```
main.js      polling (500ms, async Electron-44 clipboard API) · hotkeys · persistence · tray
cliplib.js   pure core: ring, dedup-to-top, excess-precise cap eviction, pin, search — 10 tests
preload.js   contextIsolation bridge (typed IPC only)
renderer.html  keyboard-first Swiss UI (core inlined by build.js)
```

Notable engineering: Electron 44 replaced the old synchronous `readImage/writeImage` API with the async `ClipboardItem`/`Blob` model — this project runs on the new API (static Blob payloads; `read()` for capture), with the self-test verifying each path against the OS.

## License

MIT
