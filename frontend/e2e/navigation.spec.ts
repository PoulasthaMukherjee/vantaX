import { test, expect } from '@playwright/test';
import { mockApiResponse } from './fixtures/auth';

/**
 * Navigation and UI E2E tests.
 *
 * These tests verify basic navigation works and UI elements render correctly.
 * Uses API mocking to avoid needing a real backend.
 */

test.describe('Navigation (Mocked)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth API
    await mockApiResponse(page, '**/api/v1/auth/me', {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      organizations: [
        {
          organization_id: 'test-org-id',
          organization_name: 'Test Org',
          organization_slug: 'test-org',
          role: 'admin',
        },
      ],
    });

    // Mock organization API
    await mockApiResponse(page, '**/api/v1/organizations/current', {
      id: 'test-org-id',
      name: 'Test Org',
      slug: 'test-org',
      status: 'active',
      plan: 'pro',
    });

    // Mock profile API
    await mockApiResponse(page, '**/api/v1/profiles/me', {
      id: 'test-profile-id',
      user_id: 'test-user-id',
      name: 'Test User',
      vibe_score: 85.5,
      total_points: 1500,
      slug: 'test-user',
      is_public: false,
      is_complete: true,
      resume_file_path: null,
      resume_filename: null,
      skills: [],
    });

    // Mock empty lists
    await mockApiResponse(page, '**/api/v1/assessments*', []);
    await mockApiResponse(page, '**/api/v1/submissions*', []);
    await mockApiResponse(page, '**/api/v1/events*', []);
  });

  test('dashboard loads with mocked data', async ({ page }) => {
    await page.goto('/dashboard');

    // Check page title/heading exists
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('profile page shows user info', async ({ page }) => {
    await page.goto('/profile');

    // Should show profile heading or user name
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10000 });
  });

  test('assessments page loads', async ({ page }) => {
    await page.goto('/assessments');

    // Should have page content
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('events page loads', async ({ page }) => {
    await page.goto('/events');

    // Should have page content
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error States', () => {
  test('shows error when API fails', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/v1/auth/me', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Server error' },
        }),
      });
    });

    await page.goto('/dashboard');

    // Should redirect to login on auth failure
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('handles 404 gracefully', async ({ page }) => {
    const response = await page.goto('/nonexistent-page');

    // Should redirect to dashboard or show 404
    // Based on your App.tsx, it redirects to dashboard
    await expect(page).toHaveURL(/\/dashboard|\/login/);
  });
});
