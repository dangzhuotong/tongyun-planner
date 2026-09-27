import { describe, it, expect } from "vitest";
import { buildAiToolDoc } from "../aiToolDoc";

describe("buildAiToolDoc", () => {
  it("does not leak secret credentials even when passed in options context", () => {
    const webdavPass = "SuperSecretWebdavPass-123";
    const aiApiKey = "sk-test-aikey-XYZ";
    const providerApiKeys = { openai: "sk-openai-ABC" };
    const smtpPass = "smtp-pass-QWE";

    const doc = buildAiToolDoc({
      webdavUrl: "https://dav.jianguoyun.com/dav/",
      webdavUser: "me@example.com",
      ...({ webdavPass, password: webdavPass, aiApiKey, providerApiKeys, smtpPass } as any),
    });

    expect(doc).not.toContain(webdavPass);
    expect(doc).not.toContain(aiApiKey);
    expect(doc).not.toContain("sk-openai-ABC");
    expect(doc).not.toContain(smtpPass);
  });

  it("contains shell environment variable placeholder, remote directory, username, and manifest.json", () => {
    const webdavUrl = "https://dav.jianguoyun.com/dav/";
    const webdavUser = "me@example.com";

    const doc = buildAiToolDoc({ webdavUrl, webdavUser });

    expect(doc).toContain("$TONGYUN_WEBDAV_PASS");
    expect(doc).toContain("https://dav.jianguoyun.com/dav/TongYunPlanner/");
    expect(doc).toContain("me@example.com");
    expect(doc).toContain("manifest.json");
  });
});
