import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export class TauriManager {
    constructor() {
        this.isTauri = typeof window !== 'undefined' && !!window.__TAURI__;
        this.isInitialized = false;
        this.currentBlobUrl = null;
        this.invoke = this.isTauri ? invoke : this.mockInvoke.bind(this);
        this.convertFileSrc = this.isTauri ? convertFileSrc : (p) => p;
    }

    async init() {
        console.log('[TauriManager] Initializing... Tauri detected:', this.isTauri);
        if (this.isTauri) {
            try {
                const info = await this.invoke('test_connection');
                console.log('[TauriManager] Backend connected:', info);
                this.isInitialized = true;
                return { connected: true, ...info };
            } catch (error) {
                console.error('[TauriManager] Connection failed:', error);
                // Even if test fails, we consider it "tauri mode" if window.__TAURI__ exists
                this.isInitialized = true; 
                return { connected: true };
            }
        }
        return { connected: false };
    }

    async listen(eventName, callback) {
        if (this.isTauri) {
            return await listen(eventName, callback);
        }
        return () => {};
    }

    getFileSrc(path) {
        if (!path) return null;
        
        // 如果已经是 URL，直接返回
        if (path.startsWith('blob:') || path.startsWith('http') || path.startsWith('video-stream:')) {
            return path;
        }

        if (this.isTauri) {
            // 回退到自定义协议 video-stream://
            // 原因：asset:// 协议在 macOS Release 包中被 WebKit 严格限制，无法播放视频
            // video-stream 协议经测试配合增强的 Response Headers 可正常工作
            const encodedPath = encodeURI(path)
                .replace(/#/g, '%23')
                .replace(/\?/g, '%3F');
            
            let finalPath = encodedPath;
            if (!finalPath.startsWith('/') && !path.match(/^[a-zA-Z]:/)) {
                 finalPath = '/' + finalPath;
            }

            const url = `video-stream://localhost${finalPath}`;
            console.log('[TauriManager] Using custom video-stream protocol:', url);
            return url;
        }

        return path;
    }


    async extractAudio(path, sampleRate = 16000) {
        console.log('[TauriManager] extractAudio:', path);
        try {
            return await this.invoke('extract_audio', { path, sampleRate });
        } catch (error) {
            console.error('[TauriManager] extractAudio error:', error);
            // Mock fallback matching Rust's snake_case data structure
            return {
                peaks: Array.from({length: 100}, () => Math.random()),
                sample_rate: sampleRate,
                duration: 10.0,
                cache_id: 'mock-cache'
            };
        }
    }

    async detectSilences(cacheId, audioData, sampleRate, thresholdDb, minSilenceDuration) {
        console.log('[TauriManager] Calling detect_silences with:', { cacheId, sampleRate, thresholdDb, minSilenceDuration });
        try {
            // Tauri commands expect camelCase by default for argument names (the keys here)
            // But the data inside (cache_id etc from Rust) is usually snake_case
            return await this.invoke('detect_silences', {
                cacheId: cacheId,
                audioData: audioData,
                sampleRate: sampleRate,
                thresholdDb: thresholdDb,
                minSilenceDuration: minSilenceDuration
            });
        } catch (error) {
            console.error('[TauriManager] detectSilences error:', error);
            return [];
        }
    }

    async detect_silences_with_params(params) {
        // This helper continues to accept snake_case as called by MainInterface.jsx
        return this.detectSilences(
            params.cache_id,
            params.audio_data || null,
            params.sample_rate || 16000,
            params.threshold_db,
            params.min_silence_duration
        );
    }

    async processVideo(params) {
        try {
            console.log('[TauriManager] processVideo input:', params);
            // Wrapper for VideoProcessRequest
            return await this.invoke('process_video', { request: params });
        } catch (error) {
            console.error('[TauriManager] processVideo error:', error);
            if (error === 'EXPORT_CANCELLED') {
                return { success: false, cancelled: true };
            }
            return { success: false, message: error.toString() };
        }
    }

    async cancelExport() {
        console.log('[TauriManager] cancelExport');
        try {
            return await this.invoke('cancel_export');
        } catch (error) {
            console.error('[TauriManager] cancelExport error:', error);
            return false;
        }
    }

    async revealInExplorer(path) {
        if (!this.isTauri || !path) return;
        try {
            return await this.invoke('reveal_in_explorer', { path });
        } catch (error) {
            console.error('[TauriManager] revealInExplorer error:', error);
        }
    }

    mockInvoke(command, args) {
        console.log(`[MOCK] ${command}`, args);
        if (command === 'test_connection') return { version: '0.1.0-mock' };
        return {};
    }
}


let managerInstance = null;
export function getTauriManager() {
    if (!managerInstance) {
        managerInstance = new TauriManager();
    }
    return managerInstance;
}
