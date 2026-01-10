import React from 'react';

const PaddingSlider = ({ padding, setPadding }) => {
    // 留白时间：0s 到 1s
    const min = 0;
    const max = 1.0;
    
    const handleChange = (e) => {
        setPadding(parseFloat(e.target.value));
    };

    return (
        <div className="control-group" style={{ marginTop: '20px' }}>
            <div className="control-label">
                <span>Speech Padding (Humanized)</span>
                <div className="threshold-value">{padding.toFixed(2)}s</div>
            </div>
            <div className="threshold-slider-container">
                <input 
                    type="range" 
                    min={min} 
                    max={max} 
                    step="0.01" 
                    value={padding} 
                    onChange={handleChange}
                />
                <div style={{ fontSize: '10px', color: '#888', marginLeft: '8px' }}>
                    {padding > 0.2 ? 'Natural' : padding > 0.05 ? 'Tight' : 'Frame-accurate'}
                </div>
            </div>
            <div style={{ fontSize: '11px', color: '#777', marginTop: '4px', fontStyle: 'italic' }}>
                Leave breathing room for speech to avoid mid-word cuts.
            </div>
        </div>
    );
};

export default PaddingSlider;
