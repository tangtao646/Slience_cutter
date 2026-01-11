/**
 * Timeline Logic Engine
 * 负责纯粹的数据转换、时间计算和片段逻辑，不依赖 React 状态
 */

/**
 * 合并并去重片段 (Union of time ranges)
 */
export function mergeSegments(segments) {
    if (!segments || segments.length === 0) return [];

    // 标准化结构并排序
    const sorted = [...segments]
        .map(s => ({
            start: s.start ?? s.startTime ?? 0,
            end: s.end ?? s.endTime ?? 0
        }))
        .sort((a, b) => a.start - b.start);

    const merged = [];
    if (sorted.length === 0) return merged;

    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
        const next = sorted[i];
        if (next.start <= current.end) {
            current.end = Math.max(current.end, next.end);
        } else {
            merged.push(current);
            current = { ...next };
        }
    }
    merged.push(current);
    return merged;
}

/**
 * 计算统计信息
 */
export function calculateTimelineStats(totalDuration, confirmedSegments, pendingSegments) {
    const rawTotal = Number.isFinite(totalDuration) ? totalDuration : 0;

    // 1. 计算已确认剪掉的时长
    const confirmedMerged = mergeSegments(confirmedSegments);
    const confirmedSaved = confirmedMerged.reduce((acc, s) => acc + (s.end - s.start), 0);
    const currentBase = Math.max(0, rawTotal - confirmedSaved);

    // 2. 计算最终预计剪掉的所有时长 (Confirmed + Pending)
    const allSilences = mergeSegments([...(confirmedSegments || []), ...(pendingSegments || [])]);
    const totalSilencesSaved = allSilences.reduce((acc, s) => acc + (s.end - s.start), 0);
    const remaining = Math.max(0, rawTotal - totalSilencesSaved);

    return {
        absoluteOriginal: rawTotal,
        currentBase: Number.isFinite(currentBase) ? currentBase : 0,
        remaining: Number.isFinite(remaining) ? remaining : 0,
        totalSaved: Number.isFinite(totalSilencesSaved) ? totalSilencesSaved : 0,
        cutsCount: allSilences.length,
        pendingCount: (pendingSegments || []).length
    };
}

/**
 * 将真实时间转换为虚拟时间（去除静音区后的排布时间）
 */
export function realToVirtualTime(rTime, silenceSegments) {
    if (!silenceSegments || silenceSegments.length === 0) return rTime;
    
    // 我们假设 silenceSegments 是经过 merge 且排序的
    let offset = 0;
    for (const seg of silenceSegments) {
        if (rTime > seg.end) {
            offset += (seg.end - seg.start);
        } else if (rTime >= seg.start) {
            // 如果落在静音区内，返回该静音区的起始虚拟点
            return seg.start - offset;
        } else {
            break;
        }
    }
    return rTime - offset;
}

/**
 * 将虚拟时间转换回真实时间
 */
export function virtualToRealTime(vTime, silenceSegments) {
    if (!silenceSegments || silenceSegments.length === 0) return vTime;

    let currentVTime = 0;
    let lastREnd = 0;

    for (const seg of silenceSegments) {
        const speechDuration = seg.start - lastREnd;
        if (vTime <= currentVTime + speechDuration) {
            return lastREnd + (vTime - currentVTime);
        }
        currentVTime += speechDuration;
        lastREnd = seg.end;
    }
    
    return lastREnd + (vTime - currentVTime);
}

/**
 * 生成“说话片段” (Speech Clips) 的列表，用于碎片化视图渲染
 */
export function generateSpeechClips(totalDuration, silenceSegments) {
    const merged = mergeSegments(silenceSegments);
    const clips = [];
    let lastEnd = 0;
    let vOffset = 0;

    merged.forEach((seg, idx) => {
        if (seg.start > lastEnd) {
            const duration = seg.start - lastEnd;
            clips.push({
                id: `clip-${idx}`,
                start: lastEnd,
                end: seg.start,
                duration: duration,
                virtualStart: vOffset
            });
            vOffset += duration;
        }
        lastEnd = seg.end;
    });

    if (lastEnd < totalDuration) {
        const duration = totalDuration - lastEnd;
        clips.push({
            id: `clip-last`,
            start: lastEnd,
            end: totalDuration,
            duration: duration,
            virtualStart: vOffset
        });
    }

    return clips;
}

/**
 * 从一组片段中减去另一组片段 (Difference: a - b)
 * 用于当用户已经确认了一些静音区，再次探测时，排除掉这些已确定的区域
 */
export function subtractSegments(a, b) {
    if (!a || a.length === 0) return [];
    if (!b || b.length === 0) return a;
    
    // 为了简化处理，我们遍历 a 中的每一个片段，并在其基础上减去 b
    let result = [...a];
    
    // 将 b 合并以减少计算循环
    const subtractor = mergeSegments(b);
    
    subtractor.forEach(s => {
        const nextResult = [];
        result.forEach(r => {
            // Case 1: 无交集
            if (s.end <= r.start || s.start >= r.end) {
                nextResult.push(r);
            }
            // Case 2: s 完全覆盖 r (被减去)
            else if (s.start <= r.start && s.end >= r.end) {
                // do nothing
            }
            // Case 3: s 在 r 中间 (劈开)
            else if (s.start > r.start && s.end < r.end) {
                nextResult.push({ ...r, end: s.start });
                nextResult.push({ ...r, start: s.end });
            }
            // Case 4: s 覆盖 r 的开头
            else if (s.end > r.start && s.end < r.end) {
                nextResult.push({ ...r, start: s.end });
            }
            // Case 5: s 覆盖 r 的结尾
            else if (s.start > r.start && s.start < r.end) {
                nextResult.push({ ...r, end: s.start });
            }
        });
        result = nextResult;
    });
    
    return result.filter(s => (s.end - s.start) > 0.01);
}
