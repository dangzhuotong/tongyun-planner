/** @vitest-environment jsdom */
import { act, useState, type ReactNode } from "react";
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

  it("隐藏直链画面时不卸载、不暂停、不清地址，并能恢复", async () => {
    seed(videoLink);
    await render(<CustomNoiseWindow onClose={() => {}} stopSignal={0} volume={0.4} />);
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.getAttribute("src")).toContain("rain.mp4");

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="custom-noise-picture-toggle"]')!
        .click();
    });

    const hidden = document.querySelector("video");
    expect(hidden).toBe(video);
    expect(hidden!.isConnected).toBe(true);
    expect(hidden!.getAttribute("data-picture-hidden")).toBe("true");
    expect(hidden!.getAttribute("src")).toContain("rain.mp4");
    expect(pauseCalls).toBe(0);
    expect(localStorage.getItem(CUSTOM_NOISE_PICTURE_HIDDEN_KEY)).toBe("true");

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="custom-noise-picture-toggle"]')!
        .click();
    });
    expect(document.querySelector("video")!.getAttribute("data-picture-hidden")).toBe("false");
    expect(document.querySelector("video")!.isConnected).toBe(true);
    expect(pauseCalls).toBe(0);
  });

  it("直链音量写到媒体元素，并显示滑块百分比", async () => {
    seed(videoLink);
    await render(<CustomNoiseWindow onClose={() => {}} stopSignal={0} volume={0.2} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.volume).toBeCloseTo(0.2);
    expect(document.querySelector('[data-testid="custom-noise-volume"]')?.textContent).toContain(
      "20%",
    );
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
    expect(
      document.querySelector('[data-testid="custom-noise-picture-desktop"]')?.textContent,
    ).toContain("桌面版");
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
