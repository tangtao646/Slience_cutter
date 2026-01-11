import React from 'react';
import PreviewSection from './PreviewSection';
import TransportBar from './TransportBar';

const LeftPanel = ({ appData, currentFile, onFileSelect, waveInfo, setWaveInfo, setFileInfo, setVideoDuration, segments, pendingSegments, viewMode, stats }) => {
    // 逻辑判定：如果在切片预览模式下，没有任何剩余片段（全部被删或被屏蔽），
    // 视觉上应该回退到“导入视图”占位，提醒用户当前没有可播放内容。
    const isProjectEmpty = currentFile && viewMode === 'fragmented' && (stats?.remaining || 0) <= 0.01;
    const effectiveFile = isProjectEmpty ? null : currentFile;

    return (
        <div className="left-panel">
            <PreviewSection 
                appData={appData} 
                currentFile={effectiveFile} 
                onFileSelect={onFileSelect}
                setFileInfo={setFileInfo}
                setVideoDuration={setVideoDuration}
            />

            <TransportBar 
                appData={appData} 
                currentFile={effectiveFile} 
                segments={segments}
                pendingSegments={pendingSegments}
                viewMode={viewMode}
                stats={stats}
            />
        </div>
    );
};

export default LeftPanel;
