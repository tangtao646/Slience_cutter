import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

// Configuration
const DEFAULT_ZOOM = 50; // pixels per second
const MAX_ZOOM = 500;

// Layout Constants
const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 52; // Slightly more balanced height
const TRACK_GAP = 2; // Reduced gap from 4
const HEADER_WIDTH = 48; // Width of the left sidebar
const TRACK_START_Y = RULER_HEIGHT + 4; // Reduced margin from 10

const COLORS = {
  background: '#131313', // Deep dark background
  rulerBg: '#131313',
  rulerText: '#666',
  rulerLine: '#333',
  rulerLinePrimary: '#444',
  
  // Video Track
  videoTrackBg: '#2d4e40', // Dark Green
  videoTrackBorder: '#3e6b56',
  videoText: '#a0dcb8',
  
  // Audio Track
  audioTrackBg: '#3b4254', // Blue/Gray
  audioTrackBorder: '#4b5563',
  waveformFill: '#818cf8', // Indigo-400
  
  // Overlays
  silence: 'rgba(239, 68, 68, 0.5)', // Red overlay for cuts
  cutLine: '#ef4444', // Red line for cuts
  
  playhead: '#f43f5e', // Rose/Red Playhead
  gridLine: '#222',
  selectionBorder: '#60a5fa'
};

