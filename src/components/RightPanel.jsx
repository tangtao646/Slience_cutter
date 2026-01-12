import React from 'react';
import IntensitySlider from './IntensitySlider';
import ThresholdSlider from './ThresholdSlider';

const RightPanel = ({ 
    appData, 
    currentFile, 
    fileInfo, 
    segments, 
    pendingSegments = [],
    intensity, 
    setIntensity, 
    threshold, 
    setThreshold, 
    isAutoThreshold,
    setIsAutoThreshold,
    committedIntensity,
    exportEnabled, 
    timeDisplay,
    onAnalyze,
    onRemoveSilence,
    onExport,
    viewMode,
    setViewMode,
    stats
}) => {
    const hasPending = pendingSegments.length > 0;
    const totalCuts = (segments?.length || 0) + (pendingSegments?.length || 0);

    return (
        <div className="right-panel">
            <div className="panel-tabs">
                <div className="panel-tab active">
                    <i className="fa fa-scissors"></i>
                    <span>Silence</span>
                </div>
                <div className="panel-tab">
                    <i className="fa fa-list"></i>
                    <span>Sections</span>
                </div>
                <div 
                    className={`panel-tab ${viewMode === 'fragmented' ? 'export-ready' : ''}`}
                    onClick={viewMode === 'fragmented' ? onExport : undefined}
                    style={{
                        cursor: viewMode === 'fragmented' ? 'pointer' : 'default',
                        transition: 'all 0.2s'
                    }}
                >
                    <i className="fa fa-download"></i>
                    <span>Export</span>
                </div>
            </div>

            
            <div className="panel-content">
                <div className="control-group">
                    <div className="control-label" style={{ marginBottom: '12px' }}>Silence Detection</div>
                    <button 
                        className="action-btn"
                        onClick={onRemoveSilence}
                        style={{
                            width: '100%',
                            background: hasPending ? '#345cf0' : '#2a2a2a',
                            color: hasPending ? 'white' : '#777',
                            border: hasPending ? '1px solid rgba(255,255,255,0.2)' : '1px solid #333',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: hasPending ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            transition: 'background 0.2s, color 0.2s, border-color 0.2s, opacity 0.2s',
                            opacity: hasPending ? 1 : 0.6,
                            marginBottom: '15px'
                        }}
                        title={hasPending ? "Confirm and remove marked areas" : "Adjust intensity to find silence first"}
                    >
                        <span>Remove Silence</span>
                        {hasPending && <span style={{ opacity: 0.9 }}>({pendingSegments.length})</span>}
                    </button>
                </div>

                <IntensitySlider 
                    intensity={intensity} 
                    setIntensity={setIntensity} 
                    committedIntensity={committedIntensity}
                    onAnalyze={onAnalyze}
                />
                
                <ThresholdSlider 
                    threshold={threshold} 
                    setThreshold={setThreshold} 
                    isAuto={isAutoThreshold}
                    setIsAuto={setIsAutoThreshold}
                />

            </div>
        </div>
    );
};

export default RightPanel;
