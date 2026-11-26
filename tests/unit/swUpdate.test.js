/**
 * @vitest-environment jsdom
 *
 * swUpdate.test.js — TEST-004: pwa/js/swUpdate.js registers the service
 * worker when the page loads and, when a new worker takes over an existing
 * one, offers a reload in a banner (once). It runs on import, so each test
 * imports a fresh copy with its own navigator.serviceWorker.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

function stubServiceWorker({ controller = null, register = () => Promise.resolve({}) } = {}) {
  const listeners = {};
  const registered = [];
  const serviceWorker = {
    controller,
    // A plain function: a vi.fn handles the promise it returns itself, so a
    // rejection would never go unhandled even without swUpdate.js's catch.
    register: (...args) => {
      registered.push(args);
      return register();
    },
    addEventListener: (type, listener) => { (listeners[type] ||= []).push(listener); },
  };
  Object.defineProperty(window.navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
  return { registered, fire: type => (listeners[type] || []).forEach(listener => listener()) };
}

async function load() {
  vi.resetModules();
  await import('../../pwa/js/swUpdate.js');
}

afterEach(() => {
  delete window.navigator.serviceWorker;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('swUpdate.js', () => {
  it('registers sw.js, and ignores a failed registration', async () => {
    const { registered } = stubServiceWorker({ register: () => Promise.reject(new Error('insecure')) });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await load();
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', unhandled);
    }
    expect(registered).toEqual([['sw.js']]);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('shows no banner when the first worker takes control (a fresh install)', async () => {
    const { fire } = stubServiceWorker({ controller: null });
    await load();
    fire('controllerchange');
    expect(document.getElementById('update-banner')).toBe(null);
  });

  it('offers a reload once when a new worker replaces the old one, and can be closed', async () => {
    const { fire } = stubServiceWorker({ controller: {} });
    await load();
    document.body.innerHTML = '<main id="app"></main>';
    fire('controllerchange');
    fire('controllerchange');
    const banners = document.querySelectorAll('#update-banner');
    expect(banners).toHaveLength(1);
    const banner = banners[0];
    expect(document.body.firstElementChild).toBe(banner);
    expect(banner.textContent).toContain('新版本已就緒');
    // CSP (INFRA-113): no inline handlers in the banner's markup.
    expect(banner.innerHTML).not.toMatch(/\son[a-z]+=/i);
    const buttons = [...banner.querySelectorAll('button')];
    expect(buttons.map(button => [button.className, button.type])).toEqual([
      ['update-banner-reload', 'button'],
      ['update-banner-close', 'button'],
    ]);
    banner.querySelector('.update-banner-close').click();
    expect(document.getElementById('update-banner')).toBe(null);
    // A later update shows it again.
    fire('controllerchange');
    expect(document.getElementById('update-banner')).not.toBe(null);
    expect(document.getElementById('app')).not.toBe(null);
  });

  it('reloads the page from the banner', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { value: { reload }, configurable: true });
    try {
      const { fire } = stubServiceWorker({ controller: {} });
      await load();
      fire('controllerchange');
      document.querySelector('.update-banner-reload').click();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { value: original, configurable: true });
    }
  });

  it('does nothing in a browser without service workers', async () => {
    delete window.navigator.serviceWorker;
    expect('serviceWorker' in window.navigator).toBe(false);
    await expect(load()).resolves.toBeUndefined();
    expect(document.body.innerHTML).toBe('');
  });
});
