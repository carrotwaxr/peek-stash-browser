#!/usr/bin/env node

/**
 * Screenshot Publishing Script
 *
 * Uploads screenshots to ImgBash and generates a gallery page.
 *
 * Usage:
 *   node screenshots/publish.js
 *   npm run screenshots:publish
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Load version from package.json
const packagePath = path.join(__dirname, '..', 'client', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
const version = packageJson.version;

// Screenshot directory
const screenshotDir = path.join(__dirname, 'output', version);

/**
 * Check if screenshots exist
 */
function checkScreenshotsExist() {
  if (!fs.existsSync(screenshotDir)) {
    console.error('❌ Screenshots not found!');
    console.error(`📁 Expected location: ${screenshotDir}`);
    console.error('\n💡 Run `npm run screenshots` first to capture screenshots.');
    process.exit(1);
  }

  const files = fs.readdirSync(screenshotDir).filter((f) => f.endsWith('.png'));
  if (files.length === 0) {
    console.error('❌ No screenshots found!');
    console.error(`📁 Directory: ${screenshotDir}`);
    process.exit(1);
  }

  return files;
}

/**
 * Upload batch of images to ImageChest for a specific viewport
 */
async function uploadImageBatch(fileBatch, viewport) {
  return new Promise((resolve, reject) => {
    const form = new FormData();

    // Add images to form (ImageChest accepts up to 20)
    fileBatch.forEach(({ filePath, fileName }) => {
      form.append('images[]', fs.createReadStream(filePath), fileName);
    });

    // Post settings - viewport-specific title
    const viewportTitle = viewport.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    form.append('title', `Peek Stash Browser v${version} - ${viewportTitle}`);
    form.append('nsfw', 'true');
    form.append('privacy', 'public');

    const options = {
      hostname: 'api.imgchest.com',
      port: 443,
      path: '/v1/post',
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${config.imagechest.apiToken}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          // ImageChest response structure: { data: { images: [...], id: '...', ... } }
          if (response.data && response.data.images) {
            // Extract URLs for each uploaded image and post metadata
            const imageUrls = response.data.images.map((img, index) => ({
              fileName: img.original_name || fileBatch[index].fileName,
              url: img.link
            }));

            // Include post metadata in response
            const result = {
              images: imageUrls,
              postId: response.data.id,
              postUrl: `https://imgchest.com/p/${response.data.id}`,
              imageCount: response.data.image_count
            };

            resolve(result);
          } else {
            reject(new Error(`Upload failed: ${data}`));
          }
        } catch (err) {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    form.pipe(req);
  });
}

/**
 * Upload all screenshots to ImageChest in batches
 */
async function uploadAllScreenshots(files) {
  console.log(`📤 Uploading ${files.length} screenshots to ImageChest...`);

  // Define viewport order for organizing posts
  const viewportOrder = ['mobile', 'tablet', 'tablet-landscape', 'desktop'];

  // Group files by viewport
  const filesByViewport = {};
  files.forEach(file => {
    const parsed = parseFileName(file);
    if (!parsed) return;

    if (!filesByViewport[parsed.viewport]) {
      filesByViewport[parsed.viewport] = [];
    }
    filesByViewport[parsed.viewport].push(file);
  });

  // Create batches: one per viewport, sorted by page name
  const batches = [];
  viewportOrder.forEach(viewport => {
    if (filesByViewport[viewport]) {
      // Sort files within viewport by page name
      const sortedViewportFiles = filesByViewport[viewport].sort((a, b) => {
        const aData = parseFileName(a);
        const bData = parseFileName(b);
        return aData.pageName.localeCompare(bData.pageName);
      });

      batches.push({
        viewport,
        files: sortedViewportFiles.map(file => ({
          filePath: path.join(screenshotDir, file),
          fileName: file
        }))
      });
    }
  });

  const uploadedImages = [];
  const posts = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const viewportName = batch.viewport.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(`\n📦 ${viewportName} (${batch.files.length} files)`);

    let retryCount = 0;
    const maxRetries = 2;
    let success = false;

    while (!success && retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`  🔄 Retry ${retryCount}/${maxRetries}...`);
        }

        batch.files.forEach(({ fileName }) => console.log(`  📤 Uploading: ${fileName}`));
        const result = await uploadImageBatch(batch.files, batch.viewport);

        // Track post information
        posts.push({
          viewport: viewportName,
          postId: result.postId,
          postUrl: result.postUrl,
          imageCount: result.imageCount
        });

        console.log(`  📁 Post created: ${result.postUrl} (${result.imageCount} images)`);

        result.images.forEach(({ fileName, url }) => {
          console.log(`  ✅ Uploaded: ${fileName}`);
          uploadedImages.push({ fileName, url });
          successCount++;
        });

        success = true;

        // Rate limit: 60 requests/min, so wait 1 second between batches to be safe
        if (i < batches.length - 1) {
          console.log(`  ⏳ Waiting 1s before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`  ❌ Batch ${i + 1} attempt ${retryCount + 1} failed:`, error.message);
        retryCount++;

        if (retryCount <= maxRetries) {
          // Wait before retrying (exponential backoff: 2s, 4s)
          const waitTime = 2000 * retryCount;
          console.log(`  ⏳ Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          failCount += batch.length;
        }
      }
    }
  }

  console.log(`\n📊 Upload summary: ${successCount} succeeded, ${failCount} failed`);

  if (uploadedImages.length === 0) {
    console.error('❌ No images uploaded successfully!');
    process.exit(1);
  }

  return { images: uploadedImages, posts };
}

