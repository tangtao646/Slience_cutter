// src/modules/video-player.js
// 原生 HTML5 视频播放器管理

import { getAppState } from './state-manager.js';

export class VideoPlayerManager {
    constructor() {
        this.state = getAppState();
        this.videoElement = null;
        this.isInitialized = false;
        
        // 使用一个 Map/Object 来存储多组监听器
        this.listeners = {
            timeupdate: [],
            play: [],
            pause: []
        };
    }
    
    init(videoElement) {
        if (!videoElement) {
            console.warn('Video element not provided');
            return null;
        }

        this.videoElement = videoElement;
        this.setupEventListeners();
        this.isInitialized = true;
        
        console.log('Native Video Player initialized');
        return this.videoElement;
    }
    
    setupEventListeners() {
        if (!this.videoElement) return;
        
        this.videoElement.ontimeupdate = () => {
            this.emit('timeupdate', this.videoElement.currentTime);
        };
        
        this.videoElement.onplay = () => {
            this.emit('play');
        };
        
        this.videoElement.onpause = () => {
            this.emit('pause');
        };

        this.videoElement.onloadedmetadata = () => {
            console.log('Video metadata loaded');
        };

        this.videoElement.onerror = (e) => {
            console.error('Video error:', this.videoElement.error, e);
        };
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }
    
    loadVideo(videoUrl) {
        if (!this.videoElement) {
            console.error('Video player not initialized');
            return false;
        }
        
        console.log('Loading video into native element:', videoUrl);
        
        // 停止当前播放并重置 src
        this.videoElement.pause();
        this.videoElement.src = videoUrl;
        
        // 对于有些浏览器，设置 src 后需要调用 load() 才能触发插件/协议处理
        try {
            this.videoElement.load();
        } catch (e) {
            console.warn('Video load() call failed', e);
        }
        
        return true;
    }
    
    seekTo(time) {
        if (this.videoElement) {
            this.videoElement.currentTime = time;
        }
    }
    
    play() {
        if (this.videoElement) {
            this.videoElement.play().catch(e => {
                // 忽略没有交互导致的播放失败
                if (e.name !== 'NotAllowedError') {
                    console.error('Play failed:', e);
                }
            });
        }
    }
    
    pause() {
        if (this.videoElement) {
            this.videoElement.pause();
        }
    }
    
    togglePlay() {
        if (this.videoElement) {
            if (this.videoElement.paused) {
                this.play();
            } else {
                this.pause();
            }
        }
    }

    getCurrentTime() {
        return this.videoElement ? this.videoElement.currentTime : 0;
    }
    
    getDuration() {
        return this.videoElement ? this.videoElement.duration : 0;
    }
    
    destroy() {
        if (this.videoElement) {
            this.videoElement.removeAttribute('src');
            this.videoElement.load();
            this.videoElement = null;
            this.isInitialized = false;
        }
    }
}

// 单例模式导出
let videoPlayerInstance = null;

export function getVideoPlayerManager() {
    if (!videoPlayerInstance) {
        videoPlayerInstance = new VideoPlayerManager();
    }
    return videoPlayerInstance;
}
