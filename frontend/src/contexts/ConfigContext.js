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
        // Fall back to REACT_APP_* env vars for local development (set by idea:ui-local)
        setApiBaseUrl(
          d?.apiBaseUrl ||
          process.env.REACT_APP_API_URL ||
          ''
        );
        setCognito({
          domain:      d?.cognito?.domain      || process.env.REACT_APP_COGNITO_DOMAIN      || '',
          clientId:    d?.cognito?.clientId    || process.env.REACT_APP_COGNITO_CLIENT_ID   || '',
          userPoolId:  d?.cognito?.userPoolId  || process.env.REACT_APP_COGNITO_USER_POOL_ID || '',
          region:      d?.cognito?.region      || process.env.REACT_APP_COGNITO_REGION      || '',
        });
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
