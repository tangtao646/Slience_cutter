import React from 'react';

const ThresholdSlider = ({ threshold, setThreshold, isAuto, setIsAuto }) => {
    const min = 0.0001;
    const max = 0.1;
    
    const handleChange = (e) => {
        const val = parseFloat(e.target.value);
        setThreshold(val);
        // 如果用户手动滑动了，自动关闭 Auto 模式
        if (isAuto && setIsAuto) {
            setIsAuto(false);
        }
    };

    return (
        <div className="control-group">
            <div className="control-label">
                <span>Threshold (Noise Filter)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ 
                        fontSize: '10px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        cursor: 'pointer',
                        color: isAuto ? '#345cf0' : '#666',
                        fontWeight: isAuto ? 'bold' : 'normal'
                    }}>
                        <input 
                            type="checkbox" 
                            checked={isAuto} 
                            onChange={(e) => setIsAuto(e.target.checked)}
                            style={{ width: '12px', height: '12px' }}
                        />
                        AUTO
                    </label>
                    <div className="threshold-value" style={{ fontSize: '11px', color: isAuto ? '#777' : '#eee' }}>
                        {threshold.toFixed(4)}
                    </div>
                </div>
            </div>
            <div className="threshold-slider-container">
                <input 
                    type="range" 
                    min={min} 
                    max={max} 
                    step="0.0001" 
                    value={threshold} 
                    onChange={handleChange}
                    style={{ opacity: isAuto ? 0.5 : 1 }}
                />
            </div>
        </div>
    );
};

export default ThresholdSlider;
