import React, { useEffect, useRef, useState, useMemo } from 'react';
import Timeline from './Timeline';
import { formatDuration } from '../modules/utils';

const PX_PER_PEAK = 2; 

// 高性能采集接龙组件
const StreamingTimeline = ({ peaks, progress }) => {
    const scrollRef = useRef(null);
    const canvasRef = useRef(null);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const totalWidth = peaks.length * PX_PER_PEAK;

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handleScroll = () => setScrollLeft(el.scrollLeft);
        const handleResize = () => setContainerWidth(el.clientWidth);
        el.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleResize);
        setContainerWidth(el.clientWidth);
        return () => {
            el.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            const el = scrollRef.current;
            const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 150;
            if (isAtEnd || peaks.length < 50) {
                el.scrollLeft = el.scrollWidth;
            }
        }
    }, [peaks.length]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        const dpr = window.devicePixelRatio || 1;
        const width = containerWidth || 800;
        const height = 100;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
            canvas.width = width * dpr;
            canvas.height = height * dpr;
        }
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);
        if (peaks.length === 0) {
            ctx.restore();
            return;
        }
        const startIdx = Math.floor(scrollLeft / PX_PER_PEAK);
        const endIdx = Math.ceil((scrollLeft + width) / PX_PER_PEAK);
        
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = startIdx; i <= endIdx; i++) {
            if (i >= peaks.length) break;
            const peak = Math.abs(peaks[i]);
            const h = Math.max(1, Math.pow(peak, 0.6) * height * 0.85);
            const x = (i * PX_PER_PEAK) - scrollLeft;
            const waveCenterY = height / 2;
            
            ctx.moveTo(x + 0.5, waveCenterY - h/2);
            ctx.lineTo(x + 0.5, waveCenterY + h/2);
        }
        ctx.stroke();

        if (endIdx >= peaks.length - 1) {
            const headX = (peaks.length * PX_PER_PEAK) - scrollLeft;
            ctx.fillStyle = '#ff4d4d';
            ctx.fillRect(headX - 1, 0, 2, height);
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ff4d4d';
            ctx.fillRect(headX - 1, 0, 2, height);
        }
        ctx.restore();
    }, [peaks, scrollLeft, containerWidth]);

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#0a0a0a', zIndex: 40, display: 'flex', flexDirection: 'column', borderTop: '1px solid #333' }}>
            <div style={{ height: '32px', background: '#151515', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #222', fontSize: '11px', color: '#2eb354' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="pulse-dot" /> 
                    <span style={{ fontWeight: 'bold' }}>STREAMING ANALYSIS</span>
                </div>
                <div style={{ color: '#666' }}>{(progress * 100).toFixed(1)}% | {Math.floor(peaks.length / 50)}s</div>
            </div>
            <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
                <div style={{ width: `${Math.max(containerWidth, totalWidth + 400)}px`, height: '100%', position: 'relative', padding: '20px 0' }}>
                    <div style={{ height: '40px', background: '#1a1a1c', border: '1px solid #333', position: 'relative', width: `${totalWidth}px`, borderRadius: '4px', overflow: 'hidden', margin: '10px 0' }}>
                        <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg, #222, #222 10px, #2a2a2a 10px, #2a2a2a 20px)' }} />
                    </div>
                    <div style={{ height: '100px', position: 'sticky', left: 0, width: `${containerWidth}px`, pointerEvents: 'none' }}>
                        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
                    </div>
                </div>
            </div>
            <style>{`.pulse-dot { width: 8px; height: 8px; background: #2eb354; border-radius: 50%; animation: pulse 1.5s infinite; } @keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 179, 84, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(46, 179, 84, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 179, 84, 0); } }`}</style>
        </div>
    );
};

