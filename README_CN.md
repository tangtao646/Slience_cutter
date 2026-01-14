# Silence Cutter (静音剪霸) 🚀

Silence Cutter 是一款基于 **Tauri v2 + React** 构建的高性能全自动视频静音切除工具。它专注于通过音频分析技术，自动识别并消除视频中的冗余静音片段，极大提升短视频、网课、录屏素材的初剪效率。

## ✨ 核心特性

- ⚡ **工业级处理引擎**: 采用 Rust 编写后端逻辑，支持多线程并行转码，处理速度相比单线程提升 300% 以上。
- 📊 **实时流式分析**: 边解析边绘制波形图，无需等待冗余的音频预处理。
- ✂️ **非线性编辑体验**: 支持“连续模式”预览与“碎片模式”剔除，手动微调与自动识别完美结合。
- 📦 **零配置运行**: 自带 FFmpeg Sidecar 自动化管理方案，开发者与用户无需手动安装 FFmpeg 环境变量。
- 🎨 **现代化 UI**: 极致深色模式设计，流畅的波形滚动与实时进度反馈。

## 🛠️ 技术栈

- **Frontend**: React 19, Vite, Tailwind-style layouts, Canvas Waveform.
- **Backend**: Rust (Tauri v2), Tokio (Async runtime).
- **Processing**: FFmpeg (High-performance stream piping & parallel TS concatenation).
- **CI/CD**: GitHub Actions (Multi-platform automated build & binary injection).

## 🚀 快速开始

### 环境依赖
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/learn/get-started) (latest stable)

### 开发环境搭建
本项目实现了**全自动 Sidecar 初始化**，您无需手动下载 FFmpeg：

```bash
# 克隆仓库
git clone https://github.com/your-username/silence-cutter.git
cd silence-cutter

# 安装依赖并自动下载对应平台的 FFmpeg 二进制文件
npm install

# 启动开发环境 (Tauri 模式)
npm run tauri dev

# 或者如果您安装了全局 cargo-tauri
cargo tauri dev
```

### 生产环境打包
```bash
npm run tauri build
```

### macOS 签名问题
如果在 macOS 上打开应用时提示“应用已损坏”或“无法打开”，这是因为应用未通过 Apple 开发者证书签名。请在终端执行以下命令移除隔离属性：
```bash
sudo xattr -rd com.apple.quarantine /Applications/silence-cutter.app
```

## 🏗️ 架构亮点

### 1. 自动化流水线
项目通过 `scripts/setup-sidecars.mjs` 自动检测 host 架构（Intel/ARM, Win/Mac/Linux），自动从官方静态源拉取对应的 FFmpeg 二进制文件并完成命名绑定。

### 2. 高并发并行剪辑
后端将视频划分为多个语音块，利用 `tokio::sync::Semaphore` 控制并发压力，将片段并行转码为 MPEG-TS 后通过 `concat` 协议进行无损合并，避免了长视频全量重编码的开销。

### 3. 时间映射 (Ripple Edit)
前端实现了“虚实时间映照”算法，允许在剔除静音后，时间轴能够自动坍缩，提供类似专业剪辑软件的波纹编辑体验。

## 📄 授权协议
本项目采用 **[受限源码可用协议 (Restricted Source-Available License)](LICENSE)**。
- **个人学习**：完全免费。
- **商业使用/商店分发**：**严格禁止**。未经作者许可，严禁将本项目代码打包上架至任何应用商店（如 Microsoft Store）。
- **二次开发**：允许 Fork 学习，但严禁换皮后进行二次分发。

---
Developed with ❤️ by tangtao. 
Using Gemini 3 Flash (Preview) for intelligent code guidance.
