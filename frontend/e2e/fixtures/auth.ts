import { test as base, expect } from '@playwright/test';

/**
 * Test fixtures for authenticated tests.
 *
 * This provides helper functions for setting up authenticated state.
 * In CI, use Firebase Auth emulator with test tokens.
 */

// Extend base test with auth fixtures
export const test = base.extend<{
  authenticatedPage: typeof base;
}>({
  // Authenticated page fixture
  authenticatedPage: async ({ page, context }, use) => {
    // For local development/CI with Firebase emulator,
    // set up auth state here

    // Option 1: Use Firebase Auth emulator token
    // This requires FIREBASE_AUTH_EMULATOR_HOST to be set
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      // Sign in with test user via emulator
      // Implementation depends on your auth setup
    }

    // Option 2: Set mock auth state in localStorage
    // This works for testing the UI without real Firebase
    await context.addCookies([
      {
        name: 'auth-test',
        value: 'true',
        domain: 'localhost',
        path: '/',
      },
    ]);

    // Mock localStorage auth state
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_test_mode', 'true');
    });

    await use(base);
  },
});

export { expect };

/**
 * Helper to mock authenticated state.
 *
 * Usage in tests:
 *   await mockAuthState(page, {
 *     uid: 'test-user-123',
 *     email: 'test@example.com',
 *     orgId: 'test-org-456',
 *     role: 'admin',
 *   });
 */
export interface MockAuthOptions {
  uid: string;
  email: string;
  name?: string;
  orgId: string;
  role: 'owner' | 'admin' | 'reviewer' | 'candidate';
}

export async function mockAuthState(
  page: import('@playwright/test').Page,
  options: MockAuthOptions
) {
  await page.addInitScript((opts) => {
    // Store mock auth state
    window.localStorage.setItem('mock_auth_user', JSON.stringify({
      uid: opts.uid,
      email: opts.email,
      name: opts.name || opts.email.split('@')[0],
      emailVerified: true,
    }));

    window.localStorage.setItem('mock_auth_org', JSON.stringify({
      id: opts.orgId,
      role: opts.role,
    }));

    // Flag that we're in test mode
    window.localStorage.setItem('test_mode', 'true');
  }, options);
}

/**
 * Helper to intercept and mock API responses.
 */
export async function mockApiResponse(
  page: import('@playwright/test').Page,
  urlPattern: string | RegExp,
  response: object,
  status = 200
) {
  await page.route(urlPattern, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: response }),
    });
  });
}
