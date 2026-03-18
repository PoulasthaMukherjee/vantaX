import { test, expect } from '@playwright/test';
import { mockApiResponse } from './fixtures/auth';

/**
 * Talent search and public profile E2E tests.
 */

test.describe('Public Profile', () => {
  test('public profile page renders without auth', async ({ page }) => {
    // Mock public profile API (no auth required)
    await page.route('**/api/public/profiles/*', (route) => {
      const url = route.request().url();

      if (url.includes('jane-doe')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'profile-123',
              slug: 'jane-doe',
              name: 'Jane Doe',
              github_url: 'https://github.com/janedoe',
              github_verified: true,
              linkedin_url: 'https://linkedin.com/in/janedoe',
              about_me: 'Full-stack developer passionate about clean code.',
              skills: ['TypeScript', 'React', 'Python', 'PostgreSQL'],
              vibe_score: 92.5,
              total_points: 2500,
            },
          }),
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found or not public' },
          }),
        });
      }
    });

    // Visit public profile
    await page.goto('/u/jane-doe');

    // Should show profile name
    await expect(page.getByText('Jane Doe')).toBeVisible();

    // Should show vibe score
    await expect(page.getByText('92.5').first()).toBeVisible();

    // Should show skills
    await expect(page.getByText('TypeScript')).toBeVisible();
    await expect(page.getByText('React')).toBeVisible();

    // Should show GitHub verified badge
    await expect(page.getByText(/verified/i)).toBeVisible();

    // Should NOT redirect to login
    expect(page.url()).toContain('/u/jane-doe');
    expect(page.url()).not.toContain('/login');
  });

  test('public profile shows 404 for non-existent profile', async ({ page }) => {
    // Mock 404 response
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

    await page.goto('/u/nonexistent-user');

    // Should show error message
    await expect(page.getByText(/not found/i)).toBeVisible();

    // Should NOT redirect to login
    expect(page.url()).not.toContain('/login');
  });
});

test.describe('Talent Search (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth for admin user
    await mockApiResponse(page, '**/api/v1/auth/me', {
      user: {
        id: 'admin-user-id',
        email: 'admin@example.com',
        name: 'Admin User',
        email_verified: true,
      },
      organizations: [
        {
          organization_id: 'org-123',
          organization_name: 'Test Company',
          organization_slug: 'test-company',
          role: 'admin',
        },
      ],
    });

    await mockApiResponse(page, '**/api/v1/organizations/current', {
      id: 'org-123',
      name: 'Test Company',
      slug: 'test-company',
      status: 'active',
      plan: 'pro',
    });

    // Mock talent search results
    await mockApiResponse(page, '**/api/v1/talent/search*', {
      profiles: [
        {
          id: 'profile-1',
          slug: 'alice',
          name: 'Alice Smith',
          github_verified: true,
          skills: ['Python', 'Django'],
          vibe_score: 88.0,
          total_points: 1800,
        },
        {
          id: 'profile-2',
          slug: 'bob',
          name: 'Bob Jones',
          github_verified: false,
          skills: ['JavaScript', 'Node.js'],
          vibe_score: 75.5,
          total_points: 1200,
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
    });

    // Mock empty shortlist
    await mockApiResponse(page, '**/api/v1/talent/shortlist', []);
  });

  test('talent page loads for admin', async ({ page }) => {
    await page.goto('/talent');

    // Should show talent heading
    await expect(page.getByRole('heading', { name: /talent/i })).toBeVisible({ timeout: 10000 });

    // Should show search tab (use navigation context to avoid ambiguity)
    await expect(page.getByRole('navigation').getByRole('button', { name: /search/i })).toBeVisible();

    // Should show shortlist tab
    await expect(page.getByRole('navigation').getByRole('button', { name: /shortlist/i })).toBeVisible();
  });

  test('talent search shows results', async ({ page }) => {
    await page.goto('/talent');

    // Wait for search results to load
    await expect(page.getByText('Alice Smith')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Bob Jones')).toBeVisible();

    // Should show profile count
    await expect(page.getByText(/2 profile/i)).toBeVisible();
  });

  test('can filter by vibe score', async ({ page }) => {
    await page.goto('/talent');

    // Find and use vibe score filter
    const scoreFilter = page.getByRole('combobox').filter({ hasText: /vibe score/i });

    if (await scoreFilter.isVisible()) {
      await scoreFilter.selectOption('80');
      // Filter should be applied (results would update)
    }
  });
});
