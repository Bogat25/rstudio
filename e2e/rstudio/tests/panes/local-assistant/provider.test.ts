import { test, expect } from '@fixtures/rstudio.fixture';
import { executeCommand, setPref } from '@utils/commands';

// The iframe's short-lived authentication must stay out of recorded URLs.
test.use({ trace: 'off' });

test.describe('Local assistant provider', { tag: ['@chat'] }, () => {

  test('opens its bundled client without a Posit update check and stops when disabled', async ({ rstudioPage: page }) => {
    let checks = 0;
    const listener = (request: { url(): string }) => {
      if (/\/rpc\/chat_check_for_updates/.test(request.url())) ++checks;
    };
    page.on('request', listener);
    try {
      await setPref(page, 'assistant', 'none');
      await setPref(page, 'chat_provider', 'local');
      await expect(page.locator("iframe[title='Posit Assistant']")).toHaveCount(0);
      await expect(page.locator('#rstudio_assistant_toggle_button')).toHaveCount(0);
      await page.keyboard.press('Control+Shift+T');
      const frame = page.frameLocator("iframe[title='Posit Assistant']");
      await expect(frame.locator('body[data-provider=local]')).toBeVisible({ timeout: 30000 });
      await expect(frame.locator('#status')).not.toHaveText('Connecting to the local assistant…');
      expect(checks).toBe(0);

      await setPref(page, 'chat_provider', 'none');
      await expect.poll(() => page.evaluate(() => window.rstudio?.commands.assistantPaneToggle.isVisible())).toBe(false);
    } finally {
      page.off('request', listener);
      await setPref(page, 'chat_provider', 'none');
    }
  });

  test('only the shortcut opens Chat and toggles repeatedly from iframe focus', { tag: '@desktop_only' }, async ({ rstudioPage: page }) => {
    await setPref(page, 'chat_provider', 'none');
    await setPref(page, 'chat_provider', 'local');
    const iframe = page.locator("iframe[title='Posit Assistant']");
    await expect(iframe).not.toBeVisible();
    expect(await page.evaluate(() => ['activateChat', 'popOutChat', 'returnChatToMain', 'layoutZoomChat']
      .some(id => window.rstudio?.commands[id].isVisible()))).toBe(false);
    await executeCommand(page, 'showCommandPalette');
    const search = page.locator('#rstudio_command_palette_search');
    await expect(search).toBeVisible();
    await search.pressSequentially('Toggle Chat');
    await expect(page.locator('#rstudio_command_palette_list')).not.toContainText('Toggle Chat');
    await search.press('Escape');
    await expect(search).not.toBeVisible();
    await page.keyboard.press('Control+Shift+T');
    const question = page.frameLocator("iframe[title='Posit Assistant']").locator('#question');
    await expect(question).toBeVisible({ timeout: 30000 });
    await question.focus();
    await question.press('Control+Shift+T');
    await expect(iframe).not.toBeVisible();
    await page.keyboard.press('Control+Shift+T');
    await expect(question).toBeVisible();
    await question.press('Control+Shift+T');
    await expect(iframe).not.toBeVisible();
    await setPref(page, 'chat_provider', 'none');
  });
});
