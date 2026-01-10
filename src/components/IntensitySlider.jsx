import React, { useState, useEffect } from 'react';

const IntensitySlider = ({ intensity, setIntensity, committedIntensity, onAnalyze }) => {
    // 强度区间标记
    const marks = [
        { value: 0, label: 'None' },
        { value: 0.25, label: 'Natural' },
        { value: 0.5, label: 'Fast' },
        { value: 1.0, label: 'Super' }
    ];

    const handlePresetClick = (val) => {
        if (val < committedIntensity) return;
        setIntensity(val);
        if (onAnalyze) {
            onAnalyze({ intensity: val });
        }
    };

    // 计算当前是否处于某个预设档位
    const isActive = (val) => intensity === val;

    return (
        <div className="control-group">
            <div className="control-label" style={{ marginBottom: '8px' }}>
                <span>Cutting Strategy</span>
                <span style={{ fontSize: '10px', color: '#666' }}>
                    {intensity === 0 ? 'Off' : `${(intensity * 100).toFixed(0)}%`}
                </span>
            </div>

            {/* 简洁的档位选择器 */}
            <div style={{ 
                display: 'flex', 
                background: '#1a1a1a', 
                padding: '3px', 
                borderRadius: '8px',
                border: '1px solid #333'
            }}>
                {marks.map(mark => {
                    const isLocked = mark.value < committedIntensity;
                    const active = isActive(mark.value);
                    return (
                        <button
                            key={mark.value}
                            onClick={() => handlePresetClick(mark.value)}
                            disabled={isLocked}
                            style={{
                                flex: 1,
                                padding: '8px 2px',
                                border: 'none',
                                borderRadius: '6px',
                                background: active ? '#345cf0' : 'transparent',
                                color: isLocked ? '#444' : (active ? '#fff' : '#888'),
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                fontSize: '11px',
                                fontWeight: active ? 'bold' : 'normal',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '2px'
                            }}
                        >
                            {mark.label}
                            {isLocked && <span style={{ fontSize: '8px', opacity: 0.5 }}>🔒</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default IntensitySlider;
