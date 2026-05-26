import React from "react";
import { render, act } from "@testing-library/react";
import useSpeech, { stripForSpeech } from "./useSpeech";

// Tiny harness component — same pattern as useVoiceInput.test.js.
const Harness = ({ onChange }) => {
  const result = useSpeech();
  React.useEffect(() => {
    onChange(result);
  });
  return null;
};

// Mock SpeechSynthesisUtterance + window.speechSynthesis.
const buildMockSpeech = () => {
  const utterances = [];
  let cancelCount = 0;
  let voicesChangedHandler = null;

  function FakeUtterance(text) {
    this.text = text;
    this.lang = "";
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
    this.onend = null;
    this.onerror = null;
    utterances.push(this);
  }

  const synth = {
    speak: jest.fn(),
    cancel: jest.fn(() => {
      cancelCount += 1;
    }),
    getVoices: () => [
      { name: "Samantha", lang: "en-US" },
      { name: "Victoria", lang: "en-US" },
      { name: "Kyoko", lang: "ja-JP" },
    ],
    addEventListener: (event, handler) => {
      if (event === "voiceschanged") voicesChangedHandler = handler;
    },
    removeEventListener: (event) => {
      if (event === "voiceschanged") voicesChangedHandler = null;
    },
  };

  return {
    FakeUtterance,
    synth,
    utterances,
    getCancelCount: () => cancelCount,
    fireVoicesChanged: () => voicesChangedHandler?.(),
  };
};

describe("stripForSpeech", () => {
  it("removes [EMOTION: …] tags", () => {
    expect(stripForSpeech("Hello [EMOTION: happy]")).toBe("Hello");
    expect(stripForSpeech("[EMOTION: thinking] thinking…")).toBe("thinking…");
  });

  it("collapses whitespace", () => {
    expect(stripForSpeech("  multiple\n\nspaces   here  ")).toBe("multiple spaces here");
  });

  it("returns empty string for empty/missing input", () => {
    expect(stripForSpeech("")).toBe("");
    expect(stripForSpeech(null)).toBe("");
    expect(stripForSpeech(undefined)).toBe("");
  });
});

describe("useSpeech", () => {
  const originalSynth = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;

  afterEach(() => {
    window.speechSynthesis = originalSynth;
    window.SpeechSynthesisUtterance = originalUtterance;
    try {
      window.localStorage.removeItem("skr-tts-enabled");
    } catch {
      // ignore
    }
  });

  it("reports supported=false when speechSynthesis is missing", () => {
    delete window.speechSynthesis;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);
    expect(captured.supported).toBe(false);
    expect(captured.speaking).toBe(false);
  });

  it("reports supported=true when speechSynthesis is available", () => {
    const { synth, FakeUtterance } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);
    expect(captured.supported).toBe(true);
  });

  it("speak() constructs an utterance and forwards to synth.speak", () => {
    const { synth, FakeUtterance, utterances } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.speak("Hello there"));

    expect(utterances.length).toBe(1);
    expect(utterances[0].text).toBe("Hello there");
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(captured.speaking).toBe(true);
  });

  it("speak() strips [EMOTION:…] tags before vocalising", () => {
    const { synth, FakeUtterance, utterances } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.speak("Picking 3:4 for you — ikuyo! [EMOTION: happy]"));

    expect(utterances[0].text).toBe("Picking 3:4 for you — ikuyo!");
  });

  it("speak() skips when text is empty after stripping", () => {
    const { synth, FakeUtterance } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.speak("[EMOTION: thinking]"));

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("speak() cancels any in-flight utterance before starting a new one", () => {
    const { synth, FakeUtterance, getCancelCount } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.speak("first"));
    act(() => captured.speak("second"));

    expect(getCancelCount()).toBeGreaterThanOrEqual(2);
  });

  it("stop() cancels and flips speaking=false", () => {
    const { synth, FakeUtterance } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.speak("hello"));
    expect(captured.speaking).toBe(true);

    act(() => captured.stop());
    expect(captured.speaking).toBe(false);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("setEnabled persists to localStorage", () => {
    const { synth, FakeUtterance } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.setEnabled(true));
    expect(window.localStorage.getItem("skr-tts-enabled")).toBe("1");

    act(() => captured.setEnabled(false));
    expect(window.localStorage.getItem("skr-tts-enabled")).toBe("0");
  });

  it("setEnabled(false) stops any current speech immediately", () => {
    const { synth, FakeUtterance } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);

    act(() => captured.setEnabled(true));
    act(() => captured.speak("a long line"));
    expect(captured.speaking).toBe(true);

    act(() => captured.setEnabled(false));
    expect(synth.cancel).toHaveBeenCalled();
    expect(captured.speaking).toBe(false);
  });

  it("enabled defaults to true when localStorage was previously set", () => {
    window.localStorage.setItem("skr-tts-enabled", "1");
    const { synth, FakeUtterance } = buildMockSpeech();
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = FakeUtterance;
    let captured = null;
    render(<Harness onChange={(v) => (captured = v)} />);
    // After the mount-effect hydration tick:
    expect(captured.enabled).toBe(true);
  });
});