/**
 * Parse screenshot filename
 */
function parseFileName(fileName) {
  // Format: pageName_viewport_theme.png
  // Note: viewport can contain hyphens (e.g., tablet-landscape)
  const match = fileName.match(/^(.+)_([\w-]+)_(\w+)\.png$/);
  if (match) {
    return {
      pageName: match[1],
      viewport: match[2],
      theme: match[3],
    };
  }
  return null;
}

/**
 * Organize images by page, viewport, theme
 */
function organizeImages(uploadedImages) {
  const organized = {};

  for (const img of uploadedImages) {
    const parsed = parseFileName(img.fileName);
    if (!parsed) continue;

    const { pageName, viewport, theme } = parsed;

    if (!organized[pageName]) {
      organized[pageName] = {};
    }
    if (!organized[pageName][viewport]) {
      organized[pageName][viewport] = {};
    }

    organized[pageName][viewport][theme] = img.url;
  }

  return organized;
}

/**
 * Get page description from config
 */
function getPageDescription(pageName) {
  const page = config.pages.find((p) => p.name === pageName);
  return page ? page.description : pageName;
}

/**
 * Generate gallery HTML
 */
function generateGalleryHTML(uploadedImages) {
  const organized = organizeImages(uploadedImages);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Peek Stash Browser v${version} - Screenshots</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: 2rem;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 2px solid #333;
    }
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p {
      font-size: 1.2rem;
      color: #999;
    }
    .page-section {
      margin-bottom: 4rem;
    }
    .page-title {
      font-size: 1.8rem;
      margin-bottom: 1rem;
      color: #fff;
    }
    .page-description {
      font-size: 1rem;
      color: #999;
      margin-bottom: 2rem;
    }
    .viewport-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .viewport-card {
      background: #1a1a1a;
      border-radius: 8px;
      padding: 1.5rem;
      border: 1px solid #333;
    }
    .viewport-name {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #667eea;
    }
    .theme-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid #333;
    }
    .theme-tab {
      padding: 0.5rem 1rem;
      cursor: pointer;
      background: transparent;
      border: none;
      color: #999;
      font-size: 0.9rem;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .theme-tab:hover {
      color: #e0e0e0;
    }
    .theme-tab.active {
      color: #667eea;
      border-bottom-color: #667eea;
    }
    .screenshot-container {
      display: none;
      margin-top: 1rem;
    }
    .screenshot-container.active {
      display: block;
    }
    .screenshot-container img {
      width: 100%;
      border-radius: 4px;
      border: 1px solid #333;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .screenshot-container img:hover {
      transform: scale(1.02);
    }
    .lightbox {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .lightbox.active {
      display: flex;
    }
    .lightbox img {
      max-width: 90%;
      max-height: 90%;
      border-radius: 4px;
    }
    .lightbox-close {
      position: absolute;
      top: 2rem;
      right: 2rem;
      font-size: 2rem;
      color: #fff;
      cursor: pointer;
      background: rgba(0, 0, 0, 0.5);
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Peek Stash Browser</h1>
    <p>Version ${version} Screenshots</p>
  </div>

  ${Object.entries(organized)
    .map(
      ([pageName, viewports]) => `
  <div class="page-section">
    <h2 class="page-title">${pageName.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</h2>
    <p class="page-description">${getPageDescription(pageName)}</p>

    <div class="viewport-grid">
      ${Object.entries(viewports)
        .map(
          ([viewport, themes]) => `
      <div class="viewport-card">
        <div class="viewport-name">${viewport.toUpperCase()}</div>
        <div class="theme-tabs">
          ${Object.keys(themes)
            .map(
              (theme, idx) => `
          <button class="theme-tab ${idx === 0 ? 'active' : ''}"
                  data-viewport="${viewport}"
                  data-theme="${theme}"
                  data-page="${pageName}">
            ${theme}
          </button>
          `
            )
            .join('')}
        </div>
        ${Object.entries(themes)
          .map(
            ([theme, url], idx) => `
        <div class="screenshot-container ${idx === 0 ? 'active' : ''}"
             data-viewport="${viewport}"
             data-theme="${theme}"
             data-page="${pageName}">
          <img src="${url}" alt="${pageName} - ${viewport} - ${theme}" onclick="openLightbox('${url}')">
        </div>
        `
          )
          .join('')}
      </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
    )
    .join('')}

  <div class="lightbox" id="lightbox" onclick="closeLightbox()">
    <span class="lightbox-close">&times;</span>
    <img id="lightbox-img" src="" alt="Screenshot">
  </div>

  <script>
    // Theme tab switching
    document.querySelectorAll('.theme-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const viewport = e.target.dataset.viewport;
        const theme = e.target.dataset.theme;
        const page = e.target.dataset.page;

        // Update active tab
        document.querySelectorAll(\`.theme-tab[data-viewport="\${viewport}"][data-page="\${page}"]\`).forEach(t => {
          t.classList.remove('active');
        });
        e.target.classList.add('active');

        // Show corresponding screenshot
        document.querySelectorAll(\`.screenshot-container[data-viewport="\${viewport}"][data-page="\${page}"]\`).forEach(container => {
          container.classList.remove('active');
        });
        document.querySelector(\`.screenshot-container[data-viewport="\${viewport}"][data-theme="\${theme}"][data-page="\${page}"]\`).classList.add('active');
      });
    });

    // Lightbox
    function openLightbox(url) {
      document.getElementById('lightbox-img').src = url;
      document.getElementById('lightbox').classList.add('active');
    }

    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('active');
    }

    // Close lightbox on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  </script>
</body>
</html>`;

  return html;
}

/**
 * Save gallery HTML locally (ImageChest doesn't support HTML uploads)
 */
function saveGalleryHTML(html) {
  console.log('💾 Saving gallery page locally...');

  const localGalleryPath = path.join(screenshotDir, 'gallery.html');
  fs.writeFileSync(localGalleryPath, html, 'utf-8');
  console.log(`✅ Gallery saved: ${localGalleryPath}`);

  return localGalleryPath;
}

/**
 * Main publish function
 */
async function publishScreenshots() {
  console.log('🚀 Starting screenshot publishing...');
  console.log(`📦 Version: ${version}`);

  // Check if screenshots exist
  const files = checkScreenshotsExist();

  try {
    // Upload all screenshots
    const { images: uploadedImages, posts } = await uploadAllScreenshots(files);

    // Generate gallery HTML
    console.log('\n🎨 Generating gallery page...');
    const galleryHTML = generateGalleryHTML(uploadedImages);

    // Save gallery HTML locally
    const localGalleryPath = saveGalleryHTML(galleryHTML);

    console.log('\n✨ Publishing complete!');
    console.log(`\n📸 Total images uploaded: ${uploadedImages.length}`);
    console.log(`📂 Gallery HTML: ${localGalleryPath}`);
    console.log(`\n📁 ImageChest Posts Created (${posts.length}):`);
    posts.forEach((post) => {
      console.log(`   ${post.viewport}: ${post.postUrl} (${post.imageCount} images)`);
    });
    console.log('\n💡 All images are hosted on ImageChest with public visibility.');
    console.log('💡 Open gallery.html locally to view the complete gallery with all screenshots.');

  } catch (error) {
    console.error('\n❌ Publishing failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  publishScreenshots().catch(console.error);
}

module.exports = { publishScreenshots };
