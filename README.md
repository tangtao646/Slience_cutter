# Silence Cutter 🚀
[中文版](README_CN.md) | English

Silence Cutter is a high-performance, automated video silence removal tool built with **Tauri v2 + React**. It uses advanced audio analysis to identify and eliminate redundant silent segments, significantly boosting the editing efficiency for short videos, online courses, and screen recordings.

## ✨ Key Features

- ⚡ **Industrial Processing Engine**: Rust-powered backend with multi-threaded parallel transcoding, achieving speeds 300%+ faster than single-threaded solutions.
- 📊 **Real-time Streaming Analysis**: Real-time waveform rendering during analysis—no need to wait for lengthy audio pre-processing.
- ✂️ **Non-linear Editing Experience**: Supports "Continuous Mode" for previews and "Fragmented Mode" for precise removal, combining automation with manual fine-tuning.
- 📦 **Zero-config Operation**: Built-in FFmpeg Sidecar management—no need to manually install FFmpeg or configure environment variables.
- 🎨 **Modern UI**: An aesthetic dark mode design with smooth waveform scrolling and real-time progress feedback.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Canvas-based Waveform.
- **Backend**: Rust (Tauri v2), Tokio (Async runtime).
- **Processing**: FFmpeg (High-performance stream piping & parallel TS concatenation).
- **CI/CD**: GitHub Actions (Multi-platform automated build & binary injection).

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/learn/get-started) (latest stable)

### Development Setup
This project handles **automated Sidecar initialization**—you don't need to download FFmpeg manually:

```bash
# Clone the repository
git clone https://github.com/your-username/silence-cutter.git
cd silence-cutter

# Install dependencies and auto-fetch FFmpeg binaries for your architecture
npm install

# Start development (Tauri mode)
npm run tauri dev

# Alternatively, if you have cargo-tauri installed globally:
# cargo tauri dev
```

### Production Build
```bash
npm run tauri build
```

### macOS Signature Issue
If you encounter the "App is damaged" or "can't be opened" error on macOS, it is because the app is not signed with an Apple Developer ID. Please run the following command in Terminal to remove the quarantine attribute:
```bash
sudo xattr -rd com.apple.quarantine /Applications/silence-cutter.app
```

## 🏗️ Architecture Highlights

### 1. Automated Pipeline
The `scripts/setup-sidecars.mjs` script detects your host architecture (Intel/ARM, Win/Mac/Linux) and automatically fetches the appropriate FFmpeg static binaries from official sources.

### 2. High-Concurrency Parallel Editing
The backend divides video into multiple speech blocks and utilizes `tokio::sync::Semaphore` to manage concurrency. Segments are transcoded to MPEG-TS in parallel and merged losslessly using the `concat` protocol, avoiding the overhead of full re-encoding for long videos.

### 3. Ripple Edit (Time Mapping)
The frontend implements a "Real-to-Virtual" time mapping algorithm, allowing the timeline to collapse automatically as silences are removed, providing a professional ripple-editing experience.

## 📄 License
This project is licensed under the **[Restricted Source-Available License](LICENSE)**.
- **Personal Learning**: Completely free.
- **Commercial Use / Store Distribution**: **Strictly Prohibited**. Unauthorized distribution on any app store (e.g., Microsoft Store) is forbidden.
- **Derivative Works**: Repackaging/reskinning for secondary distribution is strictly prohibited.


