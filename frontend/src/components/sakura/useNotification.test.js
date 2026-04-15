import { renderHook, act } from "@testing-library/react";
import useNotification from "./useNotification";

describe("useNotification", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts with empty notifications", () => {
    const { result } = renderHook(() => useNotification());
    const [notifications] = result.current;
    expect(notifications).toEqual([]);
  });

  it("push adds a notification", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      const [, push] = result.current;
      push("Test message", "success");
    });

    const [notifications] = result.current;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe("Test message");
    expect(notifications[0].type).toBe("success");
    expect(notifications[0].id).toBeDefined();
  });

  it("push defaults to success type", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      const [, push] = result.current;
      push("Hello");
    });

    const [notifications] = result.current;
    expect(notifications[0].type).toBe("success");
  });

  it("push supports error type", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      const [, push] = result.current;
      push("Oops", "error");
    });

    const [notifications] = result.current;
    expect(notifications[0].type).toBe("error");
  });

  it("notification is auto-removed after 4s", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      const [, push] = result.current;
      push("Temporary");
    });

    expect(result.current[0]).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(result.current[0]).toHaveLength(0);
  });

  it("can push multiple notifications", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      const [, push] = result.current;
      push("First");
      push("Second");
    });

    expect(result.current[0]).toHaveLength(2);
  });

  it("removes only the expired notification", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      const [, push] = result.current;
      push("First");
    });

    act(() => {
      jest.advanceTimersByTime(2000);
      const [, push] = result.current;
      push("Second");
    });

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    const [notifications] = result.current;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe("Second");
  });
});
