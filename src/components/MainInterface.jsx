import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { message } from '@tauri-apps/plugin-dialog';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import WaveformSection from './WaveformSection';
import ExportProgressModal from './ExportProgressModal';
import { formatDuration, formatFileSize } from '../modules/utils';
import { useTimelineModel } from '../hooks/useTimelineModel';
import { mergeSegments, subtractSegments } from '../modules/timeline-logic';

const MainInterface = ({ appData, isTauri }) => {
    console.log('[MainInterface] Render', { hasFile: !!appData?.state?.currentFile });
    const [currentFile, setCurrentFile] = useState(null);
    const [fileInfo, setFileInfo] = useState({
        name: '--',
        size: '--',
        duration: '--:--',
        format: '--',
        hasVideo: true,
        hasAudio: true
    });
    // Guard against NaN init
    const [videoDuration, setVideoDuration] = useState(() => {
        const d = (appData?.state?.audioData?.duration) || 0;
        return Number.isFinite(d) ? d : 0;
    }); // 数值型原始时长
    const [confirmedSegments, setConfirmedSegments] = useState([]); // 基准：已确认剪掉的部分
    const [pendingSegments, setPendingSegments] = useState([]); // 动态：当前按钮探测出的拟剪掉部分
    const [viewMode, setViewMode] = useState('continuous'); // 'continuous' (overlays) or 'fragmented' (cut)
    const [waveInfo, setWaveInfo] = useState('Wait for a file...');
    const [intensity, setIntensity] = useState(0.25); // 数值化：0.0 (None) 到 1.0 (Super)
    const [committedIntensity, setCommittedIntensity] = useState(0); // 已固化的强度基准
    const [history, setHistory] = useState([]); // 撤销历史：存储 { confirmedSegments, committedIntensity }
    const [threshold, setThreshold] = useState(0.015);
    const [isAutoThreshold, setIsAutoThreshold] = useState(true); // 新增：是否处于自动阈值模式
    const [padding, setPadding] = useState(0.25); // Speech Padding (Humanization)
    const [exportEnabled, setExportEnabled] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportMessage, setExportMessage] = useState('');
    const [exportEta, setExportEta] = useState(0);
    const [timeDisplay, setTimeDisplay] = useState(['15m', '30m', '45m']);
    const [audioDataReady, setAudioDataReady] = useState(0); 

    // --- 核心状态变更与历史记录 (Undo) ---
    const commitSegments = useCallback((newSegments, skipHistory = false) => {
        if (!skipHistory) {
            // 保存当前状态到历史记录
            setHistory(prev => {
                const last = prev[prev.length - 1];
                // 如果当前状态和最后一次历史一致，不重复压栈
                if (last && JSON.stringify(last.confirmedSegments) === JSON.stringify(confirmedSegments)) {
                    return prev;
                }
                return [...prev, {
                    confirmedSegments: [...confirmedSegments],
                    committedIntensity: committedIntensity
                }].slice(-30);
            });
        }
        
        setConfirmedSegments(newSegments);
        setExportEnabled(true);
    }, [confirmedSegments, committedIntensity]);

    // 使用中台 Hook 管理核心逻辑
    const timeline = useTimelineModel({
        totalDuration: videoDuration || (appData?.state?.audioData?.duration) || 0,
        confirmedSegments,
        setConfirmedSegments: commitSegments, // 核心重构：注入带历史功能的 commit 函数
        pendingSegments,
        setPendingSegments,
        viewMode
    });

    const { stats, speechClips, mergedSilences } = timeline;

    const handleUndo = useCallback(() => {
        if (history.length === 0) {
            setWaveInfo('没有可撤销的操作');
            return;
        }
        const lastSnapshot = history[history.length - 1];
        
        // 恢复状态
        setConfirmedSegments(lastSnapshot.confirmedSegments);
        setCommittedIntensity(lastSnapshot.committedIntensity);
        setIntensity(lastSnapshot.committedIntensity); 
        
        setHistory(prev => prev.slice(0, -1));
        setWaveInfo('已撤销上一步操作');
    }, [history]);

    // 监听全局快捷键 Cmd/Ctrl + Z
    useEffect(() => {
        const handleKeyDown = (e) => {
            // 排除输入框，避免干扰正常的文本输入撤销
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo]);

    // 重要：同步 confirmedSegments 状态到全局单例 appData.state
    // 确保导出模块和后台逻辑始终能拿到最新的“已确认”剪辑
    useEffect(() => {
        if (appData?.state) {
            appData.state.silenceSegments = confirmedSegments.map(s => ({
                startTime: s.start,
                endTime: s.end,
                duration: s.end - s.start,
                averageDb: s.averageDb || -60.0
            }));
        }
    }, [confirmedSegments, appData]);

    const handleUpdateSegments = useCallback((newSegments) => {
        // 用户手动调整（拖拽等）
        commitSegments(newSegments);
    }, [commitSegments]);

    // 同步时间显示
    useEffect(() => {
        const remaining = stats.remaining;
        setTimeDisplay([
            `${Math.floor(remaining * 0.25 / 60)}m`,
            `${Math.floor(remaining * 0.5 / 60)}m`,
            `${Math.floor(remaining * 0.75 / 60)}m`
        ]);
    }, [stats.remaining]);

    // 文件格式辅助函数
    const getFileFormat = (filename) => {
        if (!filename) return '未知';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toUpperCase() : '未知';
    };

    const handleAnalyze = useCallback(async (overrides = {}) => {
        const targetIntensity = overrides.intensity !== undefined ? overrides.intensity : intensity;
        
        if (!currentFile || !appData.state.audioData) {
            return;
        }

        // None 档位逻辑处理：不做任何新的探测处理
        if (targetIntensity === 0) {
            setPendingSegments([]);
            setWaveInfo('Selected Strategy: None (No processing)');
            return;
        }

        // 将 0.0 - 1.0 的强度映射到特定的策略参数（除 Threshold 以外）
        // 映射逻辑：档位越高，探测越激进 (minSilence 越小)，留白越少 (padding 越小)
        
        let minSilenceDuration = 0.8;
        let targetPadding = padding;

        if (targetIntensity <= 0.25) {
            // Linear between None(3.0) and Natural(0.8)
            const ratio = targetIntensity / 0.25;
            minSilenceDuration = 3.0 - (2.2 * ratio);
            targetPadding = 0.5 - (0.25 * ratio);
        } else if (targetIntensity <= 0.5) {
            // Linear between Natural(0.8) and Fast(0.5)
            const ratio = (targetIntensity - 0.25) / 0.25;
            minSilenceDuration = 0.8 - (0.3 * ratio);
            targetPadding = 0.25 - (0.1 * ratio);
        } else {
            // Linear between Fast(0.5) and Super(0.2)
            const ratio = (targetIntensity - 0.5) / 0.5;
            minSilenceDuration = 0.5 - (0.3 * ratio);
            targetPadding = 0.15 - (0.1 * ratio);
        }

        // 仅同步策略参数，Threshold 完全独立管理
        setPadding(targetPadding);

        console.log(`[MainInterface] Starting analysis: Intensity=${targetIntensity.toFixed(2)}, minDur=${minSilenceDuration.toFixed(2)}s, threshold=${threshold.toFixed(3)} (Auto=${isAutoThreshold})`);
        setWaveInfo('正在分析静音...');
        
        try {
            const thresholdDb = 20 * Math.log10(threshold || 0.001);
            const audioData = appData.state.audioData;
            
            const rawSilences = await appData.tauri.detect_silences_with_params({
                cache_id: audioData.cache_id || currentFile.path, 
                threshold_db: thresholdDb,
                min_silence_duration: minSilenceDuration,
                sample_rate: audioData.sample_rate
            });

            // 人性化处理：应用 Padding (留白)
            // 每一个静音区间的两头都要缩进一段距离，给说话留下呼吸感，避免“切到字”
            const processedSilences = rawSilences
                .map(s => {
                    const newStart = s.startTime + targetPadding;
                    const newEnd = s.endTime - targetPadding;
                    return {
                        ...s,
                        startTime: newStart,
                        endTime: newEnd,
                        duration: newEnd - newStart
                    };
                })
                // 如果留白后静音区间消失了（太短了），则忽略该片段
                .filter(s => s.duration > 0.05);

            console.log(`[MainInterface] Detection finished: ${rawSilences.length} raw -> ${processedSilences.length} padded segments`);
            appData.state.silenceSegments = processedSilences;
            
            // 保持原始数值，仅在呈现时格式化
            const mappedSegments = processedSilences.map(s => ({
                start: s.startTime,
                end: s.endTime,
                duration: s.duration,
                averageDb: s.averageDb,
                raw: s
            }));

            // 核心改进：只保留“新增”的探测结果。
            // 如果探测结果包含了已经确认切掉的部分，就通过减法将其剔除。
            const newOnly = subtractSegments(mappedSegments, confirmedSegments);
            setPendingSegments(newOnly);
            
            setExportEnabled(true);
            setWaveInfo(`当前探测到 ${processedSilences.length} 个建议剪减区`);
            
            // Stats 和 TimeDisplay 现在通过 useMemo 自动同步，无需手动 set
        } catch (error) {
            console.error('Analysis failed:', error);
            setWaveInfo('分析失败');
        }
    }, [currentFile, intensity, threshold, padding, videoDuration, appData, fileInfo.hasAudio]);

    // 自动化检测 Effect：主要用于处理滑块的防抖重算
    useEffect(() => {
        if (currentFile && appData.state.audioData) {
            const timer = setTimeout(() => {
                handleAnalyze();
            }, 400); 
            return () => clearTimeout(timer);
        }
    }, [threshold, padding, intensity, currentFile?.path, audioDataReady, handleAnalyze]);

    const handleFileSelect = async (info) => {
        console.log('[MainInterface] File selected:', info);
        // 先丰富 info 对象
        if (isTauri && info.path && !info.path.startsWith('blob:') && !info.path.startsWith('http')) {
            const assetUrl = appData.tauri.getFileSrc(info.path);
            appData.state.currentVideoPath = info.path;
            info.previewPath = assetUrl;
            console.log('[MainInterface] Set previewPath to custom source:', assetUrl);
        } else if (info.path && (info.path.startsWith('blob:') || info.path.startsWith('http'))) {
            info.previewPath = info.path;
        }

        // 确定 previewPath 之后立即设置状态，确保预览组件能拿到有效的 src，不等待音频分析
        // 关键修复：先 set state，再 await 处理音频
        setCurrentFile({ ...info });
        appData.state.currentFile = info;
        
        // 切新文件时，必须清空旧的剪辑段，避免时长冲突导致崩溃
        setConfirmedSegments([]);
        setPendingSegments([]);
        setHistory([]);
        setExportEnabled(false);

        const isAudioOnly = /\.(mp3|wav|m4a|flac|aac|ogg)$/i.test(info.name);

        setFileInfo({
            name: info.name,
            size: info.file ? formatFileSize(info.file.size) : '--',
            duration: '--:--',
            format: getFileFormat(info.name),
            hasVideo: !isAudioOnly,
            hasAudio: true
        });

        // 立即尝试获取视频时长（通过 Preview 组件回调或者 Tauri 调用）
        if (isTauri && info.path && !info.path.startsWith('blob:')) {
            appData.tauri.invoke('get_video_info', { path: info.path })
                .then(videoInfo => {
                    if (videoInfo) {
                       const safeDuration = Number.isFinite(videoInfo.duration) ? videoInfo.duration : 0;
                       setVideoDuration(safeDuration);
                       setFileInfo(prev => ({
                           ...prev,
                           duration: formatDuration(safeDuration),
                           hasVideo: !!videoInfo.has_video,
                           hasAudio: !!videoInfo.has_audio
                       }));
                    }
                })
                .catch(e => console.warn('Fast video info fetch failed', e));
        }

        // 异步开始音频提取，不阻塞界面显示
        setWaveInfo('正在提取音频...');
        requestAnimationFrame(async () => {
             try {
                await extractAudio(info);
            } catch (error) {
                console.error('Audio extraction failed:', error);
                setWaveInfo('提取失败');
            }
        });
    };

    const extractAudio = async (info) => {
        let backendPath = info.path;
        
        if (info.file && isTauri) {
            backendPath = await appData.uploader.startUploadFile(info.file, (progress) => {
                setWaveInfo(`上传中... ${(progress * 100).toFixed(0)}%`);
            });
            if (backendPath) {
                const assetUrl = appData.tauri.getFileSrc(backendPath);
                info.previewPath = assetUrl;
                appData.state.currentVideoPath = backendPath;
                setCurrentFile({ ...info });
            }
        }
        
        if (!backendPath && info.file) {
            backendPath = URL.createObjectURL(info.file);
            info.previewPath = backendPath;
            setCurrentFile({ ...info });
        }

        if (!backendPath) return;

        const audioData = await appData.tauri.extractAudio(backendPath);
        if (audioData && (audioData.peaks || audioData.cache_id)) {
            appData.state.audioData = audioData;
            setWaveInfo('音频已提取');
            
            // 重要：同步数值时长到中台 Hook
            // 注意：如果音频提取出的时长为 0（静音视频），则不覆盖已通过 ffprobe 获取的时长
            if (Number.isFinite(audioData.duration) && audioData.duration > 0) {
                setVideoDuration(audioData.duration);
                setFileInfo(prev => ({
                    ...prev,
                    duration: formatDuration(audioData.duration)
                }));
            }
            
            setThreshold(0.015);
            setIsAutoThreshold(true);
            
            setAudioDataReady(prev => prev + 1);
        }
    };

    const handleRemoveSilence = useCallback(() => {
        if (pendingSegments.length === 0) {
            setWaveInfo('当前没有新的建议剪减区域');
            return;
        }

        // 保存当前状态到历史记录，以便撤销
        setHistory(prev => [...prev, { 
            confirmedSegments: [...confirmedSegments], 
            committedIntensity: committedIntensity 
        }]);

        // 将新的探测结果合并进基准
        const newBaseline = mergeSegments([...confirmedSegments, ...pendingSegments]);
        setConfirmedSegments(newBaseline);
        setCommittedIntensity(intensity); // 记录当前进度为已固化档位
        setPendingSegments([]); // 清空探测层
        setViewMode('fragmented'); // 自动切换到“切片视图”以显示结果
        
        setWaveInfo('已将探测结果应用到基准，剪辑已生效。您可以切换回连续模式查看更多区域');
    }, [pendingSegments, confirmedSegments, committedIntensity, intensity]);

    const handleExport = async () => {
        console.log('[MainInterface] handleExport clicked', { currentFile, segmentsCount: confirmedSegments.length });
        if (!currentFile || confirmedSegments.length === 0) {
            console.warn('[MainInterface] handleExport aborted: No file or segments');
            return;
        }


        setIsExporting(true);
        setExportProgress(0);
        setExportMessage('正在初始化并行导出...');
        setWaveInfo('正在导出视频...');
        
        try {
            // Determine the actual path the backend should use
            const inputPath = appData.state.currentVideoPath || currentFile.path;
            
            // 导出逻辑：
            // 必须要发送“合并且排序后”的静音区间 (mergedSilences)
            // 因为 Rust 后端会基于这些区间计算“需要保留的语音片段”
            // 如果发送未排序的 confirmedSegments，后端处理逻辑会出错
            const request = {
                inputPath: inputPath,
                thresholdDb: 20 * Math.log10(threshold || 0.01),
                minSilenceDuration: 0.8, 
                segments: mergedSilences.map(s => ({
                    startTime: s.start,
                    endTime: s.end,
                    duration: s.end - s.start,
                    averageDb: s.averageDb || -60.0
                }))
            };

            const result = await appData.tauri.processVideo(request);
            console.log('Export result:', result);
            if (result && result.success) {
                setWaveInfo('导出完成');
                setIsExporting(false);
                
                await message(`文件已保存至：\n${result.outputPath}`, { 
                    title: '导出成功'
                });
            } else if (result && result.cancelled) {
                console.log('Export detected as cancelled');
                setWaveInfo('导出已取消');
                setIsExporting(false);
            } else {
                throw new Error(result?.message || '导出失败');
            }
        } catch (error) {
            console.error('Export failed:', error);
            const errorStr = error.toString();
            if (errorStr.includes('EXPORT_CANCELLED') || error === 'EXPORT_CANCELLED') {
                setWaveInfo('导出已取消');
                setIsExporting(false);
                return;
            }
            setWaveInfo('导出失败');
            setIsExporting(false);
            await message(`导出失败: ${error.message}`, { title: '错误', kind: 'error' });
        }
    };

    const handleCancelExport = async () => {
        console.log('Handling cancel export click...');
        // 瞬间关闭 UI，无需等待后端异步清理完成
        setIsExporting(false);
        setWaveInfo('正在取消...');
        await appData.tauri.cancelExport();
    };

    // 监听片段状态：如果所有片段都被删完了（在切片模式下），重置策略档位
    useEffect(() => {
        if (currentFile && viewMode === 'fragmented' && stats.remaining <= 0.001 && confirmedSegments.length > 0) {
            // 当所有语音都被“删没”了，此时的档位策略已失去意义，重置 UI 到初始 Natural 状态
            // 这也有助于用户重新开始分析，避免逻辑冲突
            setIntensity(0.25);
            setCommittedIntensity(0);
            setWaveInfo('片段已空，档位已重置');
        }
    }, [currentFile, viewMode, stats.remaining, confirmedSegments.length]);

    // 监听后端进度
    useEffect(() => {
        let unlistenFn = null;
        let isCancelled = false;
        
        const setupListener = async () => {
            if (appData.tauri && appData.tauri.listen) {
                const unlisten = await appData.tauri.listen('video-progress', (event) => {
                    const { percent, message, eta } = event.payload;
                    if (percent !== undefined) setExportProgress(percent);
                    if (message !== undefined) setExportMessage(message);
                    if (eta !== undefined) setExportEta(eta);
                });
                
                if (isCancelled) {
                    unlisten();
                } else {
                    unlistenFn = unlisten;
                }
            }
        };

        setupListener();
        return () => {
            isCancelled = true;
            if (unlistenFn) unlistenFn();
        };
    }, [appData.tauri]);

    // 实现虚拟剪辑播放逻辑：自动跳过已经“确认物理剪除”的静音片段
    useEffect(() => {
        if (!appData.videoPlayer) return;

        const handleTimeUpdate = (currentTime) => {
            // 只有在预览模式下且有已确认片段时才跳过
            if (viewMode !== 'fragmented' || !confirmedSegments || confirmedSegments.length === 0) return;

            // 检查当前时间是否落入任何已确定的静音区间
            const silSeg = confirmedSegments.find(seg => currentTime >= (seg.start - 0.05) && currentTime < (seg.end - 0.01));
            
            if (silSeg) {
                appData.videoPlayer.seekTo(silSeg.end);
            }
        };

        appData.videoPlayer.on('timeupdate', handleTimeUpdate);
        return () => appData.videoPlayer.off('timeupdate', handleTimeUpdate);
    }, [viewMode, confirmedSegments, appData.videoPlayer]);

    const handleDeleteTrack = (type) => {
        if (type === 'media') {
            // 真正的移除：清除所有分析和文件状态，彻底重置应用到初始状态
            setCurrentFile(null);
            setFileInfo({
                name: '--', size: '--', duration: '--:--', format: '--',
                hasVideo: true, hasAudio: true // 恢复默认值
            });
            setConfirmedSegments([]);
            setPendingSegments([]);
            setHistory([]); 
            setVideoDuration(0);
            setWaveInfo('No file loaded');
            
            // 重置策略与 UI 状态
            setIntensity(0.25); // 恢复初始 Natural 档位
            setCommittedIntensity(0);
            setThreshold(0.015);
            setIsAutoThreshold(true);
            setPadding(0.25);
            setExportEnabled(false);
            setExportProgress(0);
            
            // 重置全局状态单例
            appData.state.resetFileState();
            
            // 彻底销毁播放器状态
            if (appData.videoPlayer) {
                appData.videoPlayer.destroy();
            }
        } else if (type === 'video') {
            setFileInfo(prev => ({ ...prev, hasVideo: false }));
            appData.state.hasVideo = false;
        } else if (type === 'audio') {
            setFileInfo(prev => ({ ...prev, hasAudio: false }));
            appData.state.hasAudio = false;
            setConfirmedSegments([]);
            setWaveInfo('Audio track removed');
        }
    };

    return (
        <div className="main-container">
            {isExporting && (
                <ExportProgressModal 
                    progress={exportProgress} 
                    message={exportMessage}
                    onCancel={handleCancelExport}
                />
            )}
            {/* Using 100% instead of vh/vw to ensure it stays within root container */}
            <PanelGroup direction="vertical" style={{ height: '100%', width: '100%' }}>
                
                {/* 上方 Panel：限定最小高度 */}
                {/* 假设 RightPanel 最小需要 400px，在 1000px 屏幕下即为 40% */}
                <Panel defaultSize={60} minSize={40}>
                    <PanelGroup direction="horizontal" style={{ height: '100%', width: '100%' }}>
                        {/* 左：播放区（跟随垂直拉伸而此消彼长） */}
                        <Panel defaultSize={75} minSize={30}>
                            <LeftPanel 
                                appData={appData} 
                                currentFile={currentFile}
                                onFileSelect={handleFileSelect}
                                waveInfo={waveInfo}
                                setWaveInfo={setWaveInfo}
                                setFileInfo={setFileInfo}
                                setVideoDuration={setVideoDuration}
                                segments={confirmedSegments}
                                pendingSegments={pendingSegments}
                                viewMode={viewMode}
                                stats={stats}
                            />
                        </Panel>
                        
                        <PanelResizeHandle className="resize-handle-v" />
                        
                        {/* 右：侧边栏（固定宽度，高度占据上方 Panel 全部） */}
                        <Panel defaultSize={25} minSize={20} maxSize={40}>
                            <RightPanel 
                                appData={appData}
                                currentFile={currentFile}
                                fileInfo={fileInfo}
                                segments={confirmedSegments}
                                pendingSegments={pendingSegments}
                                intensity={intensity}
                                setIntensity={setIntensity}
                                threshold={threshold}
                                setThreshold={setThreshold}
                                isAutoThreshold={isAutoThreshold}
                                setIsAutoThreshold={setIsAutoThreshold}
                                padding={padding}
                                setPadding={setPadding}
                                stats={stats}
                                committedIntensity={committedIntensity}
                                exportEnabled={exportEnabled}
                                timeDisplay={timeDisplay}
                                viewMode={viewMode}
                                setViewMode={setViewMode}
                                onAnalyze={handleAnalyze}
                                onRemoveSilence={handleRemoveSilence}
                                onExport={handleExport}
                            />
                        </Panel>
                    </PanelGroup>
                </Panel>
                
                {/* 关键拉伸条：控制上方区域（Video+Sidebar）与下方波形区域的高度比例 */}
                <PanelResizeHandle className="resize-handle-h" />
                
                {/* 下方 Panel：波形区域（全宽） */}
                <Panel defaultSize={40} minSize={15}>
                    <div className="layout-bottom" style={{ height: '100%' }}>
                        <div className="bottom-waveform-area">
                            <WaveformSection 
                                appData={appData} 
                                currentFile={currentFile} 
                                videoDuration={videoDuration}
                                hasVideo={fileInfo.hasVideo}
                                hasAudio={fileInfo.hasAudio}
                                waveInfo={waveInfo}
                                setWaveInfo={setWaveInfo}
                                viewMode={viewMode}
                                timeline={timeline}
                                onDeleteMedia={() => handleDeleteTrack('media')}
                            />
                        </div>
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
};

export default MainInterface;

