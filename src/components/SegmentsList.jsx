import React from 'react';
import { formatDuration } from '../modules/utils';

const SegmentsList = ({ segments = [], pendingSegments = [] }) => {
    return (
        <div className="segments-list show">
            {segments.length === 0 && pendingSegments.length === 0 ? (
                <div className="segment-item" style={{ color: '#555', border: 'none' }}>No segments detected</div>
            ) : (
                <>
                    {/* 优先显示已确定的 */}
                    {segments.map((segment, index) => (
                        <div key={`conf-${index}`} className="segment-item" style={{ borderLeft: '2px solid #555' }}>
                            <span className="segment-time" style={{ color: '#888' }}>
                                {formatDuration(segment.start)} - {formatDuration(segment.end)}
                            </span>
                            <span className="segment-duration" style={{ color: '#666' }}>
                                {(segment.duration || (segment.end - segment.start)).toFixed(1)}s (Applied)
                            </span>
                        </div>
                    ))}
                    {/* 显示待处理的 */}
                    {pendingSegments.map((segment, index) => (
                        <div key={`pen-${index}`} className="segment-item" style={{ borderLeft: '2px solid #ef4444' }}>
                            <span className="segment-time">
                                {formatDuration(segment.start)} - {formatDuration(segment.end)}
                            </span>
                            <span className="segment-duration" style={{ color: '#ef4444' }}>
                                {(segment.duration || (segment.end - segment.start)).toFixed(1)}s
                            </span>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};

export default SegmentsList;
