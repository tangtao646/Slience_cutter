import React from 'react';
import { formatDuration } from '../modules/utils';
import { useTranslation } from '../modules/i18n.jsx';

const SegmentsList = ({ segments = [], pendingSegments = [] }) => {
    const { t } = useTranslation();
    return (
        <div className="segments-list show">
            {segments.length === 0 && pendingSegments.length === 0 ? (
                <div className="segment-item" style={{ color: '#555', border: 'none' }}>{t('sidebar.segments_empty')}</div>
            ) : (
                <>
                    {/* 优先显示已确定的 */}
                    {segments.map((segment, index) => (
                        <div key={`conf-${index}`} className="segment-item" style={{ borderLeft: '2px solid #555' }}>
                            <span className="segment-time" style={{ color: '#888' }}>
                                {formatDuration(segment.start)} - {formatDuration(segment.end)}
                            </span>
                            <span className="segment-duration" style={{ color: '#666' }}>
                                {(segment.duration || (segment.end - segment.start)).toFixed(1)}s ({t('sidebar.segments_applied')})
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
