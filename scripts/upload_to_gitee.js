import fs from 'fs';
import path from 'path';

// Arguments: owner, repo, tag, releaseName, body, files...
const [owner, repo, tag, releaseName, body, ...files] = process.argv.slice(2);
const token = process.env.GITEE_TOKEN;

if (!token) {
  console.error("Error: GITEE_TOKEN env variable is required");
  process.exit(1);
}

if (!owner || !repo || !tag || !releaseName) {
  console.error("Error: Missing required arguments: owner, repo, tag, releaseName");
  process.exit(1);
}

async function run() {
  try {
    console.log(`Connecting to Gitee API to mirror release for: ${owner}/${repo} at tag ${tag}...`);

    // 1. Create Gitee Release
    const createRes = await fetch(`https://gitee.com/api/v5/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        tag_name: tag,
        target_commitish: process.env.GITEE_TARGET_COMMITISH || 'master',
        name: releaseName,
        body: body || 'Release generated automatically by CI.',
        prerelease: false
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      // If release already exists, we might need to handle it or skip creation
      if (errText.includes("already exists") || createRes.status === 409) {
        console.log("Release already exists on Gitee. Attempting to upload files directly if possible.");
        // Gitee doesn't easily support fetching a release by tag via a single public GET without listing,
        // so we advise creating tags sequentially.
      }
      throw new Error(`Failed to create release on Gitee: ${createRes.status} - ${errText}`);
    }

    const release = await createRes.json();
    const releaseId = release.id;
    console.log(`Gitee Release created successfully. Release ID: ${releaseId}`);

    // 2. Upload assets/files with retry
    for (const file of files) {
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        console.warn(`Warning: Local file not found, skipping: ${filePath}`);
        continue;
      }

      const fileName = path.basename(filePath);
      const fileSize = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
      console.log(`Uploading ${fileName} (${fileSize} MB) to Gitee...`);

      const fileBuffer = fs.readFileSync(filePath);
      const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });

      // Retry up to 2 times
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          console.log(`Retry ${attempt}/3 for ${fileName}...`);
          await new Promise(r => setTimeout(r, 2000));
        }
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 60000);

          const formData = new FormData();
          formData.append('file', fileBlob, fileName);

          const uploadRes = await fetch(
            `https://gitee.com/api/v5/repos/${owner}/${repo}/releases/${releaseId}/attach_files?access_token=${token}`,
            { method: 'POST', body: formData, signal: controller.signal }
          );
          clearTimeout(timeout);

          if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`HTTP ${uploadRes.status} - ${errText}`);
          }

          const uploadResult = await uploadRes.json();
          console.log(`Successfully uploaded ${fileName}. URL: ${uploadResult.download_url}`);
          lastErr = null;
          break; // success
        } catch (err) {
          lastErr = err;
          console.error(`Attempt ${attempt}/3 failed: ${err.message}`);
        }
      }

      if (lastErr) {
        console.error(`Failed to upload ${fileName} after 3 attempts: ${lastErr.message}`);
      }
    }

    console.log("All Gitee mirroring tasks finished!");
  } catch (error) {
    console.error("Gitee Release Sync Failed:", error.message);
    process.exit(1);
  }
}

run();
