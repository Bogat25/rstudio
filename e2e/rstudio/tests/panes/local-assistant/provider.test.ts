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
      await executeCommand(page, 'activateChat');
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

  test('pop-out and return load the same local client', { tag: '@desktop_only' }, async ({ rstudioPage: page }) => {
    await setPref(page, 'chat_provider', 'local');
    await executeCommand(page, 'activateChat');
    await expect(page.frameLocator("iframe[title='Posit Assistant']").locator('body[data-provider=local]')).toBeVisible({ timeout: 30000 });
    const nextPage = page.context().waitForEvent('page');
    await executeCommand(page, 'popOutChat');
    const satellite = await nextPage;
    await expect(satellite.frameLocator("iframe[title='Posit Assistant']").locator('body[data-provider=local]')).toBeVisible({ timeout: 30000 });
    const closed = satellite.waitForEvent('close');
    await executeCommand(page, 'returnChatToMain');
    await closed;
    await expect(page.frameLocator("iframe[title='Posit Assistant']").locator('body[data-provider=local]')).toBeVisible();
    await setPref(page, 'chat_provider', 'none');
  });
});
