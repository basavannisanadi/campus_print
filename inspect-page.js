import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import http from 'http';

async function checkServer(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function main() {
  console.log('Starting inspection of http://localhost:5173...');

  // Start backend server if not running
  let backendRunning = await checkServer('http://localhost:3001/api/shops');
  let backendProc = null;
  if (!backendRunning) {
    console.log('Starting backend server...');
    backendProc = spawn('npx', ['tsx', 'server/index.ts'], {
      env: { ...process.env, PORT: '3001', NODE_ENV: 'test' },
      stdio: 'ignore',
      shell: true
    });
    // Wait for backend
    for (let i = 0; i < 30; i++) {
      if (await checkServer('http://localhost:3001/api/shops')) {
        backendRunning = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Start Vite dev server on port 5173 if not running
  let viteRunning = await checkServer('http://localhost:5173');
  let viteProc = null;
  if (!viteRunning) {
    console.log('Starting Vite dev server on port 5173...');
    viteProc = spawn('npx', ['vite', '--port=5173', '--host=127.0.0.1'], {
      stdio: 'ignore',
      shell: true
    });
    for (let i = 0; i < 30; i++) {
      if (await checkServer('http://localhost:5173')) {
        viteRunning = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!viteRunning) {
    console.error('Failed to start Vite dev server on http://localhost:5173');
    if (backendProc) backendProc.kill();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const networkFailures = [];
  page.on('requestfailed', request => {
    networkFailures.push({
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown'
    });
  });

  page.on('response', response => {
    if (response.status() >= 400) {
      networkFailures.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.log('Navigation warning:', e.message);
  }

  // Wait a bit for async rendering
  await page.waitForTimeout(2000);

  // Check broken images
  const brokenImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => ({ src: img.src, alt: img.alt }));
  });

  // Check accessibility issues (basic check: images without alt, buttons without aria-label/text)
  const a11yIssues = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('img').forEach(img => {
      if (!img.hasAttribute('alt')) {
        issues.push({ element: 'img', src: img.src, issue: 'Missing alt attribute' });
      }
    });
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.innerText.trim();
      const ariaLabel = btn.getAttribute('aria-label');
      const title = btn.getAttribute('title');
      if (!text && !ariaLabel && !title) {
        issues.push({ element: 'button', html: btn.outerHTML.substring(0, 100), issue: 'Button has no accessible text or aria-label' });
      }
    });
    return issues;
  });

  // Check layout problems (overflow or overlapping)
  const layoutIssues = await page.evaluate(() => {
    const issues = [];
    if (document.body.scrollWidth > window.innerWidth + 10) {
      issues.push(`Horizontal overflow detected: scrollWidth (${document.body.scrollWidth}) > window.innerWidth (${window.innerWidth})`);
    }
    return issues;
  });

  // Take screenshot
  await page.screenshot({ path: 'homepage-inspection.png', fullPage: true });
  console.log('Screenshot saved to homepage-inspection.png');

  console.log('\n=== INSPECTION REPORT ===');
  console.log('Console Errors:', consoleErrors.length > 0 ? consoleErrors : 'None');
  console.log('Network Failures:', networkFailures.length > 0 ? networkFailures : 'None');
  console.log('Broken Images:', brokenImages.length > 0 ? brokenImages : 'None');
  console.log('Layout Issues:', layoutIssues.length > 0 ? layoutIssues : 'None');
  console.log('Accessibility Issues (Basic):', a11yIssues.length > 0 ? a11yIssues : 'None');
  console.log('=========================\n');

  await browser.close();
  if (viteProc) viteProc.kill();
  if (backendProc) backendProc.kill();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
