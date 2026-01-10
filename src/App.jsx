import React, { useState, useEffect, useRef } from 'react';
import { getAppState } from './modules/state-manager.js';
import { getTauriManager } from './modules/tauri-manager.js';
import { getFileHandler } from './modules/file-handler.js';
import { getUploader } from './modules/uploader.js';
import { getVideoPlayerManager } from './modules/video-player.js';

// Components (We will create these next)
import LoadingScreen from './components/LoadingScreen';
import MainInterface from './components/MainInterface';

const App = () => {
    const [view, setView] = useState('loading');
    const [isTauri, setIsTauri] = useState(false);
    const appData = useRef({
        state: getAppState(),
        tauri: getTauriManager(),
        fileHandler: getFileHandler(),
        uploader: getUploader(),
        videoPlayer: getVideoPlayerManager()
    });

    useEffect(() => {
        const init = async () => {
            try {
                // Initialize Tauri
                const result = await appData.current.tauri.init();
                const isTauriMode = result.connected;
                setIsTauri(isTauriMode);
                appData.current.state.isTauri = isTauriMode;
                
                console.log('Tauri mode:', isTauriMode);

                // Show main interface after a short delay
                setTimeout(() => {
                    setView('main');
                }, 300);
            } catch (error) {
                console.error('Initialisation error:', error);
                setView('error');
            }
        };

        init();
    }, []);

    if (view === 'loading') {
        return <LoadingScreen />;
    }

    if (view === 'error') {
        return <div>Error loading application. Please check logs.</div>;
    }

    return (
        <MainInterface 
            appData={appData.current}
            isTauri={isTauri}
        />
    );
};

export default App;
