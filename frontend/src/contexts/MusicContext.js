import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';
import { getAuthToken } from '../utils/authTokens';
import { listStoryMusicLibrary } from '../services/story';

const MusicContext = createContext({});

export function MusicProvider({ children }) {
  const { apiBaseUrl, configReady } = useConfig();
  const { isAuthenticated } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const autoPlayRequestRef = useRef({ requestId: 0, trackKey: null });
  const [autoPlayRequest, setAutoPlayRequest] = useState({ requestId: 0, trackKey: null });

  useEffect(() => {
    if (!configReady || !apiBaseUrl || !isAuthenticated || !getAuthToken()) return;
    listStoryMusicLibrary(apiBaseUrl).then(data => {
      const list = (data?.tracks || []).map(t => ({
        url: t.url || t.musicUrl,
        key: t.key || t.musicKey || t.url || t.musicUrl,
        title: t.title || t.musicTitle || 'Untitled',
        mood: t.mood || t.musicMood || '',
        energy: t.energy || t.musicEnergy || '',
        tempoBpm: t.tempoBpm || t.musicTempoBpm || null,
        tags: t.tags || t.musicTags || [],
      })).filter(t => t.url);
      if (list.length > 0) setTracks(list);
    }).catch(() => {});
  }, [configReady, apiBaseUrl, isAuthenticated]);

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

  const dismissTrack = useCallback(() => {
    setCurrentTrack(null);
    const req = { requestId: 0, trackKey: null };
    autoPlayRequestRef.current = req;
    setAutoPlayRequest(req);
  }, []);

  return (
    <MusicContext.Provider value={{ tracks, currentTrack, autoPlayRequest, pushTracks, playTrack, dismissTrack }}>
      {children}
    </MusicContext.Provider>
  );
}

export const useMusic = () => useContext(MusicContext);
