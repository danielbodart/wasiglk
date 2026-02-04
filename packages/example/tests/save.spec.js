import { test, expect } from '@playwright/test';

test.describe('Save/Restore', () => {
  test('can save the game', async ({ page }) => {
    // Capture console messages for debugging
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/');

    // Wait for game to be ready
    await expect(page.locator('#status')).toContainText('Game initialized', { timeout: 10000 });
    await expect(page.locator('#input')).toBeEnabled();

    const input = page.locator('#input');
    const send = page.locator('#send');
    const output = page.locator('#output');

    // Show logs before save
    console.log('Logs before save:', consoleLogs.filter(l => l.includes('[error]')).slice(-10));

    // Save the game
    await input.fill('save');
    await send.click();

    // Wait for response - should show "Ok." on success
    await expect(output).toContainText('Ok.', { timeout: 5000 });

    // Wait a bit for writes to complete
    await page.waitForTimeout(1000);

    // Show ALL logs related to files
    const fileLogs = consoleLogs.filter(l =>
      l.includes('fileref') || l.includes('stream_open') ||
      l.includes('opfs') || l.includes('dispa') || l.includes('path_open'));
    console.log('File-related logs:', fileLogs);

    // Verify OPFS file was created
    const opfsLogs = consoleLogs.filter(l => l.includes('opfs'));

    // Show all stderr logs (interpreter output)
    const allStderr = consoleLogs.filter(l => l.includes('[error]'));
    console.log('All stderr count:', allStderr.length);
    console.log('All stderr (last 20):', allStderr.slice(-20));

    expect(opfsLogs.some(l => l.includes('Created persistent file'))).toBe(true);
  });

  test('save persists across page reload', async ({ page }) => {
    // Capture console messages
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/');

    // Wait for game to be ready
    await expect(page.locator('#status')).toContainText('Game initialized', { timeout: 10000 });
    await expect(page.locator('#input')).toBeEnabled();

    const input = page.locator('#input');
    const send = page.locator('#send');
    const output = page.locator('#output');
    const statusBar = page.locator('#game-status-bar');

    // Make a move to change game state
    await input.fill('in');
    await send.click();
    await expect(statusBar).toContainText('Moves: 2', { timeout: 5000 });
    await expect(output).toContainText('Inside Building', { timeout: 5000 });

    // Save the game
    await input.fill('save');
    await send.click();
    await expect(output).toContainText('Ok.', { timeout: 5000 });

    // Wait for OPFS write to complete
    await page.waitForTimeout(500);

    // Show logs from BEFORE reload (including save operation)
    const saveOpLogs = consoleLogs.filter(l => l.includes('save.glksave') || l.includes('oflags=9') || l.includes('fmode=1') || l.includes('stream_close') || l.includes('syncing') || l.includes('opfs'));
    console.log('Save operation logs before reload:', saveOpLogs);

    // Reload the page
    consoleLogs.length = 0; // Clear logs
    await page.reload();

    // Wait for game to be ready again
    await expect(page.locator('#status')).toContainText('Game initialized', { timeout: 10000 });
    await expect(page.locator('#input')).toBeEnabled();

    // Check that OPFS loaded the saved file
    await page.waitForTimeout(500);
    const loadLogs = consoleLogs.filter(l => l.includes('opfs'));
    console.log('Load logs after reload:', loadLogs);

    // Debug: show all wasi and glk logs
    const wasiLogs = consoleLogs.filter(l => l.includes('wasi') || l.includes('glk'));
    console.log('WASI/GLK logs:', wasiLogs);

    // Show all interpreter stderr
    const stderrLogs = consoleLogs.filter(l => l.includes('[error]') || l.includes('interpreter'));
    console.log('Stderr logs:', stderrLogs);

    // Should have loaded at least 1 file (the save we just created)
    expect(loadLogs.some(l => l.includes('Loaded') && !l.includes('Loaded 0'))).toBe(true);

    // Debug: Show all console logs before restore
    console.log('All logs before restore:', consoleLogs.slice(-20));

    // Restore the game
    await input.fill('restore');
    await send.click();

    // Wait a bit for response
    await page.waitForTimeout(3000);

    // Debug: Show all console logs that contain fileref or stream
    const filerefLogs = consoleLogs.filter(l => l.includes('fileref') || l.includes('save.glksave') || l.includes('0x42') || l.includes('0x62') || l.includes('glkop'));
    console.log('Fileref/save logs:', filerefLogs);

    // Debug: Show ALL new console logs after restore
    console.log('All logs after restore (last 50):', consoleLogs.slice(-50));

    // Check output content
    const outputText = await output.textContent();
    console.log('Output text after restore:', outputText?.slice(-500));

    await expect(output).toContainText('Ok.', { timeout: 5000 });

    // After restore, the status bar should show we're inside the building (where we saved)
    // Note: The game doesn't re-display the room after restore, it just shows "Ok."
    // So we check the status bar instead of the output text
    await expect(statusBar).toContainText('Inside Building', { timeout: 5000 });
  });
});
