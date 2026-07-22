import React, { useState, useEffect } from 'react';
import './App.css';
import ImageProcessor from './components/ImageProcessor';
import VideoProcessor from './video';
import CameraProcessor from './livecam';
import History from './history';
import { testConnection } from './utils/api';

const getTabFromHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'video' || hash === 'livecam' || hash === 'history') {
    return hash;
  }
  return 'image';
};

function App() {
  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [colorblindType, setColorblindType] = useState('protanopia');
  const [mode, setMode] = useState('simulate');
  const [serverStatus, setServerStatus] = useState(null);

  useEffect(() => {
    const checkServer = async () => {
      const result = await testConnection();
      setServerStatus(result.success);
    };
    checkServer();
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const changeTab = (tab) => {
    window.location.hash = tab === 'image' ? '/' : `/${tab}`;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Color Blindness Friendly Filter</h1>
        <p>Process images and videos for color blindness accessibility</p>
        <div style={{ 
          marginTop: '10px', 
          padding: '8px 16px', 
          borderRadius: '5px',
          backgroundColor: serverStatus ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
          color: serverStatus ? '#babf85' : '#f44336',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          {serverStatus === null ? '⏳ Checking backend connection...' : 
           serverStatus ? '✓ Backend server connected' : 
           '✗ Backend server disconnected - Please start Flask server on port 5000'}
        </div>
      </header>

      <div className="controls">
        <div className="control-group">
          <label>Color Blindness Type:</label>
          <select 
            value={colorblindType} 
            onChange={(e) => setColorblindType(e.target.value)}
          >
            <option value="protanopia">Protanopia (Red-blind)</option>
            <option value="deuteranopia">Deuteranopia (Green-blind)</option>
            <option value="tritanopia">Tritanopia (Blue-blind)</option>
          </select>
        </div>

        <div className="control-group">
          <label>Mode:</label>
          <select 
            value={mode} 
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="simulate">Simulation</option>
            <option value="enhance">Correction</option>
          </select>
        </div>
      </div>

      <div className="tabs">
        <button 
          className={activeTab === 'image' ? 'active' : ''}
          onClick={() => changeTab('image')}
        >
          Image
        </button>
        <button 
          className={activeTab === 'video' ? 'active' : ''}
          onClick={() => changeTab('video')}
        >
          Video
        </button>
        <button 
          className={activeTab === 'livecam' ? 'active' : ''}
          onClick={() => changeTab('livecam')}
        >
          Live Camera
        </button>
        <button 
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => changeTab('history')}
        >
          History
        </button>
      </div>

      <div className="content">
        {activeTab === 'image' && (
          <ImageProcessor colorblindType={colorblindType} mode={mode} />
        )}
        {activeTab === 'video' && (
          <VideoProcessor colorblindType={colorblindType} mode={mode} />
        )}
        {activeTab === 'livecam' && (
          <CameraProcessor colorblindType={colorblindType} mode={mode} />
        )}
        {activeTab === 'history' && <History />}
      </div> 
    </div>
  );
}
export default App;
