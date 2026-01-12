import React, { useRef, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

const PreviewSection = ({ appData, currentFile, onFileSelect, setFileInfo, setVideoDuration }) => {
    // console.log('[PreviewSection] Render', { hasFile: !!currentFile });
    const videoRef = useRef(null);
    const fileInputRef = useRef(null);
    const [error, setError] = useState(null);
    const [debugInfo, setDebugInfo] = useState({ state: 'init', readyState: 0, isPlaying: false });

    useEffect(() => {
        if (!currentFile || !videoRef.current) return;
        
        const videoElement = videoRef.current;
        // 获取视频源：优先使用预置的 previewPath，否则使用 Tauri 转换后的 assetUrl
        // 注意：Tauri v2 中 absolute path 需要通过 convertFileSrc 转换为 asset 协议
        const rawPath = currentFile.previewPath || currentFile.path;
        let videoSrc = rawPath;
        
        // 使用 TauriManager 的统一处理，确保格式正确 (http://asset.localhost/...)
        if (appData?.tauri?.getFileSrc && !rawPath.startsWith('blob:') && !rawPath.startsWith('http')) {
             videoSrc = appData.tauri.getFileSrc(rawPath);
        }
        

        const handleMetadata = () => {
            console.log('Metadata Ready:', videoElement.duration);
            updateFileInfo(videoElement.duration);
           
        };

        const handleError = (e) => {
            console.error('[Video Error Event]', videoElement.error, e);
            setError(`Load Error: ${videoElement.error?.message || videoElement.error?.code || 'Unknown'}`);
        };

        const handlePlayCheck = () => setDebugInfo(prev => ({ ...prev, isPlaying: !videoElement.paused }));
        const handleStateChange = () => setDebugInfo(prev => ({ ...prev, readyState: videoElement.readyState }));

        // Bind Events
        videoElement.addEventListener('loadedmetadata', handleMetadata);
        videoElement.addEventListener('error', handleError);
        videoElement.addEventListener('play', handlePlayCheck);
        videoElement.addEventListener('pause', handlePlayCheck);
        videoElement.addEventListener('canplay', handleStateChange);

        // Initialization
        if (appData?.videoPlayer) {
             appData.videoPlayer.init(videoElement);
        }
        
        // Load mechanism
        videoElement.src = videoSrc;
        videoElement.load();
        
        return () => {
            videoElement.pause();
            videoElement.removeAttribute('src'); 
            videoElement.load(); // Release memory
            videoElement.removeEventListener('loadedmetadata', handleMetadata);
            videoElement.removeEventListener('error', handleError);
            videoElement.removeEventListener('play', handlePlayCheck);
            videoElement.removeEventListener('pause', handlePlayCheck);
            videoElement.removeEventListener('canplay', handleStateChange);
        };
    }, [currentFile]); // Only re-run if file object changes identity

    useEffect(() => {
        // Native Drag & Drop support for Tauri
        let unlisten = null;
        const setupDropListener = async () => {
             if (appData?.tauri?.isTauri) {
                 unlisten = await appData.tauri.listen('tauri://drop', (event) => {
                      const paths = event.payload?.paths;
                      if (paths && paths.length > 0) {
                           const path = paths[0];
                           if (!path.match(/\.(mp4|mov|avi|mkv|webm|mp3|wav|aac)$/i)) return;
                           const name = path.split(/[/\\]/).pop();
                           onFileSelect({
                               name: name,
                               file: null,
                               path: path,
                               isTauriFile: true
                           });
                      }
                 });
             }
        };
        setupDropListener();
        return () => {
             if (unlisten) unlisten(); 
        };
    }, [appData]);

    const updateFileInfo = (duration) => {
        const safeD = Number.isFinite(duration) ? duration : 0;
        if (setVideoDuration) setVideoDuration(safeD);
        if (setFileInfo) {
            setFileInfo(prev => ({
                ...prev,
                duration: formatDuration(safeD),
                hasVideo: true
            }));
        }
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleBrowse = async () => {
        if (appData?.tauri?.isTauri) {
            try {
                const selected = await open({
                    multiple: false,
                    filters: [{
                        name: 'Media',
                        extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac']
                    }]
                });
                
                if (selected) {
                    const path = selected; // Tauri v2 returns string directly
                    const name = path.split(/[/\\]/).pop();
                    onFileSelect({
                        name: name,
                        file: null,
                        path: path,
                        isTauriFile: true
                    });
                }
            } catch (err) {
                console.error("Dialog open failed", err);
            }
        } else {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            onFileSelect({
                name: file.name,
                file: file,
                path: URL.createObjectURL(file), // Web fallback
                isTauriFile: false
            });
        }
    };

    return (
        <div className="preview-section" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}>
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileChange}
                accept=".mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.aac"
            />
            
            {!currentFile && (
                <div className="preview-drop" role="button" onClick={handleBrowse}>
                    <div className="preview-drop-inner">
                        <div className="preview-drop-title">Import a File to Edit</div>
                        <div className="preview-drop-sub">audio or video — click to browse</div>
                        <button className="browse-button" type="button" onClick={(e) => { e.stopPropagation(); handleBrowse(); }}>Browse</button>
                    </div>
                </div>
            )}

            {currentFile && (
                <>
                    {error && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff4d4d', textAlign: 'center', zIndex: 10, background: 'rgba(0,0,0,0.7)', padding: '20px', borderRadius: '8px' }}>
                            <i className="fa fa-exclamation-triangle" style={{ fontSize: '32px', marginBottom: '10px' }}></i>
                            <div>{error}</div>
                            <div style={{ fontSize: '10px', marginTop: '10px', maxWidth: '300px', wordBreak: 'break-all' }}>{debugInfo?.src}</div>
                            <button onClick={() => videoRef.current && videoRef.current.load()} style={{ marginTop: '10px', cursor: 'pointer' }}>Retry</button>
                        </div>
                    )}
                    
                
                    <video 
                        key={currentFile.path || 'video-player'} // Force DOM reset on new file
                        ref={videoRef} 
                        playsInline
                        controls={false}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                </>
            )}
        </div>
    );
};

export default PreviewSection;

