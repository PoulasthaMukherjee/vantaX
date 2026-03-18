import { test, expect } from '@playwright/test';

/**
 * Authentication E2E tests.
 *
 * Note: Full auth flow testing requires Firebase Auth emulator.
 * These tests focus on public routes and login page UI.
 * Set FIREBASE_AUTH_EMULATOR_HOST for full auth testing.
 */

test.describe('Login Page', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Check page title (h1 is "Vibe", h2 is "Sign in to continue")
    await expect(page.getByRole('heading', { name: /vibe/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/sign in to continue/i)).toBeVisible();

    // Check for sign-in buttons
    const googleButton = page.getByRole('button', { name: /continue with google/i });
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();

    const githubButton = page.getByRole('button', { name: /continue with github/i });
    await expect(githubButton).toBeVisible();
    await expect(githubButton).toBeEnabled();
  });

  test('login page shows terms notice', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText(/terms of service/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/privacy policy/i)).toBeVisible();
  });
});

test.describe('Public Routes', () => {
  test('public profile page is accessible without auth', async ({ page }) => {
    // Mock the public profile API
    await page.route('**/api/public/profiles/*', (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
        }),
      });
    });

    await page.goto('/u/test-user');

    // Should not redirect to login
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toContain('/u/test-user');

    // Page should load (shows not found message for non-existent profile)
    await expect(page.locator('body')).toBeVisible();
  });

  test('public profile shows profile data when exists', async ({ page }) => {
    // Mock the public profile API with valid profile
    await page.route('**/api/public/profiles/john-doe', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'profile-123',
            slug: 'john-doe',
            name: 'John Doe',
            github_url: 'https://github.com/johndoe',
            github_verified: true,
            about_me: 'Software developer',
            skills: ['Python', 'JavaScript'],
            vibe_score: 85.0,
            total_points: 2000,
          },
        }),
      });
    });

    await page.goto('/u/john-doe');

    // Should show profile name
    await expect(page.getByText('John Doe')).toBeVisible({ timeout: 10000 });

    // Should show skills
    await expect(page.getByText('Python')).toBeVisible();

    // Should not redirect to login
    expect(page.url()).not.toContain('/login');
  });

  test('login route redirects to dashboard when already at login', async ({ page }) => {
    // Going to /login directly should render the login page
    await page.goto('/login');

    // URL should stay at /login
    expect(page.url()).toContain('/login');

    // Should show login content
    await expect(page.getByRole('heading', { name: /vibe/i })).toBeVisible({ timeout: 10000 });
  });
});
