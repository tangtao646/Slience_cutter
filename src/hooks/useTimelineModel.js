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
    // 关键变更：为了支持“递进式切片”，碎片视图的基准只由“已确认”的静音区决定。
    // “待处理”的静音区将作为红框显示在片段上，而不是直接切除。
    const mergedSilences = useMemo(() => {
        // 映射逻辑只考虑已确认的剔除
        return mergeSegments(confirmedSegments);
    }, [confirmedSegments]);

    // 2. 衍生状态：统计信息 (唯一源计算)
    const stats = useMemo(() => 
        calculateTimelineStats(totalDuration, confirmedSegments, pendingSegments),
        [totalDuration, confirmedSegments, pendingSegments]
    );

    // 3. 衍生状态：碎片化视图的语音片段 (只根据已确认的静音区生成)
    const speechClips = useMemo(() => 
        generateSpeechClips(totalDuration, mergedSilences),
        [totalDuration, mergedSilences]
    );

    // 虚拟时长现在是“已确认剔除后”的剩余时长（也是时间轴的总长度）
    const virtualDuration = useMemo(() => stats.currentBase, [stats.currentBase]);

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

    // 4. 时间转换辅助函数
    // 修复：在连续模式下，时间轴应保持线性，不进行压缩映射
    const realToVirtual = useCallback((t) => {
        if (viewMode === 'continuous') return t;
        return r2v(t, mergedSilences);
    }, [mergedSilences, viewMode]);

    const virtualToReal = useCallback((t) => {
        if (viewMode === 'continuous') return t;
        return v2r(t, mergedSilences);
    }, [mergedSilences, viewMode]);

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
        const newSilence = { start: clip.start, end: clip.end };
        pushState([...confirmedSegments, newSilence]);
    }, [speechClips, confirmedSegments, pushState]);

    // 批量删除方法
    const bulkDelete = useCallback((indices, type) => {
        if (!indices || indices.length === 0) return;
        
        if (type === 'media') {
            const newSilences = indices
                .map(idx => speechClips[idx])
                .filter(Boolean)
                .map(clip => ({ start: clip.start, end: clip.end }));
            pushState([...confirmedSegments, ...newSilences]);
        } else if (type === 'pending') {
            const next = pendingSegments.filter((_, i) => !indices.includes(i));
            pushState(next, true);
        } else if (type === 'silence') {
            const next = confirmedSegments.filter((_, i) => !indices.includes(i));
            pushState(next, false);
        }
    }, [speechClips, confirmedSegments, pendingSegments, pushState]);

    return {
        // Data
        stats,
        speechClips,
        mergedSilences,
        virtualDuration,
        confirmedSegments, 
        pendingSegments,   
        
        // Helpers
        realToVirtual,
        virtualToReal,
        
        // Actions
        updateSegment,
        deleteSegment,
        deleteSpeechClip,
        bulkDelete
    };
}
