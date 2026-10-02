import { describe, it, expect } from "vitest";
import { buildAiToolDoc, buildAiToolDocFromSettings } from "../aiToolDoc";

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

  it("strips userinfo, secret query params, and a missing trailing slash", () => {
    const doc = buildAiToolDoc({
      webdavUrl: "https://alice:p7xQ@dav.example.com/remote.php/dav?password=short&keep=1#p7xQ",
      webdavUser: "alice@example.com",
    });

    expect(doc).not.toContain("p7xQ");
    expect(doc).not.toContain("alice:p7xQ");
    expect(doc).not.toContain("password=short");
    expect(doc).toContain("https://dav.example.com/remote.php/dav/TongYunPlanner/");
    expect(doc).toContain("alice@example.com");
    expect(doc).not.toContain("davTongYunPlanner");
  });

  it("scrubs secrets embedded in the url or username without erasing the template", () => {
    const webdavPass = "SuperSecretWebdavPass-123";
    const aiApiKey = "sk-test-aikey-XYZ";
    const providerKey = "sk-openai-ABC";
    const smtpPass = "smtp-pass-QWE";

    const doc = buildAiToolDocFromSettings({
      webdavUrl: `https://user:${webdavPass}@dav.example.com/dav/${providerKey}?token=${smtpPass}`,
      webdavUser: `me@example.com ${aiApiKey}`,
      webdavPass,
      aiApiKey,
      providerApiKeys: { openai: providerKey },
      smtpPass,
    });

    expect(doc).not.toContain(webdavPass);
    expect(doc).not.toContain(aiApiKey);
    expect(doc).not.toContain(providerKey);
    expect(doc).not.toContain(smtpPass);
    expect(doc).toContain("https://dav.example.com/dav/TongYunPlanner/");
    expect(doc).toContain("me@example.com");
    expect(doc).toContain("manifest.json");
    expect(doc).toContain("$TONGYUN_WEBDAV_PASS");
  });

  it("adds a trailing slash so the remote directory matches the client", () => {
    const doc = buildAiToolDoc({
      webdavUrl: "https://dav.jianguoyun.com/dav",
      webdavUser: "me@example.com",
    });

    expect(doc).toContain("https://dav.jianguoyun.com/dav/TongYunPlanner/");
    expect(doc).not.toContain("davTongYunPlanner");
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
