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

    // --- 渐进式重构：统一 Action 中心 ---
    // 所有的修改都通过这个函数，并在此处存入历史记录
    const pushState = useCallback((newSegments, isPending = false, skipHistory = false) => {
        if (!isPending) {
            // 只为已确认为 confirmed 的变更存入历史
            setConfirmedSegments(newSegments, skipHistory);
        } else {
            setPendingSegments(newSegments);
        }
    }, [setConfirmedSegments, setPendingSegments]);

    // 4. 时间转换辅助函数 (闭包引用当前 mergedSilences)
    const realToVirtual = useCallback((t) => r2v(t, mergedSilences), [mergedSilences]);
    const virtualToReal = useCallback((t) => v2r(t, mergedSilences), [mergedSilences]);

    // 5. 业务操作方法 - 保持 API 不变，内部改为调用 pushState
    
    // 更新静音块 (包括 Edge Dragging)
    const updateSegment = useCallback((index, newRange, type = 'silence', skipHistory = false) => {
        if (type === 'silence') {
            const next = [...confirmedSegments];
            next[index] = { ...next[index], ...newRange };
            pushState(next, false, skipHistory); 
        } else if (type === 'pending') {
            const next = [...pendingSegments];
            next[index] = { ...next[index], ...newRange };
            pushState(next, true, skipHistory);
        }
    }, [confirmedSegments, pendingSegments, pushState]);

    // 删除静音块
    const deleteSegment = useCallback((index, type = 'silence') => {
        if (type === 'silence') {
            const next = confirmedSegments.filter((_, i) => i !== index);
            pushState(next);
        } else if (type === 'pending') {
            const next = pendingSegments.filter((_, i) => i !== index);
            pushState(next, true);
        }
    }, [confirmedSegments, pendingSegments, pushState]);

    // 删除语音片段 (碎片化模式下的人为剔除) - 核心：将其转为增加静音区
    const deleteSpeechClip = useCallback((clipIndex) => {
        const clip = speechClips[clipIndex];
        if (!clip) return;
        
        // 关键：基于“非破坏”原则，删除片段 = 增加这一段的静音标记
        const newSilence = { start: clip.start, end: clip.end };
        pushState([...confirmedSegments, newSilence]);
    }, [speechClips, confirmedSegments, pushState]);

    return {
        // Data
        stats,
        speechClips,
        virtualDuration,
        confirmedSegments, 
        pendingSegments,   
        
        // Helpers
        realToVirtual,
        virtualToReal,
        
        // Actions
        updateSegment,
        deleteSegment,
        deleteSpeechClip
    };
}
