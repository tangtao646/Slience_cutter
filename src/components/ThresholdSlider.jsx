import React from 'react';
import { useTranslation } from '../modules/i18n.jsx';

const ThresholdSlider = ({ threshold, setThreshold, isAuto, setIsAuto }) => {
    const { t } = useTranslation();
    const min = -60;
    const max = -10;
    
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
                <span>{t('sidebar.threshold_label')}</span>
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
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setIsAuto(checked);
                                if (checked) {
                                    setThreshold(-36.0); // 行业标准：-36dB (常用于人声/背景音分离)
                                }
                            }}
                            style={{ width: '12px', height: '12px' }}
                        />
                        {t('sidebar.threshold_auto')}
                    </label>
                    <div className="threshold-value" style={{ fontSize: '11px', color: isAuto ? '#777' : '#eee', width: '60px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {threshold > -100 ? `${threshold.toFixed(1)} dB` : '-∞'}
                    </div>
                </div>
            </div>
            <div className="threshold-slider-container">
                <input 
                    type="range" 
                    min={min} 
                    max={max} 
                    step="0.5" 
                    value={threshold} 
                    onChange={handleChange}
                    disabled={isAuto}
                    style={{ 
                        opacity: isAuto ? 0.3 : 1,
                        cursor: isAuto ? 'not-allowed' : 'pointer'
                    }}
                />
            </div>
        </div>
    );
};

export default ThresholdSlider;
