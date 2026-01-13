import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../modules/i18n.jsx';

const TransportBar = ({ appData, currentFile, segments, pendingSegments, viewMode, stats }) => {
    const { t } = useTranslation();
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const requestRef = useRef();

    // 默认时长：从 stats 中获取原始时长，或者从 stats.remaining 获取
    const duration = stats?.absoluteOriginal || 0;

    // High-frequency playback sync
    const updateTime = useCallback(() => {
        const player = appData.videoPlayer;
        if (player && player.videoElement && !player.videoElement.paused) {
            setCurrentTime(player.videoElement.currentTime);
            requestRef.current = requestAnimationFrame(updateTime);
        }
    }, [appData.videoPlayer]);

    // Synchronize with VideoPlayer state
    useEffect(() => {
        const player = appData.videoPlayer;
        if (!player) return;

        const handleTimeUpdate = (rt) => {
            // Only update via event if not playing (RAF handles active updates)
            if (player.videoElement && player.videoElement.paused) {
                setCurrentTime(rt);
            }
        };

        const handlePlay = () => {
            setIsPlaying(true);
            requestRef.current = requestAnimationFrame(updateTime);
        };
        
        const handlePause = () => {
            setIsPlaying(false);
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
            // Sync one last time on pause
            if (player.videoElement) {
                setCurrentTime(player.videoElement.currentTime);
            }
        };

        player.on('timeupdate', handleTimeUpdate);
        player.on('play', handlePlay);
        player.on('pause', handlePause);

        // Initial sync
        if (player.videoElement) {
            setCurrentTime(player.videoElement.currentTime);
            const playing = !player.videoElement.paused;
            setIsPlaying(playing);
            if (playing) {
                requestRef.current = requestAnimationFrame(updateTime);
            }
        }

        return () => {
            player.off('timeupdate', handleTimeUpdate);
            player.off('play', handlePlay);
            player.off('pause', handlePause);
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [appData.videoPlayer, currentFile, updateTime]);

    // Virtual Time Conversion
    const getVirtualTime = useCallback((rt) => {
        if (viewMode !== 'fragmented' || !segments || segments.length === 0) return rt;
        
        const sortedSilences = [...segments].sort((a, b) => a.start - b.start);
        let lastPos = 0;
        let virtualOffset = 0;
        
        for (const seg of sortedSilences) {
            if (rt < seg.start) {
                return virtualOffset + (rt - lastPos);
            }
            if (rt >= seg.start && rt <= seg.end) {
                return virtualOffset + (seg.start - lastPos); // Snap to start of cut
            }
            virtualOffset += (seg.start - lastPos);
            lastPos = seg.end;
        }

        return virtualOffset + (rt - lastPos);
    }, [viewMode, segments]);

    const formatTimecode = (seconds) => {
        if (!Number.isFinite(seconds)) return "00:00:00:00";
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100); 
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
    };

    const handleTogglePlay = useCallback(() => {
        if (!appData.videoPlayer || !currentFile) return;

        // 在碎片化模式下，如果没有剩余内容，禁止播放
        if (viewMode === 'fragmented' && (stats?.remaining || 0) <= 0.01) {
            return;
        }

        if (isPlaying) {
            appData.videoPlayer.pause();
        } else {
            appData.videoPlayer.play();
        }
    }, [appData.videoPlayer, isPlaying, currentFile, viewMode, stats?.remaining]);

    useEffect(() => {
        const handleSpace = (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                handleTogglePlay();
            }
        };
        window.addEventListener('keydown', handleSpace);
        return () => window.removeEventListener('keydown', handleSpace);
    }, [handleTogglePlay]);

    const handleStepForward = () => {
        if (appData.videoPlayer) {
            appData.videoPlayer.seekTo(currentTime + 5);
        }
    };

    const handleStepBackward = () => {
        if (appData.videoPlayer) {
            appData.videoPlayer.seekTo(Math.max(0, currentTime - 5));
        }
    };

    // Derived values for fragmented mode
    const displayCurrent = getVirtualTime(currentTime);
    const displayTotal = viewMode === 'fragmented' ? (stats?.remaining || 0) : (duration || 0);

    return (
        <div className="transport-bar">
            <div className="transport-left">
                {/* Icons moved to center for symmetry */}
            </div>
            
            <div className="transport-center">
                <button 
                    className="step-btn"
                    onClick={handleStepBackward}
                    disabled={!currentFile}
                    style={{ 
                        opacity: currentFile ? 1 : 0.5, 
                        cursor: currentFile ? 'pointer' : 'default',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <i className="fa fa-rotate-left"></i> {t('transport.step_backward')}
                </button>

                <button 
                    className="play-btn" 
                    onClick={handleTogglePlay}
                    disabled={!currentFile}
                    style={{ 
                        opacity: currentFile ? 1 : 0.5, 
                        cursor: currentFile ? 'pointer' : 'default' 
                    }}
                >
                    <i className={isPlaying ? "fa fa-pause" : "fa fa-play"}></i>
                </button>
                
                <button 
                    className="step-btn"
                    onClick={handleStepForward}
                    disabled={!currentFile}
                    style={{ 
                        opacity: currentFile ? 1 : 0.5, 
                        cursor: currentFile ? 'pointer' : 'default',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <i className="fa fa-rotate-right"></i> {t('transport.step_forward')}
                </button>

                <div className="time-counter" style={{ 
                    color: currentFile ? '#fff' : '#666', 
                    fontFamily: 'monospace', 
                    marginLeft: '20px',
                    background: '#000',
                    padding: '4px 16px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    border: '1px solid #333'
                }}>
                    {formatTimecode(displayCurrent)}
                </div>
            </div>
            
            <div className="transport-right">
                {/* File title moved to tracks */}
            </div>
        </div>
    );
};

export default TransportBar;