const WaveformSection = ({ 
    appData, 
    currentFile, 
    videoDuration, 
    hasVideo, 
    hasAudio, 
    waveInfo, 
    setWaveInfo, 
    viewMode, 
    timeline, // 新增：中台 Hook 的结果
    onDeleteMedia
}) => {
    const { stats, speechClips, virtualDuration, pendingSegments } = timeline;
    const [audioData, setAudioData] = useState(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamPeaks, setStreamPeaks] = useState([]);
    const [streamProgress, setStreamProgress] = useState(0);
    const [duration, setDuration] = useState(videoDuration || 0);

    // 同步外部视频时长
    useEffect(() => {
        setDuration(videoDuration || 0);
    }, [videoDuration]);

    // 监听 Video 加载以获取时长
    useEffect(() => {
        if (!appData.videoPlayer) return;
        const player = appData.videoPlayer;
        const updateDuration = () => {
            if (player.videoElement) {
                setDuration(player.videoElement.duration || 0);
            }
        };
        // video-player.js sends events?
        // appData.videoPlayer is Custom class wrapper usually.
        // It has 'on' method.
        player.on('durationchange', updateDuration);
        player.on('loadedmetadata', updateDuration);
        
        // Initial check
        if (player.videoElement) updateDuration();

        return () => {
            player.off('durationchange', updateDuration);
            player.off('loadedmetadata', updateDuration);
        };
    }, [appData.videoPlayer, currentFile]);

    // 监听 Rust 数据流
    useEffect(() => {
        let unlistenStepFn = null;
        let unlistenDoneFn = null;
        let active = true;

        const setup = async () => {
            if (!appData.tauri || !active) return;
            
            const step = await appData.tauri.listen('audio-waveform-step', (event) => {
                if (!active) return;
                const { peaks, progress } = event.payload || {};
                if (peaks) {
                    setStreamPeaks(prev => [...prev, ...peaks]);
                    setIsStreaming(true);
                }
                if (progress !== undefined) setStreamProgress(progress);
            });

            if (!active) {
                step();
            } else {
                unlistenStepFn = step;
            }

            const done = await appData.tauri.listen('audio-waveform-done', (event) => {
                if (!active) return;
                const { peaks, cache_id, duration: audioDuration, totalSamples } = event.payload || {};
                
                setStreamPeaks(current => {
                    const finalPeaks = (peaks && peaks.length > 0) ? peaks : current;
                    
                    // Merge with existing state to preserve sample_rate and other metadata
                    const existing = appData.state.audioData || {};
                    const sampleRate = totalSamples && audioDuration ? Math.round(totalSamples / audioDuration) : (existing.sample_rate || 16000);
                    
                    const full = { 
                        ...existing,
                        peaks: finalPeaks, 
                        cache_id: cache_id || existing.cache_id,
                        duration: audioDuration || existing.duration,
                        sample_rate: sampleRate
                    };
                    
                    appData.state.audioData = full;
                    setAudioData(full);
                    return finalPeaks;
                });
                
                if (audioDuration) setDuration(audioDuration);

                setWaveInfo('提取完成');
                setTimeout(() => { if (active) setIsStreaming(false); }, 1000);
            });

            if (!active) {
                done();
            } else {
                unlistenDoneFn = done;
            }
        };

        setup();
        return () => {
            active = false;
            if (unlistenStepFn) unlistenStepFn();
            if (unlistenDoneFn) unlistenDoneFn();
        };
    }, [appData]);

    // 重置逻辑
    useEffect(() => {
        if (!currentFile) {
            setAudioData(null);
            setStreamPeaks([]);
            setIsStreaming(false);
            setStreamProgress(0);
            setDuration(0);
        }
    }, [currentFile]);

    const handleSeek = (time) => {
        if (appData.videoPlayer) {
            appData.videoPlayer.seekTo(time);
        }
    };

    return (
        <div className="waveform-section" style={{ height: '100%', position: 'relative', background: '#131313', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 顶部统计栏 (Stats Bar) */}
            {currentFile && !isStreaming && (
                <div className="waveform-stats-bar" style={{ 
                    height: '30px', 
                    background: '#131313', 
                    borderBottom: '1px solid #222', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '11px', 
                    color: '#666', 
                    gap: '12px',
                    letterSpacing: '0.01em',
                    flexShrink: 0
                }}>
                    {(!pendingSegments || pendingSegments.length === 0) ? (
                        <div>duration <span style={{ color: '#eee', fontWeight: '500' }}>{formatDuration(stats?.remaining || 0)}</span></div>
                    ) : (
                        <>
                            <div>duration <span style={{ color: '#eee', fontWeight: '500' }}>{formatDuration(stats.absoluteOriginal || 0)}</span></div>
                            <div style={{ color: '#444' }}>—</div>
                            <div><span style={{ color: '#eee', fontWeight: '500' }}>{formatDuration(stats.remaining || 0)}</span> after new cuts</div>
                            <div style={{ color: '#444' }}>—</div>
                            <div><span style={{ color: '#eee', fontWeight: '500' }}>{stats.cutsCount || 0}</span> total cuts</div>
                        </>
                    )}
                </div>
            )}

            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {/* 始终渲染时间轴，实现无缝的“边提边画”效果 */}
                <Timeline 
                    audioData={audioData || (streamPeaks.length > 0 ? { peaks: streamPeaks } : null)}
                    timeline={timeline}
                    duration={duration || (audioData?.peaks?.length / 50) || (streamPeaks.length / 50) || 0} 
                    videoPlayer={appData.videoPlayer}
                    onSeek={handleSeek}
                    fileName={currentFile?.name || ""}
                    isAnalyzing={isStreaming}
                    analysisProgress={streamProgress}
                    hasVideo={hasVideo}
                    hasAudio={hasAudio}
                    viewMode={viewMode}
                    onDeleteMedia={onDeleteMedia}
                />
            </div>
            
            {/* 底部状态栏 */}
            <div style={{ height: '24px', background: '#131313', borderTop: '1px solid #222', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '10px', zIndex: 50 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isStreaming && <div className="pulse-dot" />}
                    <div style={{ color: '#555' }}>
                        {isStreaming ? `Analyzing... ${(streamProgress * 100).toFixed(1)}%` : waveInfo}
                    </div>
                </div>
            </div>
            <style>{`.pulse-dot { width: 8px; height: 8px; background: #2eb354; border-radius: 50%; animation: pulse 1.5s infinite; } @keyframes pulse { 0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 179, 84, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(46, 179, 84, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 179, 84, 0); } }`}</style>
        </div>
    );
};

export default WaveformSection;
