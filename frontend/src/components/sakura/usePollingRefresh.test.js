import { renderHook } from '@testing-library/react';
import usePollingRefresh from './usePollingRefresh';

describe('usePollingRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires the callback after intervalMs', () => {
    const fn = jest.fn();
    renderHook(() => usePollingRefresh(fn, { intervalMs: 5000, pauseWhenHidden: false }));

    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('fires on each interval tick', () => {
    const fn = jest.fn();
    renderHook(() => usePollingRefresh(fn, { intervalMs: 1000, pauseWhenHidden: false }));

    jest.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not fire when visibilityState is hidden and pauseWhenHidden is true', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true, writable: true });
    const fn = jest.fn();
    renderHook(() => usePollingRefresh(fn, { intervalMs: 1000, pauseWhenHidden: true }));

    jest.advanceTimersByTime(3000);
    expect(fn).not.toHaveBeenCalled();

    // Reset
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true, writable: true });
  });

  it('fires when visible even with pauseWhenHidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true, writable: true });
    const fn = jest.fn();
    renderHook(() => usePollingRefresh(fn, { intervalMs: 1000, pauseWhenHidden: true }));

    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    const fn = jest.fn();
    const { unmount } = renderHook(() => usePollingRefresh(fn, { intervalMs: 1000, pauseWhenHidden: false }));
    unmount();

    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
