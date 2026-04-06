import React from 'react';
import { render, renderHook, act } from '@testing-library/react';
import {
  CompanionProvider,
  CompanionActions,
  useCompanion,
  useCompanionEvent,
} from './CompanionContext';

// Wrap in provider for hooks
function wrapper({ children }) {
  return <CompanionProvider>{children}</CompanionProvider>;
}

describe('CompanionProvider', () => {
  it('renders children without crashing', () => {
    const { getByText } = render(
      <CompanionProvider>
        <div>Hello companion</div>
      </CompanionProvider>
    );
    expect(getByText('Hello companion')).toBeInTheDocument();
  });
});

describe('useCompanion', () => {
  it('returns dispatch and subscribe functions', () => {
    const { result } = renderHook(() => useCompanion(), { wrapper });
    expect(typeof result.current.dispatch).toBe('function');
    expect(typeof result.current.subscribe).toBe('function');
  });

  it('dispatch + subscribe: subscriber receives dispatched events', () => {
    const { result } = renderHook(() => useCompanion(), { wrapper });

    const received = [];
    let unsubscribe;

    act(() => {
      unsubscribe = result.current.subscribe((action, payload) => {
        received.push({ action, payload });
      });
    });

    act(() => {
      result.current.dispatch(CompanionActions.GENERATION_START, { type: 'image' });
    });

    expect(received).toHaveLength(1);
    expect(received[0].action).toBe(CompanionActions.GENERATION_START);
    expect(received[0].payload).toEqual({ type: 'image' });

    act(() => {
      unsubscribe();
    });

    act(() => {
      result.current.dispatch(CompanionActions.GENERATION_DONE, { type: 'image', success: true });
    });

    // Should not receive events after unsubscribe
    expect(received).toHaveLength(1);
  });

  it('multiple subscribers all receive the same dispatch', () => {
    const { result } = renderHook(() => useCompanion(), { wrapper });

    const received1 = [];
    const received2 = [];
    let unsub1, unsub2;

    act(() => {
      unsub1 = result.current.subscribe((action, payload) => {
        received1.push({ action, payload });
      });
      unsub2 = result.current.subscribe((action, payload) => {
        received2.push({ action, payload });
      });
    });

    act(() => {
      result.current.dispatch(CompanionActions.STORY_TURN, { sessionTitle: 'Test' });
    });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0].action).toBe(CompanionActions.STORY_TURN);
    expect(received2[0].action).toBe(CompanionActions.STORY_TURN);

    act(() => { unsub1(); unsub2(); });
  });
});

describe('useCompanion idle timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Clear session storage so FIRST_VISIT doesn't fire an extra timeout
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    sessionStorage.clear();
  });

  it('fires USER_IDLE event after 60 seconds of inactivity', () => {
    const { result } = renderHook(() => useCompanion(), { wrapper });

    const received = [];
    act(() => {
      result.current.subscribe((action) => {
        received.push(action);
      });
    });

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(received).toContain(CompanionActions.USER_IDLE);
  });

  it('fires USER_RETURN event when activity resumes after being idle', () => {
    const { result } = renderHook(() => useCompanion(), { wrapper });

    const received = [];
    act(() => {
      result.current.subscribe((action) => {
        received.push(action);
      });
    });

    // Go idle
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(received).toContain(CompanionActions.USER_IDLE);

    // Simulate activity — triggers USER_RETURN
    act(() => {
      document.dispatchEvent(new Event('mousemove'));
    });

    expect(received).toContain(CompanionActions.USER_RETURN);
  });
});

describe('useCompanionEvent', () => {
  it('calls callback when a matching event is dispatched', () => {
    const callback = jest.fn();
    let capturedDispatch;

    function TestHooks() {
      const { dispatch } = useCompanion();
      capturedDispatch = dispatch;
      useCompanionEvent(callback);
      return null;
    }

    render(
      <CompanionProvider>
        <TestHooks />
      </CompanionProvider>
    );

    act(() => {
      capturedDispatch(CompanionActions.PAGE_NAVIGATE, { page: '/whisk' });
    });

    expect(callback).toHaveBeenCalledWith(
      CompanionActions.PAGE_NAVIGATE,
      { page: '/whisk' }
    );
  });

  it('stable callback ref — re-renders do not break subscription', () => {
    const capturedCallback = jest.fn();
    let capturedDispatch;

    function TestHooks() {
      const { dispatch } = useCompanion();
      capturedDispatch = dispatch;
      useCompanionEvent(capturedCallback);
      return null;
    }

    const { rerender } = render(
      <CompanionProvider>
        <TestHooks />
      </CompanionProvider>
    );

    rerender(
      <CompanionProvider>
        <TestHooks />
      </CompanionProvider>
    );

    act(() => {
      capturedDispatch(CompanionActions.GENERATION_ERROR, { type: 'image', error: 'fail' });
    });

    expect(capturedCallback).toHaveBeenCalledWith(
      CompanionActions.GENERATION_ERROR,
      { type: 'image', error: 'fail' }
    );
  });
});
