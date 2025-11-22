#!/usr/bin/env node

/**
 * Screenshot Capture Script
 *
 * Captures screenshots of Peek pages across multiple viewports and themes.
 * Uses Playwright to automate browser interactions.
 *
 * Usage:
 *   node screenshots/capture.js
 *   npm run screenshots
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Load version from package.json
const packagePath = path.join(__dirname, '..', 'client', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
const version = packageJson.version;

// Output directory
const outputDir = path.join(__dirname, 'output', version);

/**
 * Ensure output directory exists
 */
function ensureOutputDir() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  console.log(`📁 Output directory: ${outputDir}`);
}

/**
 * Login to Peek
 */
async function login(page) {
  console.log('🔐 Logging in...');

  await page.goto(`${config.baseUrl}/`);
  await page.fill('input[name="username"]', config.loginCredentials.username);
  await page.fill('input[name="password"]', config.loginCredentials.password);

  // Click submit and wait for navigation
  await Promise.all([
    page.waitForNavigation({ timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);

  // Check if login succeeded
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    throw new Error(`Login failed. Still on login page. Check credentials.`);
  }

  console.log('✅ Logged in successfully');
}

/**
 * Set theme via settings
 */
async function setTheme(page, theme) {
  console.log(`🎨 Using theme: ${theme} (no theme switching - using default)`);
  // Theme switching disabled - CoolUser doesn't have settings access
  // Using default theme (dark)
}

/**
 * Resolve page path with dynamic IDs
 */
function resolvePagePath(pageConfig) {
  let resolvedPath = pageConfig.path;

  // Replace dynamic segments with actual IDs from config
  if (pageConfig.sceneId) {
    resolvedPath = resolvedPath.replace('{sceneId}', pageConfig.sceneId);
  }
  if (pageConfig.performerId) {
    resolvedPath = resolvedPath.replace('{performerId}', pageConfig.performerId);
  }
  if (pageConfig.studioId) {
    resolvedPath = resolvedPath.replace('{studioId}', pageConfig.studioId);
  }
  if (pageConfig.tagId) {
    resolvedPath = resolvedPath.replace('{tagId}', pageConfig.tagId);
  }
  if (pageConfig.galleryId) {
    resolvedPath = resolvedPath.replace('{galleryId}', pageConfig.galleryId);
  }
  if (pageConfig.groupId) {
    resolvedPath = resolvedPath.replace('{groupId}', pageConfig.groupId);
  }
  if (pageConfig.imageId) {
    resolvedPath = resolvedPath.replace('{imageId}', pageConfig.imageId);
  }
  if (pageConfig.playlistId) {
    resolvedPath = resolvedPath.replace('{playlistId}', pageConfig.playlistId);
  }

  return resolvedPath;
}

/**
 * Execute page interactions
 */
async function executeInteractions(page, interactions) {
  if (!interactions || interactions.length === 0) return;

  for (const interaction of interactions) {
    console.log(`  → Interaction: ${interaction.action} on ${interaction.selector}`);

    switch (interaction.action) {
      case 'click':
        await page.click(interaction.selector);
        break;
      case 'hover':
        await page.hover(interaction.selector);
        break;
      case 'scroll':
        await page.evaluate((selector) => {
          document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
        }, interaction.selector);
        break;
    }

    if (interaction.waitAfter) {
      await page.waitForTimeout(interaction.waitAfter);
    }
  }
}

/**
 * Capture screenshot for a specific page/viewport/theme combination
 */
async function captureScreenshot(page, pageConfig, viewportName, viewport, theme) {
  const pageName = pageConfig.name;
  const fileName = `${pageName}_${viewportName}_${theme}.png`;
  const filePath = path.join(outputDir, fileName);

  console.log(`📸 Capturing: ${fileName}`);

  try {
    // Set viewport
    await page.setViewportSize(viewport);

    // Navigate to page
    const resolvedPath = resolvePagePath(pageConfig);

    // Skip page if IDs are not configured
    if (resolvedPath.includes('{') && resolvedPath.includes('}')) {
      console.log(`  ⚠️  Skipping ${pageName}: ID not configured in config.json`);
      return;
    }

    await page.goto(`${config.baseUrl}${resolvedPath}`, { timeout: 60000 });

    // Wait for page-specific selector
    if (pageConfig.waitForSelector) {
      try {
        await page.waitForSelector(pageConfig.waitForSelector, { timeout: 10000 });
      } catch (err) {
        console.log(`  ⚠️  Selector not found: ${pageConfig.waitForSelector}`);
      }
    }

    // Additional wait time for content to load
    if (pageConfig.waitTime) {
      await page.waitForTimeout(pageConfig.waitTime);
    }

    // Execute interactions (e.g., open lightbox)
    if (pageConfig.interactions) {
      await executeInteractions(page, pageConfig.interactions);
    }

    // Wait for network to be idle
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    // Take screenshot
    await page.screenshot({
      path: filePath,
      fullPage: pageConfig.fullPage !== false, // Capture full scrollable page unless explicitly disabled
    });

    console.log(`  ✅ Saved: ${fileName}`);
  } catch (error) {
    console.error(`  ❌ Error capturing ${fileName}:`, error.message);
  }
}

/**
 * Main capture function
 */
async function captureScreenshots() {
  console.log('🚀 Starting screenshot capture...');
  console.log(`📦 Version: ${version}`);
  console.log(`🌐 Base URL: ${config.baseUrl}`);

  ensureOutputDir();

  const browser = await chromium.launch({
    headless: true, // Run in headless mode for speed
  });

  try {
    // Create a new browser context
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Login once
    await login(page);

    // Iterate through themes
    for (const theme of config.themes) {
      console.log(`\n🎨 Theme: ${theme}`);

      // Set theme
      await setTheme(page, theme);

      // Iterate through pages
      for (const pageConfig of config.pages) {
        console.log(`\n📄 Page: ${pageConfig.name} (${pageConfig.description})`);

        // Iterate through viewports
        for (const [viewportName, viewport] of Object.entries(config.viewports)) {
          await captureScreenshot(page, pageConfig, viewportName, viewport, theme);
        }
      }
    }

    console.log('\n✨ Screenshot capture complete!');
    console.log(`📁 Screenshots saved to: ${outputDir}`);

    // Count total screenshots
    const files = fs.readdirSync(outputDir);
    console.log(`📊 Total screenshots: ${files.length}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run the script
if (require.main === module) {
  captureScreenshots().catch(console.error);
}

module.exports = { captureScreenshots };
