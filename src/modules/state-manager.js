// 应用状态管理
export class AppState {
    constructor() {
        this.isTauri = false;
        this.backendConnected = false;
        this.ffmpegAvailable = false;
        this.currentFile = null;
        this.processing = false;
        this.currentVideoPath = null;
        this.audioData = null;
        this.silenceSegments = [];
        this.waveformReady = false;
        this.waveformSyncEnabled = true;
        this.hasVideo = true;
        this.hasAudio = true;
    }
    
    update(updates) {
        Object.assign(this, updates);
    }
    
    resetFileState() {
        this.currentFile = null;
        this.currentVideoPath = null;
        this.audioData = null;
        this.silenceSegments = [];
        this.waveformReady = false;
        this.processing = false;
        this.hasVideo = true;
        this.hasAudio = true;
    }
}

// 单例模式导出
let appStateInstance = null;

export function getAppState() {
    if (!appStateInstance) {
        appStateInstance = new AppState();
    }
    return appStateInstance;
}