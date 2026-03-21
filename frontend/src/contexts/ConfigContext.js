import React, { createContext, useContext, useState, useEffect } from 'react';

const ConfigContext = createContext({ apiBaseUrl: '', cognito: {}, configReady: false });

export function ConfigProvider({ children }) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [cognito, setCognito] = useState({});
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/config.json')
      .then(r => r.ok ? r.json() : {})
      .then(d => {
        if (!isMounted) return;
        setApiBaseUrl(d?.apiBaseUrl || '');
        setCognito(d?.cognito || {});
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setConfigReady(true); });
    return () => { isMounted = false; };
  }, []);

  return (
    <ConfigContext.Provider value={{ apiBaseUrl, cognito, configReady }}>
      {children}
    </ConfigContext.Provider>
  );
}

export const useConfig = () => useContext(ConfigContext);