const Timeline = ({ 
    audioData, 
    timeline, // 新增：中台 Hook
    duration = 0, 
    videoPlayer, 
    onSeek,
    currentTime = 0,
    fileName = "media_file.mp4",
    isAnalyzing = false,
    analysisProgress = 0,
    hasVideo = true,
    hasAudio = true,
    viewMode = 'continuous',
    onDeleteMedia // 新增：用于删除整个轨道文件
}) => {
    const { 
        stats, 
        speechClips, 
        virtualDuration, 
        confirmedSegments, 
        pendingSegments, 
        realToVirtual: realToVirtualTime, 
        virtualToReal: virtualToRealTime,
        updateSegment,
        deleteSegment,
        deleteSpeechClip,
        bulkDelete
    } = timeline;

    const silenceSegments = confirmedSegments; 
    const containerRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const staticCanvasRef = useRef(null);
    const dynamicCanvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    
    // --- PRE-CALCULATE: Mapping Logic (Ripple Edit) ---
    // 已移至 useTimelineModel 中台处理

    // State
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0); 
    const [height, setHeight] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false); 
    const [selectedIndices, setSelectedIndices] = useState([]); // Array of indices for bulk operations
    const [selectedTrack, setSelectedTrack] = useState(null); 
    const [dragMode, setDragMode] = useState(null); 
    const [selectionBox, setSelectionBox] = useState(null); // { x1, y1, x2, y2 } for box selection
    const [contextMenu, setContextMenu] = useState(null); 

    // Reset selection when file changes to avoid stale indices
    useEffect(() => {
        setSelectedIndices([]);
        setSelectedTrack(null);
    }, [fileName]); 
    
    // Layout Duration: In continuous mode, we show the full duration (as the background tapes).
    // In fragmented mode, we show the collapsed duration (virtualDuration).
    const layoutDuration = useMemo(() => {
        return viewMode === 'continuous' ? duration : virtualDuration;
    }, [viewMode, duration, virtualDuration]);

    // Calculate dynamic zoom limits
    const { minZoom, fitZoom } = useMemo(() => {
        const safeDuration = layoutDuration > 0 ? layoutDuration : 1;
        const safeWidth = viewportWidth > 0 ? viewportWidth : 800;
        const fit = safeWidth / safeDuration;
        
        return { 
            // 允许大幅缩小，最高支持缩至可视宽度的 20%
            minZoom: fit * 0.2, 
            fitZoom: fit 
        };
    }, [layoutDuration, viewportWidth]);


    // --- 缩放逻辑优化 ---
    
    // 记录当前文件，用于判断是否是“新打开”
    const lastFileRef = useRef(null);

    // 初始适配：仅在文件完全切换时触发一次
    useEffect(() => {
        if (fileName !== lastFileRef.current && layoutDuration > 0 && viewportWidth > 0 && fitZoom > 0) {
            setZoom(fitZoom * 0.55);
            lastFileRef.current = fileName;
        }
    }, [fileName, layoutDuration, viewportWidth, fitZoom]); 

    // 模式切换保护：当切换模式导致 layoutDuration 剧减时，确保当前缩放不会低于新模式的最小阈值
    useEffect(() => {
        if (zoom < minZoom) {
            setZoom(minZoom);
        }
    }, [minZoom, zoom]);

    // Derived state
    const totalWidth = useMemo(() => {
        const d = Number.isFinite(layoutDuration) ? layoutDuration : 0;
        const z = Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM;
        // 增加一定的右侧留白 (100px)，防止波形完全贴边
        return d * z + 100;
    }, [layoutDuration, zoom]);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Helper: Time <-> Pixel (These now operate on VIRTUAL time)
    const timeToPixel = useCallback((vTime) => vTime * zoom, [zoom]);
    const pixelToTime = useCallback((pixel) => pixel / zoom, [zoom]);

    // Format time for ruler
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
        if (m > 0) return `${m}m${s > 0 ? s + 's' : ''}`;
        if (s === 0) return m > 0 ? `${m}m` : '0s';
        return `${s}s`;
    };

    // Initialize & Resize Observer
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setViewportWidth(entry.contentRect.width);
                setHeight(entry.contentRect.height || 120); 
            }
        });

        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);

    // Sync Scroll
    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setScrollLeft(scrollContainerRef.current.scrollLeft);
        }
    }, []);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // Canvas Size Setup
    useEffect(() => {
        const setupCanvas = (ref) => {
            const canvas = ref.current;
            if (!canvas) return;
            
            canvas.width = viewportWidth * dpr;
            canvas.height = height * dpr;
            canvas.style.width = `${viewportWidth}px`;
            canvas.style.height = `${height}px`;
        };
        setupCanvas(staticCanvasRef);
        setupCanvas(dynamicCanvasRef);
    }, [viewportWidth, height, dpr]);

    // Helper: Draw Rounded Rect
    const roundRect = (ctx, x, y, w, h, r = 4) => {
        if (w < 0) return;
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };


    // Helper: Draw Static Layers
    const drawStatic = useCallback(() => {
        const canvas = staticCanvasRef.current;
        if (!canvas) return;
        
        try {
            const ctx = canvas.getContext('2d', { alpha: false }); // Optimize
            if (!ctx) return;

            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
            ctx.scale(dpr, dpr);
            
            ctx.fillStyle = COLORS.background;
            ctx.fillRect(0, 0, viewportWidth, height);

            // Ensure we have some valid width to draw and finite durations
            if (!Number.isFinite(viewportWidth) || viewportWidth <= 0 || !Number.isFinite(layoutDuration) || layoutDuration <= 0) return;

            const startVirtualTime = pixelToTime(scrollLeft);
            const endVirtualTime = pixelToTime(scrollLeft + viewportWidth);

            // Layer 1: Ruler
            ctx.fillStyle = COLORS.rulerBg;
            ctx.fillRect(0, 0, viewportWidth, RULER_HEIGHT);
            
            ctx.lineWidth = 1;
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';

            const timeSpan = endVirtualTime - startVirtualTime;
            let tickInterval = 1;

            // More intelligent tick interval based on pixel width
            // Goal: Ensure labels (approx 40px wide) don't overlap
            const minTickWidth = 60; // minimum pixels per major tick label
            
            // Safety check for zoom
            const safeZoom = Number.isFinite(zoom) && zoom > 0.0001 ? zoom : 1;
            const targetInterval = minTickWidth / safeZoom;
            
            const intervals = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
            tickInterval = intervals.find(i => i >= targetInterval) || 3600;
            
            // Safety check for infinite loop
            if (!Number.isFinite(tickInterval) || tickInterval <= 0) tickInterval = 10;
            
            const startTick = Math.floor(startVirtualTime / tickInterval) * tickInterval;

            // Guard against excessive looping
            let loopGuard = 0;
            for (let vt = startTick; vt <= endVirtualTime; vt += tickInterval) {
                if (loopGuard++ > 1000) break; // Performance safety
                
                const x = timeToPixel(vt) - scrollLeft;
                if (x < -50 || x > viewportWidth + 50) continue; 
                
                // Major Tick
                ctx.strokeStyle = COLORS.rulerLinePrimary;
                ctx.beginPath();
                ctx.moveTo(x, RULER_HEIGHT);
                ctx.lineTo(x, RULER_HEIGHT - 8);
                ctx.stroke();

                // Text
                ctx.fillStyle = COLORS.rulerText;
                const label = formatTime(Math.round(vt * 10) / 10);
                ctx.fillText(label, x + 4, RULER_HEIGHT - 4);
                
                // Vertical Grid Line (Background)
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.moveTo(x, RULER_HEIGHT);
                ctx.lineTo(x, height);
                ctx.stroke();

                // Subticks (only if space allows)
                const subCount = 5;
                const subInterval = tickInterval / subCount;
                const subWidth = subInterval * safeZoom; // Use safeZoom
                if (subWidth > 10) { 
                    ctx.strokeStyle = COLORS.rulerLine;
                    for (let i = 1; i < subCount; i++) {
                        const sx = timeToPixel(vt + i * subInterval) - scrollLeft;
                        if (sx > viewportWidth) break;
                        if (sx < 0) continue;
                        ctx.beginPath();
                        ctx.moveTo(sx, RULER_HEIGHT);
                        ctx.lineTo(sx, RULER_HEIGHT - 4);
                        ctx.stroke();
                    }
                }
            }
        
        // Separator Line
        ctx.strokeStyle = '#222';
        ctx.beginPath();
        ctx.moveTo(0, RULER_HEIGHT);
        ctx.lineTo(viewportWidth, RULER_HEIGHT);
        ctx.stroke();

        // --- TRACKS ---
        const drawX = timeToPixel(0) - scrollLeft;
        const totalVW = timeToPixel(layoutDuration);
        const endX = drawX + totalVW;

        if (endX < 0) return;

        // Clip Region for Tracks (below ruler)
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, RULER_HEIGHT, viewportWidth, height - RULER_HEIGHT);
        ctx.clip();


        // Track 1: Video (Green)
        const videoY = TRACK_START_Y;
        const videoH = TRACK_HEIGHT;
        
        if (hasVideo && drawX < viewportWidth) {
             const drawFilmStrip = (x, y, w, h) => {
                 // Film Perforations (Top & Bottom)
                 const perfSize = 4;
                 const perfGap = 8;
                 const perfYOffset = 2;
                 
                 ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                 for (let px = x + 2; px < x + w - perfSize; px += perfGap) {
                     ctx.fillRect(px, y + perfYOffset, perfSize, perfSize);
                     ctx.fillRect(px, y + h - perfSize - perfYOffset, perfSize, perfSize);
                 }
             };

             if (viewMode === 'continuous') {
                 // Continuous BG
                 const isMediaSelected = selectedTrack === 'media';
                 ctx.fillStyle = isMediaSelected ? '#3e6b56' : COLORS.videoTrackBg;
                 ctx.strokeStyle = isMediaSelected ? '#fff' : COLORS.videoTrackBorder;
                 ctx.lineWidth = isMediaSelected ? 2 : 1;
                 const trackW = timeToPixel(duration);
                 roundRect(ctx, drawX, videoY, trackW, videoH, 6);
                 ctx.fill();
                 ctx.stroke();

                 drawFilmStrip(drawX, videoY, trackW, videoH);

                 if (isMediaSelected) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.fill();
                 }
                 
                 // Label (Always draw if visible)
                 if (fileName) {
                    ctx.fillStyle = COLORS.videoText;
                    ctx.font = 'bold 10px sans-serif'; 
                    ctx.textBaseline = 'middle';
                    const labelX = Math.max(drawX + 10, 10);
                    const labelWidth = ctx.measureText(fileName).width;
                    if (labelX + labelWidth < drawX + trackW - 5) {
                        ctx.fillText(fileName.toUpperCase(), labelX, videoY + videoH / 2);
                    }
                 }
             } else {
                 // Fragmented Blocks Joined (No Gaps)
                 speechClips.forEach((clip, i) => {
                     const sx = timeToPixel(clip.virtualStart) - scrollLeft;
                     const ex = timeToPixel(clip.virtualStart + clip.duration) - scrollLeft;
                     if (ex < 0 || sx > viewportWidth) return;
                     
                     const isSelected = selectedTrack === 'media' && selectedIndices.includes(i);
                     ctx.fillStyle = isSelected ? '#3e6b56' : COLORS.videoTrackBg;
                     ctx.strokeStyle = isSelected ? '#fff' : COLORS.videoTrackBorder;
                     ctx.lineWidth = isSelected ? 2 : 1;
                     roundRect(ctx, sx, videoY, ex - sx, videoH, 4);
                     ctx.fill();
                     ctx.stroke();

                     drawFilmStrip(sx, videoY, ex - sx, videoH);

                     // Draw label on clips if they are long enough
                     if (fileName && ex - sx > 40) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(sx, videoY, ex - sx, videoH);
                        ctx.clip();
                        
                        ctx.fillStyle = COLORS.videoText;
                        ctx.font = 'bold 9px sans-serif';
                        ctx.textBaseline = 'middle';
                        const labelX = Math.max(sx + 10, 10);
                        const labelWidth = ctx.measureText(fileName).width;
                        if (labelX + labelWidth < ex - 5) {
                            ctx.fillText(fileName.toUpperCase(), labelX, videoY + videoH / 2);
                        }
                        ctx.restore();
                     }
                 });
             }
        }

        // Track 2: Audio (Blue + Waveform)
        const audioY = hasVideo ? (videoY + videoH + TRACK_GAP) : TRACK_START_Y;
        const audioH = TRACK_HEIGHT;
        
        if (hasAudio && drawX < viewportWidth) {
            if (viewMode === 'continuous') {
                // Continuous BG
                const isMediaSelected = selectedTrack === 'media';
                ctx.fillStyle = isMediaSelected ? '#4b5563' : COLORS.audioTrackBg;
                ctx.strokeStyle = isMediaSelected ? '#fff' : COLORS.audioTrackBorder;
                ctx.lineWidth = isMediaSelected ? 2 : 1;
                roundRect(ctx, drawX, audioY, timeToPixel(duration), audioH, 6);
                ctx.fill();
                ctx.stroke();

                if (isMediaSelected) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.fill();
                }
            } else {
                // Fragmented blocks Joined (No Gaps)
                speechClips.forEach((clip, i) => {
                    const sx = timeToPixel(clip.virtualStart) - scrollLeft;
                    const ex = timeToPixel(clip.virtualStart + clip.duration) - scrollLeft;
                    if (ex < 0 || sx > viewportWidth) return;
                    
                    const isSelected = selectedTrack === 'media' && selectedIndices.includes(i);
                    ctx.fillStyle = isSelected ? '#4b5563' : COLORS.audioTrackBg;
                    ctx.strokeStyle = isSelected ? '#fff' : COLORS.audioTrackBorder;
                    ctx.lineWidth = isSelected ? 2 : 1;
                    roundRect(ctx, sx, audioY, ex - sx, audioH, 4);
                    ctx.fill();
                    ctx.stroke();
                });
            }

            // --- Overlays (Masks) Drawn Behind Waveform ---
            // Silence Overlays (Only in Continuous Mode)
            if (viewMode === 'continuous' && silenceSegments && silenceSegments.length > 0) {
                silenceSegments.forEach((seg, i) => {
                    const s_start = seg.startTime || seg.start;
                    const s_end = seg.endTime || seg.end;
                    if (s_end < startVirtualTime || s_start > endVirtualTime) return;
                    const sx = timeToPixel(s_start) - scrollLeft;
                    const ex = timeToPixel(s_end) - scrollLeft;
                    const rectW = ex - sx;
                    if (rectW > 0) {
                        const isSelected = selectedTrack === 'silence' && selectedIndices.includes(i);
                        ctx.fillStyle = isSelected ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.35)'; 
                        
                        // 仅在音频轨道区域绘制，避免在纯音频模式下出界
                        ctx.fillRect(sx, audioY, rectW, audioH);
                        
                        if (isSelected) {
                            ctx.strokeStyle = '#60a5fa';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(sx, audioY, rectW, audioH);
                        }
                    }
                });
            }

            // Pending Overlays (Active Detection)
            if (pendingSegments && pendingSegments.length > 0) {
                pendingSegments.forEach((seg, i) => {
                    const s_start = seg.startTime || seg.start;
                    const s_end = seg.endTime || seg.end;
                    const vStart = realToVirtualTime(s_start);
                    const vEnd = realToVirtualTime(s_end);
                    if (vEnd < startVirtualTime || vStart > endVirtualTime) return;
                    const sx = timeToPixel(vStart) - scrollLeft;
                    const ex = timeToPixel(vEnd) - scrollLeft;
                    const rectW = ex - sx;
                    if (rectW > 0.5) {
                        const isSelected = selectedTrack === 'pending' && selectedIndices.includes(i);
                        ctx.fillStyle = isSelected ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.3)'; 
                        
                        // 仅在音频轨道区域绘制，保持视觉重点并防止出界
                        ctx.fillRect(sx, audioY, rectW, audioH);
                        
                        if (isSelected) {
                            ctx.strokeStyle = '#ffffff';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(sx, audioY, rectW, audioH);
                        } else {
                            // 非选中状态下使用极细且半透明的边框，减少视觉干扰
                            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                            ctx.lineWidth = 1;
                            ctx.strokeRect(sx, audioY, rectW, audioH);
                        }
                    }
                });
            }
            
            // Waveform (Drawn ON TOP of masks)
             if (audioData && audioData.peaks) {
                const peaks = audioData.peaks;
                const peaksPerSec = 50; 
                
                const waveCenterY = audioY + audioH / 2;
                const waveHeight = audioH * 0.85; 
                
                // Draw only visible portion
                const waveVisibleStartX = Math.max(drawX, 0);
                const waveVisibleEndX = Math.min(drawX + totalVW, viewportWidth);
                
                const loadedTime = peaks.length / peaksPerSec;

                if (waveVisibleEndX > waveVisibleStartX) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = '#818cf8';
                    ctx.lineWidth = 1;

                    const drawWaveAt = (vX, rt) => {
                        const rawIdx = rt * peaksPerSec;
                        const idx0 = Math.floor(rawIdx);
                        const idx1 = Math.min(idx0 + 1, peaks.length - 1);
                        const frac = rawIdx - idx0;

                        if (idx0 >= 0 && idx0 < peaks.length) {
                            const v0 = Math.abs(peaks[idx0]);
                            const v1 = Math.abs(peaks[idx1]);
                            const val = v0 + (v1 - v0) * frac;
                            
                            // 确保静音处也有一条直线（最小高度 1px），符合 PR 等软件的习惯
                            const h = Math.max(1, Math.pow(val, 0.6) * waveHeight);
                            ctx.moveTo(vX + 0.5, Math.floor(waveCenterY - h/2) + 0.5);
                            ctx.lineTo(vX + 0.5, Math.floor(waveCenterY + h/2) + 0.5);
                        }
                    };

                    if (viewMode === 'continuous') {
                        for (let x = waveVisibleStartX; x <= waveVisibleEndX; x += 1) {
                            const vt = pixelToTime(x + scrollLeft);
                            const rt = virtualToRealTime(vt);
                            drawWaveAt(x, rt);
                        }
                    } else {
                        speechClips.forEach(clip => {
                            const sx = timeToPixel(clip.virtualStart) - scrollLeft;
                            const ex = timeToPixel(clip.virtualStart + clip.duration) - scrollLeft;
                            const clipVisibleStartX = Math.max(waveVisibleStartX, sx);
                            const clipVisibleEndX = Math.min(waveVisibleEndX, ex);
                            
                            if (clipVisibleEndX > clipVisibleStartX) {
                                for (let x = clipVisibleStartX; x <= clipVisibleEndX; x += 1) {
                                    const vt = pixelToTime(x + scrollLeft);
                                    const rt = clip.start + (vt - clip.virtualStart);
                                    drawWaveAt(x, rt);
                                }
                            }
                        });
                    }
                    
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
        
        ctx.restore();
        } catch (e) {
            console.error('Timeline draw error:', e);
        }
    }, [zoom, scrollLeft, viewportWidth, height, dpr, duration, layoutDuration, speechClips, audioData, silenceSegments, pendingSegments, fileName, hasVideo, hasAudio, selectedIndices, selectedTrack, virtualToRealTime]);

    // Dynamic Layer (Playhead + Selection Box)
    const drawDynamic = useCallback(() => {
        const canvas = dynamicCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        
        // Render Selection Box
        if (selectionBox) {
            const xMin = Math.min(selectionBox.x1, selectionBox.x2) - scrollLeft;
            const xMax = Math.max(selectionBox.x1, selectionBox.x2) - scrollLeft;
            const yMin = Math.min(selectionBox.y1, selectionBox.y2);
            const yMax = Math.max(selectionBox.y1, selectionBox.y2);
            
            ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1;
            ctx.fillRect(xMin, yMin, xMax - xMin, yMax - yMin);
            ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);
        }

        const rt = videoPlayer?.videoElement?.currentTime ?? currentTime ?? 0;
        const vt = realToVirtualTime(rt);
        const x = timeToPixel(vt) - scrollLeft;
        
        if (Number.isFinite(x) && x >= -10 && x <= viewportWidth + 10) {
            ctx.strokeStyle = COLORS.playhead;
            ctx.lineWidth = 2; 
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            ctx.fillStyle = COLORS.playhead;
            ctx.beginPath();
            ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 8);
            ctx.fill();
        }
        
        animationFrameRef.current = requestAnimationFrame(drawDynamic);
    }, [selectionBox, videoPlayer, currentTime, realToVirtualTime, scrollLeft, viewportWidth, height, dpr, zoom, timeToPixel]);

    useEffect(() => {
        if (!staticCanvasRef.current) return;
        drawStatic();
    }, [drawStatic, audioData?.peaks?.length]); // 关键：当 streamPeaks 长度变化时，强制重绘静态层

    useEffect(() => {
        animationFrameRef.current = requestAnimationFrame(drawDynamic);
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [drawDynamic]);


    // Interaction: Playhead follow
    useEffect(() => {
         if (!videoPlayer) return;
         const checkFollow = () => {
             if (isDragging) return;
             
             const rt = videoPlayer.videoElement ? videoPlayer.videoElement.currentTime : 
                       (videoPlayer.getCurrentTime ? videoPlayer.getCurrentTime() : 0);
             
             const vt = realToVirtualTime(rt);
             const x = timeToPixel(vt);
             
             const currentScroll = scrollContainerRef.current?.scrollLeft || 0;
             const currentWidth = viewportWidth;
             
             if (x < currentScroll || x > currentScroll + currentWidth) {
                 const newScroll = Math.max(0, x - currentWidth / 2);
                 scrollContainerRef.current?.scrollTo({ left: newScroll, behavior: 'auto' });
             }
         };
         videoPlayer.on('timeupdate', checkFollow);
         return () => videoPlayer.off('timeupdate', checkFollow);
    }, [videoPlayer, timeToPixel, realToVirtualTime, isDragging, viewportWidth]);


    // User Interaction Handlers
    const handleMouseDown = useCallback((e) => {
        if (!scrollContainerRef.current) return;
        
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const actualX = x + scrollLeft;
        const vTime = pixelToTime(actualX);
        const rTime = virtualToRealTime(vTime);
        const isRulerClick = y <= RULER_HEIGHT;

        if (isRulerClick) {
            setIsScrubbing(true);
            onSeek && onSeek(Math.max(0, Math.min(rTime, duration)));
            setIsDragging(true);
            return;
        }

        const videoY = TRACK_START_Y;
        const audioY = hasVideo ? (videoY + TRACK_HEIGHT + TRACK_GAP) : TRACK_START_Y;
        const isWithinTimeRange = actualX >= 0 && actualX <= timeToPixel(layoutDuration);
        
        // --- PRIORITY 1: Silence Segments (The Red/Dark Overlays) ---
        // These should take precedence because they are "on top" visually
        // 我们将其落点限制在音频轨道，与绘制逻辑保持一致
        if (hasAudio && isWithinTimeRange && (y >= audioY && y <= audioY + TRACK_HEIGHT)) {
            // Check PENDING segments first (Red ones - usually what the user is working with)
            for (let i = 0; i < pendingSegments.length; i++) {
                const seg = pendingSegments[i];
                const sPos = timeToPixel(realToVirtualTime(seg.start)) - scrollLeft;
                const ePos = timeToPixel(realToVirtualTime(seg.end)) - scrollLeft;
                
                // Edge hit testing
                if (Math.abs(actualX - (sPos + scrollLeft)) < 8) {
                    setDragMode({ type: 'start', idx: i, list: 'pending' });
                    setSelectedIndices([i]);
                    setSelectedTrack('pending'); 
                    setIsDragging(true);
                    return;
                }
                if (Math.abs(actualX - (ePos + scrollLeft)) < 8) {
                    setDragMode({ type: 'end', idx: i, list: 'pending' });
                    setSelectedIndices([i]);
                    setSelectedTrack('pending');
                    setIsDragging(true);
                    return;
                }

                // Body hit testing
                if (rTime >= seg.start && rTime <= seg.end) {
                    setSelectedTrack('pending');
                    setSelectedIndices([i]);
                    setIsDragging(true);
                    return;
                }
            }

            // Check CONFIRMED segments (Dark ones)
            for (let i = 0; i < silenceSegments.length; i++) {
                const seg = silenceSegments[i];
                const sPos = timeToPixel(seg.start) - scrollLeft;
                const ePos = timeToPixel(seg.end) - scrollLeft;
                
                if (Math.abs(actualX - (sPos + scrollLeft)) < 8) {
                    setDragMode({ type: 'start', idx: i, list: 'silence' });
                    setSelectedIndices([i]);
                    setSelectedTrack('silence');
                    setIsDragging(true);
                    return;
                }
                if (Math.abs(actualX - (ePos + scrollLeft)) < 8) {
                    setDragMode({ type: 'end', idx: i, list: 'silence' });
                    setSelectedIndices([i]);
                    setSelectedTrack('silence');
                    setIsDragging(true);
                    return;
                }

                if (rTime >= seg.start && rTime <= seg.end) {
                    setSelectedTrack('silence');
                    setSelectedIndices([i]);
                    setIsDragging(true);
                    return;
                }
            }
        }

        // --- PRIORITY 2: Media Tracks (Clips) ---
        let linkSelection = false;
        // 允许在整个轨道宽度（含超出时长部分）点击以选中轨道
        if (hasVideo && y >= videoY && y <= videoY + TRACK_HEIGHT) {
            linkSelection = true;
        } else if (hasAudio && y >= audioY && y <= audioY + TRACK_HEIGHT) {
            linkSelection = true;
        }
        
        if (linkSelection) {
            setSelectedTrack('media');
            let foundIdx = -1;
            // 只有在有效时间范围内才去寻找具体的片段
            if (isWithinTimeRange && viewMode === 'fragmented' && speechClips) {
                foundIdx = speechClips.findIndex(c => vTime >= c.virtualStart && vTime <= (c.virtualStart + c.duration));
            }
            if (foundIdx !== -1) {
                setSelectedIndices([foundIdx]);
            } else {
                setSelectedIndices([]); // 选中了轨道，但没选中具体片段
            }
        } else {
            // Nothing hit -> Start Box Selection
            setSelectedTrack(null);
            setSelectedIndices([]);
            setSelectionBox({ x1: actualX, y1: y, x2: actualX, y2: y });
        }

        setIsDragging(true);
    }, [scrollLeft, pixelToTime, virtualToRealTime, realToVirtualTime, timeToPixel, onSeek, duration, layoutDuration, silenceSegments, pendingSegments, hasVideo, zoom, viewMode, speechClips]);

    const handleMouseMove = useCallback((e) => {
        if (!scrollContainerRef.current) return;
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const actualX = x + scrollLeft;
        const vTime = pixelToTime(actualX);
        const rTime = virtualToRealTime(vTime);

        if (!isDragging) {
            // Cursor Feedback
            if (viewMode === 'continuous') {
                const audioY = hasVideo ? (TRACK_START_Y + TRACK_HEIGHT + TRACK_GAP) : TRACK_START_Y;
                if (hasAudio && y >= audioY && y <= audioY + TRACK_HEIGHT) {
                    const HIT_THRESHOLD = 8 / zoom;
                    const isNearEdge = silenceSegments.some(seg => 
                        Math.abs(rTime - seg.start) < HIT_THRESHOLD || 
                        Math.abs(rTime - seg.end) < HIT_THRESHOLD
                    );
                    scrollContainerRef.current.style.cursor = isNearEdge ? 'ew-resize' : 'default';
                } else {
                    scrollContainerRef.current.style.cursor = 'default';
                }
            }
            return;
        }
        
        if (isScrubbing) {
            onSeek && onSeek(Math.max(0, Math.min(rTime, duration)));
        } else if (selectionBox) {
            setSelectionBox(prev => ({ ...prev, x2: actualX, y2: y }));
        } else if (dragMode) {
            const isPending = dragMode.list === 'pending';
            const type = isPending ? 'pending' : 'silence';
            
            const newRange = {};
            if (dragMode.type === 'start') {
                newRange.start = rTime;
            } else {
                newRange.end = rTime;
            }
            
            // Dragging is ephemeral, skip history
            updateSegment(dragMode.idx, newRange, type, true);
        }
    }, [isDragging, isScrubbing, selectionBox, dragMode, viewMode, scrollLeft, pixelToTime, virtualToRealTime, onSeek, duration, silenceSegments, pendingSegments, hasVideo, zoom, updateSegment]);

    const handleMouseUp = useCallback(() => {
        if (selectionBox) {
            // Calculate final selections based on box rectangle
            const xMin = Math.min(selectionBox.x1, selectionBox.x2);
            const xMax = Math.max(selectionBox.x1, selectionBox.x2);
            
            if (Math.abs(xMax - xMin) > 5) { // Minimum drag distance to trigger multi-select
                const newIndices = [];
                let trackType = null;

                if (viewMode === 'fragmented') {
                    trackType = 'media';
                    speechClips.forEach((c, idx) => {
                        const s = timeToPixel(c.virtualStart);
                        const e = timeToPixel(c.virtualStart + c.duration);
                        if (e > xMin && s < xMax) {
                            newIndices.push(idx);
                        }
                    });
                } else {
                    // In continuous mode, check pending/silence
                    // Priority to pending
                    pendingSegments.forEach((s, idx) => {
                        const startX = timeToPixel(s.start);
                        const endX = timeToPixel(s.end);
                        if (endX > xMin && startX < xMax) {
                            newIndices.push(idx);
                        }
                    });
                    if (newIndices.length > 0) {
                        trackType = 'pending';
                    } else {
                        silenceSegments.forEach((s, idx) => {
                            const startX = timeToPixel(s.start);
                            const endX = timeToPixel(s.end);
                            if (endX > xMin && startX < xMax) {
                                newIndices.push(idx);
                            }
                        });
                        if (newIndices.length > 0) trackType = 'silence';
                    }
                }

                if (newIndices.length > 0) {
                    setSelectedTrack(trackType);
                    setSelectedIndices(newIndices);
                }
            }
            setSelectionBox(null);
        }

        if (dragMode && dragMode.list === 'silence') {
            // Commit final position to history exactly once on release
            const seg = silenceSegments[dragMode.idx];
            if (seg) {
                updateSegment(dragMode.idx, { start: seg.start, end: seg.end }, 'silence', false);
            }
        }
        setIsDragging(false);
        setIsScrubbing(false);
        setDragMode(null);
    }, [selectionBox, dragMode, viewMode, speechClips, pendingSegments, silenceSegments, timeToPixel, updateSegment]);

    // Handle Context Menu closing
    useEffect(() => {
        const hideMenu = () => setContextMenu(null);
        window.addEventListener('click', hideMenu);
        return () => window.removeEventListener('click', hideMenu);
    }, []);

    // Keyboard Deletion
    useEffect(() => {
        const handleKeys = (e) => {
            // Ignore if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const isDel = e.key === 'Delete' || e.key === 'Backspace';
            if (!isDel) return;

            if (selectedIndices.length > 0) {
                e.preventDefault();
                if (selectedTrack === 'pending') {
                    bulkDelete(selectedIndices, 'pending');
                    setSelectedIndices([]);
                } else if (selectedTrack === 'silence') {
                    bulkDelete(selectedIndices, 'silence');
                    setSelectedIndices([]);
                } else if (selectedTrack === 'media') {
                    // 如果在碎片模式下选中了具体片段，则执行批量删除片段
                    if (viewMode === 'fragmented' && selectedIndices.length > 0) {
                        bulkDelete(selectedIndices, 'media');
                    } else {
                        // 否则（连续模式，或碎片模式下选中整个轨道），执行删除整个媒体
                        onDeleteMedia && onDeleteMedia();
                    }
                    setSelectedTrack(null);
                    setSelectedIndices([]);
                }
            } else if (selectedTrack === 'media') {
                // In continuous mode, indices might be empty but track is media (whole track selected)
                e.preventDefault();
                onDeleteMedia && onDeleteMedia();
                setSelectedTrack(null);
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [selectedIndices, selectedTrack, viewMode, bulkDelete, onDeleteMedia]);

    // Zoom Handlers
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const onWheel = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.01;
                
                setZoom(prevZoom => {
                    // 允许缩得更小 (minZoom 的 0.5倍)，直到波形只占屏幕一小部分，方便全局观察
                    const newZoom = Math.max(minZoom * 0.5, Math.min(MAX_ZOOM, prevZoom * (1 + delta)));
                    
                    const currentScrollLeft = el.scrollLeft;
                    const rect = el.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    
                    const timeAtMouse = (currentScrollLeft + mouseX) / prevZoom;
                    const newScrollLeft = timeAtMouse * newZoom - mouseX;
                    
                    requestAnimationFrame(() => {
                        if (el) el.scrollLeft = Math.max(0, newScrollLeft);
                    });

                    return newZoom;
                });
            }
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        // Also listen for mouse moves globally if dragging? 
        return () => el.removeEventListener('wheel', onWheel);
    }, [minZoom]); 

    return (
        <div className="timeline-component" style={{ 
            position: 'relative', 
            width: '100%', 
            height: '100%', 
            background: COLORS.background, 
            display: 'flex', 
            flexDirection: 'row'
        }}>
            {/* Left Sidebar Headers */}
            <div style={{
                width: HEADER_WIDTH,
                background: COLORS.background,
                borderRight: `1px solid ${COLORS.rulerLine}`,
                display: 'flex',
                flexDirection: 'column',
                zIndex: 10,
                flexShrink: 0
            }}>
                {/* Top Corner Spacer */}
                <div style={{ height: RULER_HEIGHT, borderBottom: `1px solid ${COLORS.rulerLine}` }} />
                
                {/* Track Headers */}
                {/* Video Icon */}
                {hasVideo && (
                    <div 
                        style={{ 
                            marginTop: 4, 
                            height: TRACK_HEIGHT, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            color: selectedTrack === 'media' ? COLORS.videoText : '#666',
                            cursor: 'pointer',
                            background: selectedTrack === 'media' ? 'rgba(62, 107, 86, 0.2)' : 'transparent',
                            borderLeft: selectedTrack === 'media' ? `3px solid ${COLORS.videoTrackBorder}` : 'none'
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedTrack('media');
                            setSelectedIndices([]);
                        }}
                    >
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V1zm4 0v6h8V1H4zm8 8H4v6h8V9zM1 1v2h2V1H1zm2 3H1v2h2V4zM1 7v2h2V7H1zm2 3H1v2h2v-2zm-2 3v2h2v-2H1zM15 1h-2v2h2V1zm-2 3v2h2V4h-2zm2 3h-2v2h2V7zm-2 3v2h2v-2h-2zm2 3h-2v2h2v-2z"/></svg> 
                    </div>
                )}
                {/* Audio Icon */}
                {hasAudio && (
                    <div 
                        style={{ 
                            marginTop: hasVideo ? TRACK_GAP : 4, 
                            height: TRACK_HEIGHT, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            color: selectedTrack === 'media' ? COLORS.waveformFill : '#666',
                            cursor: 'pointer',
                            background: selectedTrack === 'media' ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
                            borderLeft: selectedTrack === 'media' ? `3px solid ${COLORS.audioTrackBorder}` : 'none'
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedTrack('media');
                            setSelectedIndices([]);
                        }}
                    >
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/><path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z"/><path d="M10.025 8a4.486 4.486 0 0 1-1.318 3.182L8 10.475A3.489 3.489 0 0 0 9.025 8c0-.966-.392-1.841-1.025-2.475l.707-.707A4.486 4.486 0 0 1 10.025 8zM7 4a.5.5 0 0 0-.812-.39L3.825 5.5H1.5A.5.5 0 0 0 1 6v4a.5.5 0 0 0 .5.5h2.325l2.363 1.89A.5.5 0 0 0 7 12V4zM4.312 6.39 6 5.04v5.92L4.312 9.61A.5.5 0 0 0 4 9.5H2v-3h2a.5.5 0 0 0 .312-.11z"/></svg>
                    </div>
                )}
            </div>

            {/* Scrolling Content */}
            <div 
                ref={scrollContainerRef}
                style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (!scrollContainerRef.current) return;
                    const rect = scrollContainerRef.current.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const actualX = x + scrollLeft;
                    const time = pixelToTime(actualX);
                    
                    const audioY = hasVideo ? (TRACK_START_Y + TRACK_HEIGHT + TRACK_GAP) : TRACK_START_Y;
                    if (hasAudio && y >= audioY && y <= audioY + TRACK_HEIGHT) {
                        setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            time: time
                        });
                    }
                }}
                onScroll={handleScroll} 
                // onWheel is handled by effect
            >
                {/* Spacer to force scroll width */}
                <div style={{ width: `${totalWidth}px`, height: '1px' }} />
                
                {/* Canvas Container - Sticky or Fixed-ish */}
                <div style={{ position: 'sticky', left: 0, top: 0, height: '100%' }}>
                     <canvas 
                        ref={staticCanvasRef}
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                     />
                     <canvas 
                        ref={dynamicCanvasRef}
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} 
                     />
                </div>
            </div>
            
            {/* Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: '#222',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '4px 0',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    fontSize: '12px',
                    minWidth: '120px'
                }}>
                    <div 
                        style={{ 
                            padding: '8px 16px', 
                            color: '#eee', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                        className="context-menu-item"
                        onClick={(e) => {
                            e.stopPropagation();
                            const newSeg = {
                                start: contextMenu.time,
                                end: Math.min(contextMenu.time + 1.0, duration), 
                                duration: Math.min(1.0, duration - contextMenu.time)
                            };
                            const updated = [...silenceSegments, newSeg].sort((a,b) => a.start - b.start);
                            onUpdateSegments && onUpdateSegments(updated);
                            setContextMenu(null);
                        }}
                    >
                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                        </svg>
                        添加静音遮罩
                    </div>
                </div>
            )}
            
            <style>{`
                .context-menu-item:hover {
                    background: #345cf0;
                    color: white !important;
                }
            `}</style>
            
            {/* Zoom Controls or Info could go here? */}
        </div>
    );
};

export default Timeline;
