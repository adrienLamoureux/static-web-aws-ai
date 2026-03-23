import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
const MusicContext = createContext({});
export function MusicProvider({ children }) {
  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const autoPlayRequestRef = useRef({ requestId: 0, trackKey: null });
  const [autoPlayRequest, setAutoPlayRequest] = useState({ requestId: 0, trackKey: null });

  const pushTracks = useCallback((newTracks) => {
    setTracks(prev => {
      const existing = new Set(prev.map(t => t.key || t.url));
      const toAdd = newTracks.filter(t => !existing.has(t.key || t.url));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
  }, []);

  const playTrack = useCallback((track) => {
    setCurrentTrack(track);
    const req = { requestId: Date.now(), trackKey: track.key || track.url };
    autoPlayRequestRef.current = req;
    setAutoPlayRequest(req);
  }, []);

  return (
    <MusicContext.Provider value={{ tracks, currentTrack, autoPlayRequest, pushTracks, playTrack }}>
      {children}
    </MusicContext.Provider>
  );
}
export const useMusic = () => useContext(MusicContext);
