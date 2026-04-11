import { renderHook, act } from '@testing-library/react';
import useStorySession from './useStorySession';

// Mock the story service module
jest.mock('../../services/story', () => ({
  createStorySession: jest.fn(),
  deleteStorySession: jest.fn(),
  getStorySession: jest.fn(),
  listStorySessions: jest.fn(),
  sendStoryMessage: jest.fn(),
}));

import {
  createStorySession,
  deleteStorySession,
  listStorySessions,
  getStorySession,
} from '../../services/story';

// Build stable refs/props for the hook (mirrors the real usage pattern)
function makeProps(overrides = {}) {
  const setErrorFn = jest.fn();
  const triggerIllustrationFn = jest.fn().mockResolvedValue(undefined);

  return {
    resolvedApiBaseUrl: 'https://api.example.com',
    selectedPresetId: 'preset-1',
    illustrationContextMode: 'scene',
    normalizeScene: (scene) => ({ ...scene, _normalized: true }),
    triggerIllustrationRef: { current: triggerIllustrationFn },
    clearAllSceneAnimationPollsRef: { current: jest.fn() },
    clearAllSceneMusicPollsRef: { current: jest.fn() },
    setSceneAnimationLoadingMapRef: { current: jest.fn() },
    setSceneMusicLoadingMapRef: { current: jest.fn() },
    setSceneLibrarySelectionMap: jest.fn(),
    setSceneManualSelectionMap: jest.fn(),
    setScenes: jest.fn(),
    setErrorRef: { current: setErrorFn },
    // Expose setErrorFn for assertions
    _setErrorFn: setErrorFn,
    ...overrides,
  };
}

describe('useStorySession — initial state', () => {
  it('starts with empty sessions list and no active session', () => {
    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    expect(result.current.sessions).toEqual([]);
    expect(result.current.activeSessionId).toBe('');
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
    expect(result.current.isLoadingSession).toBe(false);
    expect(result.current.activeSessionDetail).toBeNull();
  });

  it('exposes all expected handlers', () => {
    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    expect(typeof result.current.handleCreateSession).toBe('function');
    expect(typeof result.current.handleDeleteSession).toBe('function');
    expect(typeof result.current.handleSelectSession).toBe('function');
    expect(typeof result.current.handleSendMessage).toBe('function');
    expect(typeof result.current.refreshSessions).toBe('function');
    expect(typeof result.current.loadSession).toBe('function');
  });
});

describe('useStorySession — createSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls API and adds session to the list', async () => {
    const newSession = { id: 'session-1', title: 'My Story' };
    createStorySession.mockResolvedValueOnce({
      session: newSession,
      messages: [],
      scenes: [],
    });

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      await result.current.handleCreateSession();
    });

    expect(createStorySession).toHaveBeenCalledWith(
      'https://api.example.com',
      { presetId: 'preset-1' }
    );
    expect(result.current.sessions).toContainEqual(newSession);
    expect(result.current.activeSessionId).toBe('session-1');
  });

  it('sets status to creating during creation and restores to idle', async () => {
    let resolveCreate;
    createStorySession.mockReturnValueOnce(
      new Promise((resolve) => { resolveCreate = resolve; })
    );

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    act(() => {
      result.current.handleCreateSession();
    });

    expect(result.current.status).toBe('creating');

    await act(async () => {
      resolveCreate({
        session: { id: 'session-2', title: 'Another Story' },
        messages: [],
        scenes: [],
      });
    });

    expect(result.current.status).toBe('idle');
  });

  it('sets error when selectedPresetId is missing', async () => {
    const props = makeProps({ selectedPresetId: '' });
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      await result.current.handleCreateSession();
    });

    expect(createStorySession).not.toHaveBeenCalled();
    expect(props._setErrorFn).toHaveBeenCalledWith('Select a preset to begin.');
  });

  it('sets error when apiBaseUrl is missing', async () => {
    const props = makeProps({ resolvedApiBaseUrl: '' });
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      await result.current.handleCreateSession();
    });

    expect(createStorySession).not.toHaveBeenCalled();
    expect(props._setErrorFn).toHaveBeenCalledWith(
      'API base URL is missing. Set it in config.json or .env.'
    );
  });
});

