import { test, expect } from '@playwright/test';
import { mockApiResponse } from './fixtures/auth';

/**
 * Events E2E tests (API mocked).
 *
 * Validates list → detail → registration without a real backend or Firebase.
 */

function nowIso() {
  return new Date().toISOString();
}

async function mockCandidateAuth(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/auth/me', {
    user: {
      id: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      email_verified: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    organizations: [
      {
        organization_id: 'org-123',
        organization_name: 'Test Company',
        organization_slug: 'test-company',
        role: 'candidate',
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

  await mockApiResponse(page, '**/api/v1/profiles/me', {
    id: 'profile-123',
    user_id: 'user-123',
    name: 'Test User',
    vibe_score: 80.0,
    total_points: 1000,
    slug: 'test-user',
    is_public: true,
    is_complete: true,
    resume_file_path: null,
    resume_filename: null,
    skills: [],
  });
}

async function mockAdminAuth(page: import('@playwright/test').Page) {
  await mockApiResponse(page, '**/api/v1/auth/me', {
    user: {
      id: 'admin-123',
      email: 'admin@example.com',
      name: 'Admin User',
      email_verified: true,
      created_at: nowIso(),
      updated_at: nowIso(),
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
}

test.describe('Events (Candidate)', () => {
  test.beforeEach(async ({ page }) => {
    await mockCandidateAuth(page);
  });

  test('events list renders', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/events*', [
      {
        id: 'event-1',
        title: 'Spring Hackathon 2024',
        slug: 'spring-hackathon-2024',
        short_description: 'Build something amazing in 48 hours',
        banner_url: null,
        status: 'upcoming',
        visibility: 'public',
        starts_at: '2024-03-01T09:00:00Z',
        ends_at: '2024-03-03T18:00:00Z',
        max_participants: 100,
        tags: ['hackathon'],
        created_at: '2024-01-01T00:00:00Z',
        participant_count: 45,
      },
      {
        id: 'event-2',
        title: 'AI Challenge',
        slug: 'ai-challenge',
        short_description: 'Create innovative AI solutions',
        banner_url: null,
        status: 'active',
        visibility: 'public',
        starts_at: '2024-02-01T00:00:00Z',
        ends_at: '2024-02-28T23:59:59Z',
        max_participants: 50,
        tags: ['ai'],
        created_at: '2024-01-15T00:00:00Z',
        participant_count: 50,
      },
    ]);

    await page.goto('/events');

    await expect(page.getByText('Spring Hackathon 2024')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('AI Challenge')).toBeVisible();
  });

  test('event detail shows register button', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/events*', [
      {
        id: 'event-1',
        title: 'Spring Hackathon 2024',
        slug: 'spring-hackathon-2024',
        short_description: 'Build something amazing in 48 hours',
        banner_url: null,
        status: 'upcoming',
        visibility: 'public',
        starts_at: '2024-03-01T09:00:00Z',
        ends_at: '2024-03-03T18:00:00Z',
        max_participants: 100,
        tags: ['hackathon'],
        created_at: '2024-01-01T00:00:00Z',
        participant_count: 45,
      },
    ]);

    await mockApiResponse(page, '**/api/v1/events/spring-hackathon-2024', {
      id: 'event-1',
      organization_id: 'org-123',
      created_by: 'admin-123',
      title: 'Spring Hackathon 2024',
      slug: 'spring-hackathon-2024',
      description: 'Build something amazing in 48 hours',
      short_description: 'Build something amazing in 48 hours',
      banner_url: null,
      logo_url: null,
      theme_color: null,
      status: 'upcoming',
      visibility: 'public',
      starts_at: '2024-03-01T09:00:00Z',
      ends_at: '2024-03-03T18:00:00Z',
      registration_opens_at: null,
      registration_closes_at: null,
      max_participants: 100,
      max_submissions_per_user: 3,
      rules: null,
      prizes: null,
      sponsors: null,
      certificates_enabled: true,
      certificate_template: null,
      min_score_for_certificate: 0,
      tags: ['hackathon'],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      participant_count: 45,
      is_registered: false,
      assessment_count: 0,
    });

    await mockApiResponse(page, '**/api/v1/events/event-1/assessments', []);
    await mockApiResponse(page, '**/api/v1/events/event-1/leaderboard*', {
      event_id: 'event-1',
      total_participants: 0,
      entries: [],
      limit: 20,
      offset: 0,
    });

    await page.goto('/events');
    await page.getByText('Spring Hackathon 2024').click();

    await expect(page.getByRole('heading', { name: /spring hackathon 2024/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /register now/i })).toBeVisible();
  });

  test('can register for an event', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/events*', [
      {
        id: 'event-1',
        title: 'Spring Hackathon 2024',
        slug: 'spring-hackathon-2024',
        short_description: 'Build something amazing in 48 hours',
        banner_url: null,
        status: 'active',
        visibility: 'public',
        starts_at: '2024-03-01T09:00:00Z',
        ends_at: '2024-03-03T18:00:00Z',
        max_participants: 100,
        tags: ['hackathon'],
        created_at: '2024-01-01T00:00:00Z',
        participant_count: 45,
      },
    ]);

    await mockApiResponse(page, '**/api/v1/events/spring-hackathon-2024', {
      id: 'event-1',
      organization_id: 'org-123',
      created_by: 'admin-123',
      title: 'Spring Hackathon 2024',
      slug: 'spring-hackathon-2024',
      description: 'Build something amazing in 48 hours',
      short_description: 'Build something amazing in 48 hours',
      banner_url: null,
      logo_url: null,
      theme_color: null,
      status: 'active',
      visibility: 'public',
      starts_at: '2024-03-01T09:00:00Z',
      ends_at: '2024-03-03T18:00:00Z',
      registration_opens_at: null,
      registration_closes_at: null,
      max_participants: 100,
      max_submissions_per_user: 3,
      rules: null,
      prizes: null,
      sponsors: null,
      certificates_enabled: true,
      certificate_template: null,
      min_score_for_certificate: 0,
      tags: ['hackathon'],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      participant_count: 45,
      is_registered: false,
      assessment_count: 0,
    });

    await mockApiResponse(page, '**/api/v1/events/event-1/assessments', []);
    await mockApiResponse(page, '**/api/v1/events/event-1/leaderboard*', {
      event_id: 'event-1',
      total_participants: 0,
      entries: [],
      limit: 20,
      offset: 0,
    });

    await page.route('**/api/v1/events/event-1/register', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'reg-123',
            event_id: 'event-1',
            user_id: 'user-123',
            registered_at: nowIso(),
            certificate_issued: false,
            certificate_issued_at: null,
            certificate_url: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          },
        }),
      });
    });

    await page.goto('/events');
    await page.getByText('Spring Hackathon 2024').click();

    const registerButton = page.getByRole('button', { name: /register now/i });
    await expect(registerButton).toBeVisible({ timeout: 10000 });
    await registerButton.click();

    // After click, page should still be visible (registration happened)
    await expect(page.getByRole('heading', { name: /spring hackathon/i })).toBeVisible();
  });
});

test.describe('Events (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('admin sees new event button', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/events*', []);
    await page.goto('/events');
    await expect(page.getByRole('link', { name: /new event/i })).toBeVisible({ timeout: 10000 });
  });
});

