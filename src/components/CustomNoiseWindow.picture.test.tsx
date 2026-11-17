/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from "react";

// React 19 在 act() 时检查这个全局标记。未设置会在 CI 打出
// “testing environment is not configured to support act(...)”。
// 这只让 act 更新被正确包住，不给 jsdom 增加媒体引擎。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "../i18n/LanguageContext";
import {
  CUSTOM_NOISE_ACTIVE_ID_KEY,
  CUSTOM_NOISE_LINKS_KEY,
  type CustomNoiseLink,
} from "../utils/customNoise";
import { CUSTOM_NOISE_PICTURE_HIDDEN_KEY } from "../utils/noisePicture";
import { nextExternalPlaySignal } from "../utils/noisePolicy";
import { CustomNoiseWindow } from "./CustomNoiseWindow";

const videoLink: CustomNoiseLink = {
  id: "video-1",
  url: "https://cdn.example/rain.mp4",
  kind: "media",
  embedUrl: "https://cdn.example/rain.mp4",
  title: "rain.mp4",
};

const audioLink: CustomNoiseLink = {
  id: "audio-1",
  url: "https://cdn.example/rain.mp3",
  kind: "media",
  embedUrl: "https://cdn.example/rain.mp3",
  title: "rain.mp3",
};

const youtubeLink: CustomNoiseLink = {
  id: "yt-1",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  kind: "youtube",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1",
  title: "YouTube · dQw4w9WgXcQ",
};

function seed(link: CustomNoiseLink) {
  localStorage.setItem(CUSTOM_NOISE_LINKS_KEY, JSON.stringify([link]));
  localStorage.setItem(CUSTOM_NOISE_ACTIVE_ID_KEY, link.id);
}

describe("CustomNoiseWindow picture and playback", () => {
  let container: HTMLDivElement;
  let root: Root;
  let pauseCalls = 0;
  let originalPause: typeof HTMLMediaElement.prototype.pause;

  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    pauseCalls = 0;
    originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function pause() {
      pauseCalls += 1;
      return originalPause.call(this);
    };
  });

  afterEach(() => {
    HTMLMediaElement.prototype.pause = originalPause;
    act(() => {
      root.unmount();
    });
  });

  async function render(node: ReactNode) {
    await act(async () => {
      root.render(<LanguageProvider>{node}</LanguageProvider>);
    });
  }

  it("隐藏直链画面后仍是同一元素，音量属性还在，恢复后也没调用 pause", async () => {
    // jsdom 不解码、不推进 currentTime，也不出声。这里只断言 DOM 状态和 volume 属性。
    seed(videoLink);
    await render(<CustomNoiseWindow onClose={() => {}} stopSignal={0} volume={0.4} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toContain("rain.mp4");
    expect(video.volume).toBeCloseTo(0.4);
    expect(video.getAttribute("data-picture-hidden")).toBe("false");

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="custom-noise-picture-toggle"]')!
        .click();
    });

    const hidden = document.querySelector("video") as HTMLVideoElement;
    expect(hidden).toBe(video);
    expect(hidden.isConnected).toBe(true);
    expect(hidden.getAttribute("data-picture-hidden")).toBe("true");
    expect(hidden.className).toContain("h-0");
    expect(hidden.getAttribute("src")).toContain("rain.mp4");
    expect(hidden.volume).toBeCloseTo(0.4);
    expect(pauseCalls).toBe(0);
    expect(localStorage.getItem(CUSTOM_NOISE_PICTURE_HIDDEN_KEY)).toBe("true");

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="custom-noise-picture-toggle"]')!
        .click();
    });
    const restored = document.querySelector("video") as HTMLVideoElement;
    expect(restored).toBe(video);
    expect(restored.getAttribute("data-picture-hidden")).toBe("false");
    expect(restored.className).not.toContain("h-0");
    expect(restored.volume).toBeCloseTo(0.4);
    expect(pauseCalls).toBe(0);
  });

  it("画面收起后改滑块，仍写到同一个媒体元素的 volume 属性", async () => {
    // 同样只检查 HTMLMediaElement.volume。jsdom 不会因此发出声音或改变 currentTime。
    seed(videoLink);

    function Harness() {
      const [volume, setVolume] = useState(0.2);
      return (
        <>
          <button type="button" data-testid="set-volume" onClick={() => setVolume(0.15)}>
            set
          </button>
          <CustomNoiseWindow onClose={() => {}} stopSignal={0} volume={volume} />
        </>
      );
    }

    await render(<Harness />);
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.volume).toBeCloseTo(0.2);

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="custom-noise-picture-toggle"]')!
        .click();
    });
    expect(document.querySelector("video")).toBe(video);
    expect(video.getAttribute("data-picture-hidden")).toBe("true");
    expect(video.volume).toBeCloseTo(0.2);

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="set-volume"]')!.click();
    });
    expect(document.querySelector("video")).toBe(video);
    expect(video.getAttribute("data-picture-hidden")).toBe("true");
    expect(video.className).toContain("h-0");
    expect(video.volume).toBeCloseTo(0.15);
    expect(document.querySelector('[data-testid="custom-noise-volume"]')?.textContent).toContain(
      "15%",
    );
    expect(pauseCalls).toBe(0);
  });

  it("音频直链没有隐藏画面按钮，跨站预览不假装已经藏起画面", async () => {
    seed(audioLink);
    await render(<CustomNoiseWindow onClose={() => {}} stopSignal={0} volume={0.5} />);
    expect(document.querySelector("audio")).not.toBeNull();
    expect(document.querySelector('[data-testid="custom-noise-picture-toggle"]')).toBeNull();
    expect(document.querySelector('[data-testid="custom-noise-picture-audio"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    localStorage.clear();
    seed(youtubeLink);
    await render(<CustomNoiseWindow onClose={() => {}} stopSignal={0} volume={0.5} />);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector('[data-testid="custom-noise-volume"]')).toBeNull();
    expect(document.querySelector('[data-testid="custom-noise-picture-toggle"]')).toBeNull();
    expect(document.querySelector('[data-testid="custom-noise-picture-desktop"]')).toBeNull();
    expect(document.querySelector('[data-testid="custom-noise-embed"]')?.textContent).toContain(
      "独立窗口",
    );
  });

  it("悬浮窗回声不会把播放信号越加越高", async () => {
    seed(videoLink);
    let calls = 0;

    function Harness() {
      const [signal, setSignal] = useState(1);
      return (
        <CustomNoiseWindow
          onClose={() => {}}
          stopSignal={0}
          playSignal={signal}
          onStartExternal={() => {
            calls += 1;
            setSignal((current) =>
              nextExternalPlaySignal({
                signal: current,
                echo: false,
                alreadyPlayingExternal: false,
              }),
            );
          }}
        />
      );
    }

    await render(<Harness />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(5);
    expect(calls).toBe(1);
  });
});
