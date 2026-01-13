import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './translations';

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('app_lang') || 'zh';
  });

  useEffect(() => {
    localStorage.setItem('app_lang', language);
  }, [language]);

  const t = (path, params = {}) => {
    const keys = path.split('.');
    let value = translations[language];
    
    for (const key of keys) {
      if (!value[key]) return path;
      value = value[key];
    }

    if (typeof value === 'string') {
      let result = value;
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{{${k}}}`, v);
      });
      return result;
    }
    
    return path;
  };

  return (
    <I18nContext.Provider value={{ t, language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
}