describe('useStorySession — deleteSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    window.confirm.mockRestore?.();
    jest.restoreAllMocks();
  });

  it('removes session from list after successful delete', async () => {
    deleteStorySession.mockResolvedValueOnce({});

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    // Pre-populate sessions
    act(() => {
      result.current.setSessions([
        { id: 'session-1', title: 'Story One' },
        { id: 'session-2', title: 'Story Two' },
      ]);
    });

    await act(async () => {
      await result.current.handleDeleteSession({ id: 'session-1', title: 'Story One' });
    });

    expect(deleteStorySession).toHaveBeenCalledWith('https://api.example.com', 'session-1');
    expect(result.current.sessions).toEqual([{ id: 'session-2', title: 'Story Two' }]);
  });

  it('does not delete when user cancels confirm dialog', async () => {
    window.confirm.mockReturnValue(false);

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    act(() => {
      result.current.setSessions([{ id: 'session-1', title: 'Story One' }]);
    });

    await act(async () => {
      await result.current.handleDeleteSession({ id: 'session-1', title: 'Story One' });
    });

    expect(deleteStorySession).not.toHaveBeenCalled();
    expect(result.current.sessions).toHaveLength(1);
  });

  it('clears active session when the active session is deleted', async () => {
    deleteStorySession.mockResolvedValueOnce({});

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    act(() => {
      result.current.setSessions([{ id: 'session-1', title: 'Story One' }]);
      result.current.setActiveSessionId('session-1');
    });

    await act(async () => {
      await result.current.handleDeleteSession({ id: 'session-1', title: 'Story One' });
    });

    expect(result.current.activeSessionId).toBe('');
  });
});

describe('useStorySession — refreshSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches sessions and stores them', async () => {
    const sessions = [
      { id: 'session-1', title: 'Story One' },
      { id: 'session-2', title: 'Story Two' },
    ];
    listStorySessions.mockResolvedValueOnce({ sessions });

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      result.current.refreshSessions();
      // Wait for promise to resolve
      await Promise.resolve();
    });

    expect(listStorySessions).toHaveBeenCalledWith('https://api.example.com');
    expect(result.current.sessions).toEqual(sessions);
  });

  it('sets error when fetch fails', async () => {
    listStorySessions.mockRejectedValueOnce(new Error('Network failure'));

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      result.current.refreshSessions();
      await Promise.resolve();
      // Allow the rejection to propagate through the microtask queue
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(props._setErrorFn).toHaveBeenCalledWith('Network failure');
  });

  it('does nothing when apiBaseUrl is missing', async () => {
    const props = makeProps({ resolvedApiBaseUrl: '' });
    const { result } = renderHook(() => useStorySession(props));

    act(() => {
      result.current.refreshSessions();
    });

    expect(listStorySessions).not.toHaveBeenCalled();
  });
});

describe('useStorySession — loadSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads session data and updates state', async () => {
    const session = { id: 'session-1', title: 'Loaded Story' };
    const messages = [{ role: 'user', content: 'Hello', createdAt: '2025-01-01' }];
    const scenes = [{ sceneId: 'scene-1', musicLibraryTrackId: 'track-1' }];

    getStorySession.mockResolvedValueOnce({ session, messages, scenes });

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      await result.current.loadSession('session-1');
    });

    expect(getStorySession).toHaveBeenCalledWith('https://api.example.com', 'session-1');
    expect(result.current.activeSessionId).toBe('session-1');
    expect(result.current.messages).toEqual(messages);
    expect(result.current.activeSessionDetail).toEqual(session);
  });

  it('sets error on load failure', async () => {
    getStorySession.mockRejectedValueOnce(new Error('Session not found'));

    const props = makeProps();
    const { result } = renderHook(() => useStorySession(props));

    await act(async () => {
      await result.current.loadSession('session-999');
    });

    expect(props._setErrorFn).toHaveBeenCalledWith('Session not found');
  });
});
