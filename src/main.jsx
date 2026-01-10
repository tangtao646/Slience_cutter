import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './main.css'

// 禁用系统右键菜单和部分功能键以优化原生体验
document.addEventListener('contextmenu', (e) => e.preventDefault(), false);
document.addEventListener('keydown', (e) => {
  // 禁止刷新 (Cmd+R / F5) 和 开发者工具 (Cmd+Option+I / F12)
  if (
    (e.metaKey && e.key === 'r') || 
    (e.ctrlKey && e.key === 'r') || 
    e.key === 'F5' ||
    (e.metaKey && e.altKey && e.key === 'i') ||
    e.key === 'F12'
  ) {
    if (window.location.hostname !== 'localhost') {
        e.preventDefault();
    }
  }
}, false);

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
