import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker avoids port conflicts and db lock conflicts
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    // Telemetry settings for debugging CI and local test failures
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Auto-start server and frontend dev environments
  webServer: [
    {
      command: 'tsx server/index.ts',
      url: 'http://127.0.0.1:3001/api/shops',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        NODE_ENV: 'test'
      },
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'vite --port=3000 --host=127.0.0.1',
      url: 'http://127.0.0.1:3000/',
      reuseExistingServer: true,
      timeout: 60000,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ],
});
