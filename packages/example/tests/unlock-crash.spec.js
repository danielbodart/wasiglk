import { test, expect } from '@playwright/test';

test.describe('Unlock Crash Investigation', () => {
  test('unlock grate command sequence', async ({ page }) => {
    // Collect console messages
    const consoleMessages = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push('[' + msg.type() + '] ' + text);
      // Print debug messages immediately
      if (text.includes('DEBUG')) {
        console.log('WASM:', text);
      }
    });

    // Collect any page errors
    const pageErrors = [];
    page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
      pageErrors.push(error.message);
    });

    await page.goto('/');

    // Wait for game to be ready
    await expect(page.locator('#status')).toContainText('Game initialized', { timeout: 10000 });
    await expect(page.locator('#input')).toBeEnabled();

    const input = page.locator('#input');
    const send = page.locator('#send');

    const commands = ['in', 'take keys', 'out', 's', 's', 's', 'unlock grate'];

    for (const cmd of commands) {
      console.log('>>> Sending command:', cmd);
      await input.fill(cmd);
      await send.click();

      // Wait for input to be re-enabled (response received)
      try {
        await expect(input).toBeEnabled({ timeout: 10000 });
        console.log('>>> Command completed:', cmd);
      } catch (e) {
        console.log('>>> TIMEOUT at command:', cmd);
        console.log('Recent console messages:');
        consoleMessages.slice(-20).forEach(m => console.log('  ', m));
        console.log('Page errors:', pageErrors);
        throw new Error('Crash/timeout at command: ' + cmd);
      }
    }

    // If we get here, no crash occurred
    console.log('All commands succeeded!');
    expect(pageErrors.length).toBe(0);
  });
});
