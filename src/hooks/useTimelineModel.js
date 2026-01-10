import { useMemo, useCallback } from 'react';
import { 
    mergeSegments, 
    calculateTimelineStats, 
    generateSpeechClips,
    realToVirtualTime as r2v,
    virtualToRealTime as v2r
} from '../modules/timeline-logic';

/**
 * useTimelineModel Hook
 * 处理 Timeline 的业务逻辑中台
 */
export function useTimelineModel({
    totalDuration,
    confirmedSegments,
    setConfirmedSegments,
    pendingSegments,
    setPendingSegments,
    viewMode
}) {
    // 1. 衍生状态：合并后的静音区 (用于计算和虚拟时间映射)
    const mergedSilences = useMemo(() => 
        mergeSegments(confirmedSegments), 
        [confirmedSegments]
    );

    // 2. 衍生状态：统计信息 (唯一源计算)
    const stats = useMemo(() => 
        calculateTimelineStats(totalDuration, confirmedSegments, pendingSegments),
        [totalDuration, confirmedSegments, pendingSegments]
    );

    // 3. 衍生状态：碎片化视图的语音片段
    const speechClips = useMemo(() => 
        generateSpeechClips(totalDuration, mergedSilences),
        [totalDuration, mergedSilences]
    );

    const virtualDuration = useMemo(() => stats.remaining, [stats.remaining]);

    // 4. 时间转换辅助函数 (闭包引用当前 mergedSilences)
    const realToVirtual = useCallback((t) => r2v(t, mergedSilences), [mergedSilences]);
    const virtualToReal = useCallback((t) => v2r(t, mergedSilences), [mergedSilences]);

    // 5. 业务操作方法
    
    // 更新静音块 (手动调整边缘)
    const updateSegment = useCallback((index, newRange, type = 'silence') => {
        if (type === 'silence') {
            const next = [...confirmedSegments];
            next[index] = { ...next[index], ...newRange };
            setConfirmedSegments(next);
        } else if (type === 'pending') {
            const next = [...pendingSegments];
            next[index] = { ...next[index], ...newRange };
            setPendingSegments(next);
        }
    }, [confirmedSegments, setConfirmedSegments, pendingSegments, setPendingSegments]);

    // 删除静音块 (人为修正探测结果)
    const deleteSegment = useCallback((index, type = 'silence') => {
        if (type === 'silence') {
            setConfirmedSegments(prev => prev.filter((_, i) => i !== index));
        } else if (type === 'pending') {
            setPendingSegments(prev => prev.filter((_, i) => i !== index));
        }
    }, [setConfirmedSegments, setPendingSegments]);

    // 删除语音片段 (碎片化模式下的人为剔除)
    const deleteSpeechClip = useCallback((clipIndex) => {
        const clip = speechClips[clipIndex];
        if (!clip) return;
        
        // 逻辑：删除语音片段 = 将该片段对应的范围识别为静音区
        const newSilence = { start: clip.start, end: clip.end };
        setConfirmedSegments(prev => [...prev, newSilence]);
    }, [speechClips, setConfirmedSegments]);

    return {
        // Data
        stats,
        speechClips,
        virtualDuration,
        confirmedSegments, // 添加导出
        pendingSegments,   // 添加导出
        
        // Helpers
        realToVirtual,
        virtualToReal,
        
        // Actions
        updateSegment,
        deleteSegment,
        deleteSpeechClip
    };
}
