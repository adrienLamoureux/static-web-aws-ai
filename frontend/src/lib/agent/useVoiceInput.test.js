import React from "react";
import { render, act } from "@testing-library/react";
import useVoiceInput from "./useVoiceInput";

// Capture the hook's return value via a tiny test harness component.
const Harness = ({ onChange }) => {
  const result = useVoiceInput({ onResult: () => {} });
  React.useEffect(() => {
    onChange(result);
    // returning nothing keeps React happy about the cleanup contract
  });
  return null;
};

// Mock SpeechRecognition constructor — captures the instance for assertions
// and lets the test fire result/error/end events.
const buildMockSpeechRecognition = () => {
  let instance = null;
  function FakeRecognition() {
    instance = this;
    this.continuous = false;
    this.interimResults = false;
    this.lang = "";
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.started = 0;
    this.stopped = 0;
    this.aborted = 0;
  }
  FakeRecognition.prototype.start = function () {
    this.started += 1;
  };
  FakeRecognition.prototype.stop = function () {
    this.stopped += 1;
    if (typeof this.onend === "function") this.onend();
  };
  FakeRecognition.prototype.abort = function () {
    this.aborted += 1;
  };
  return {
    FakeRecognition,
    getInstance: () => instance,
  };
};

describe("useVoiceInput", () => {
  const originalSR = window.SpeechRecognition;
  const originalWebkit = window.webkitSpeechRecognition;

  afterEach(() => {
    window.SpeechRecognition = originalSR;
    window.webkitSpeechRecognition = originalWebkit;
  });

  it("reports supported=false when no SpeechRecognition is available", () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);
    expect(captured.supported).toBe(false);
    expect(captured.listening).toBe(false);
  });

  it("supports the webkit-prefixed constructor", () => {
    delete window.SpeechRecognition;
    const { FakeRecognition } = buildMockSpeechRecognition();
    window.webkitSpeechRecognition = FakeRecognition;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);
    expect(captured.supported).toBe(true);
  });

  it("start() flips listening=true and constructs a SpeechRecognition lazily", () => {
    const { FakeRecognition, getInstance } = buildMockSpeechRecognition();
    window.SpeechRecognition = FakeRecognition;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);
    expect(getInstance()).toBeNull();

    act(() => captured.start());

    expect(getInstance()).not.toBeNull();
    expect(getInstance().started).toBe(1);
    expect(captured.listening).toBe(true);
  });

  it("stop() ends the session and flips listening=false", () => {
    const { FakeRecognition, getInstance } = buildMockSpeechRecognition();
    window.SpeechRecognition = FakeRecognition;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.start());
    expect(captured.listening).toBe(true);

    act(() => captured.stop());
    expect(getInstance().stopped).toBe(1);
    expect(captured.listening).toBe(false);
  });

  it("forwards onresult events as accumulated transcript", () => {
    const { FakeRecognition, getInstance } = buildMockSpeechRecognition();
    window.SpeechRecognition = FakeRecognition;
    const results = [];
    function HarnessWithCallback({ onCapture }) {
      const v = useVoiceInput({ onResult: (text) => results.push(text) });
      React.useEffect(() => {
        onCapture(v);
      });
      return null;
    }
    let captured = null;
    render(<HarnessWithCallback onCapture={(v) => (captured = v)} />);

    act(() => captured.start());

    const recognition = getInstance();
    act(() => {
      recognition.onresult({
        results: [[{ transcript: "kitten " }], [{ transcript: "in a forest" }]],
      });
    });
    expect(results[results.length - 1]).toBe("kitten in a forest");
  });
});
