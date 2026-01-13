import React, { useState, useEffect } from 'react';
import { useTranslation } from '../modules/i18n.jsx';

const ExportProgressModal = ({ progress, message, onCancel }) => {
    const { t } = useTranslation();
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        let result = '';
        if (h > 0) result += `${h} ${t('units.hour')} `;
        if (m > 0 || h > 0) result += `${m} ${t('units.minute')} `;
        result += `${s} ${t('units.second')}`;
        return result.trim();
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                width: '420px',
                background: '#1c1c1e',
                borderRadius: '16px',
                padding: '32px',
                border: '1px solid #333',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                textAlign: 'center',
                color: '#fff'
            }}>
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '-0.5px' }}>{t('export.title')}</h3>
                    <p style={{ color: '#888', fontSize: '13px', marginTop: '8px', minHeight: '1.4em' }}>
                        {message || t('export.preparing')}
                    </p>
                </div>

                <div style={{
                    height: '10px',
                    background: '#2c2c2e',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    marginBottom: '16px'
                }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #345cf0, #6366f1)',
                        transition: 'width 0.4s cubic-bezier(0.1, 0.7, 0.1, 1)'
                    }} />
                </div>

                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '13px',
                    marginBottom: '30px',
                    fontVariantNumeric: 'tabular-nums'
                }}>
                    <span style={{ color: '#345cf0', fontWeight: '600' }}>{Math.round(progress)}%</span>
                    <span style={{ color: '#aaa' }}>
                        {t('export.elapsed')}: <span style={{ color: '#eee' }}>{formatTime(elapsedSeconds)}</span>
                    </span>
                </div>
                
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <button 
                        onClick={onCancel}
                        className="cancel-btn"
                        style={{
                            padding: '12px',
                            background: '#2c2c2e',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#ff453a',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                    >
                        {t('export.cancel')}
                    </button>

                    <p style={{ 
                        color: '#555', 
                        fontSize: '11px',
                        lineHeight: '1.5',
                        margin: 0
                    }}>
                        {t('export.warning_detail')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ExportProgressModal;

