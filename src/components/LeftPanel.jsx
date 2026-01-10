import React from 'react';
import PreviewSection from './PreviewSection';
import TransportBar from './TransportBar';

const LeftPanel = ({ appData, currentFile, onFileSelect, waveInfo, setWaveInfo, setFileInfo, setVideoDuration, segments, pendingSegments, viewMode, stats }) => {
    return (
        <div className="left-panel">
            <PreviewSection 
                appData={appData} 
                currentFile={currentFile} 
                onFileSelect={onFileSelect}
                setFileInfo={setFileInfo}
                setVideoDuration={setVideoDuration}
            />

            <TransportBar 
                appData={appData} 
                currentFile={currentFile} 
                segments={segments}
                pendingSegments={pendingSegments}
                viewMode={viewMode}
                stats={stats}
            />
        </div>
    );
};

export default LeftPanel;
