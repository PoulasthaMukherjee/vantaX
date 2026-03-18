import { test, expect } from '@playwright/test';
import { mockApiResponse } from './fixtures/auth';

/**
 * Assessment submission E2E tests.
 *
 * Tests the candidate flow for taking assessments.
 */

test.describe('Submissions (Candidate)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth for candidate user
    await mockApiResponse(page, '**/api/v1/auth/me', {
      user: {
        id: 'candidate-user-id',
        email: 'candidate@example.com',
        name: 'Test Candidate',
        email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
      user_id: 'candidate-user-id',
      name: 'Test Candidate',
      vibe_score: 75.0,
      total_points: 500,
      slug: 'test-candidate',
      is_public: false,
      is_complete: true,
      resume_file_path: null,
      resume_filename: null,
      skills: [],
    });
  });

  test('submissions page shows empty state', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/submissions*', []);

    await page.goto('/submissions');

    // Should show page heading
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10000 });
  });

  test('submissions page shows submission list', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/submissions*', [
      {
        id: 'sub-1',
        assessment_id: 'assess-1',
        event_id: null,
        github_repo_url: 'https://github.com/example/js-fundamentals',
        assessment_title: 'JavaScript Fundamentals',
        status: 'EVALUATED',
        final_score: 85,
        submitted_at: '2024-01-15T10:00:00Z',
        evaluated_at: '2024-01-15T10:05:00Z',
        event_title: null,
        created_at: '2024-01-15T10:00:00Z',
      },
      {
        id: 'sub-2',
        assessment_id: 'assess-2',
        event_id: null,
        github_repo_url: 'https://github.com/example/react-components',
        assessment_title: 'React Components',
        status: 'SCORING',
        final_score: null,
        submitted_at: '2024-01-16T14:30:00Z',
        evaluated_at: null,
        event_title: null,
        created_at: '2024-01-16T14:30:00Z',
      },
    ]);

    await page.goto('/submissions');

    // Should show submission titles
    await expect(page.getByText('JavaScript Fundamentals')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('React Components')).toBeVisible();

    // Should show status indicators
    await expect(page.getByText(/evaluated/i)).toBeVisible();
    await expect(page.getByText(/scoring/i)).toBeVisible();
  });

  test('can view submission details', async ({ page }) => {
    // Mock submissions list
    await mockApiResponse(page, '**/api/v1/submissions', [
      {
        id: 'sub-1',
        assessment_id: 'assess-1',
        event_id: null,
        github_repo_url: 'https://github.com/example/js-fundamentals',
        status: 'EVALUATED',
        final_score: 85,
        submitted_at: '2024-01-15T10:00:00Z',
        evaluated_at: '2024-01-15T10:05:00Z',
        assessment_title: 'JavaScript Fundamentals',
        event_title: null,
        created_at: '2024-01-15T10:00:00Z',
      },
    ]);

    // Mock single submission detail
    await page.route('**/api/v1/submissions/sub-1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'sub-1',
            organization_id: 'org-123',
            candidate_id: 'candidate-user-id',
            assessment_id: 'assess-1',
            event_id: null,
            github_repo_url: 'https://github.com/example/js-fundamentals',
            explanation_text: null,
            assessment_title: 'JavaScript Fundamentals',
            status: 'EVALUATED',
            commit_sha: 'abc123def456',
            analyzed_files: ['src/index.ts', 'src/utils.ts'],
            clone_started_at: '2024-01-15T10:00:10Z',
            clone_completed_at: '2024-01-15T10:01:10Z',
            job_started_at: '2024-01-15T10:01:15Z',
            job_completed_at: '2024-01-15T10:05:00Z',
            final_score: 85,
            points_awarded: 100,
            error_message: null,
            retry_count: 0,
            submitted_at: '2024-01-15T10:00:00Z',
            evaluated_at: '2024-01-15T10:05:00Z',
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:05:00Z',
            ai_score: {
              id: 'ai-1',
              submission_id: 'sub-1',
              code_correctness: 90,
              code_quality: 85,
              code_readability: 80,
              code_robustness: 75,
              reasoning_clarity: 80,
              reasoning_depth: 78,
              reasoning_structure: 82,
              overall_comment: 'Great work on closures and async patterns.',
              created_at: '2024-01-15T10:05:00Z',
            },
          },
        }),
      });
    });

    await page.goto('/submissions');

    // Click on submission to view details
    await page.getByText('JavaScript Fundamentals').click();

    // Should navigate to detail view or show modal
    await expect(page.getByText('85', { exact: true })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Assessment Submission', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/auth/me', {
      user: {
        id: 'candidate-user-id',
        email: 'candidate@example.com',
        name: 'Test Candidate',
        email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
  });

  test('assessments page shows available assessments', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/assessments*', [
      {
        id: 'assess-1',
        title: 'Python Backend',
        visibility: 'active',
        status: 'active',
        time_limit_days: null,
        tags: ['backend'],
        created_at: '2024-01-01T00:00:00Z',
        description: 'Test your Python and API skills',
        time_limit_minutes: 60,
      },
      {
        id: 'assess-2',
        title: 'Frontend React',
        visibility: 'active',
        status: 'active',
        time_limit_days: null,
        tags: ['frontend'],
        created_at: '2024-01-02T00:00:00Z',
        description: 'Build modern React applications',
        time_limit_minutes: 90,
      },
    ]);

    await page.goto('/assessments');

    // Should show assessment titles
    await expect(page.getByText('Python Backend')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Frontend React')).toBeVisible();

    // Should show duration info
    await expect(page.getByText(/60 min/i)).toBeVisible();
    await expect(page.getByText(/90 min/i)).toBeVisible();
  });

  test('can submit an assessment repo', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/assessments*', [
      {
        id: 'assess-1',
        title: 'Python Backend',
        visibility: 'active',
        status: 'active',
        time_limit_days: null,
        tags: ['backend'],
        created_at: '2024-01-01T00:00:00Z',
        description: 'Test your Python and API skills',
        time_limit_minutes: 60,
      },
    ]);

    // Mock assessment detail
    await page.route('**/api/v1/assessments/assess-1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'assess-1',
            organization_id: 'org-123',
            created_by: 'admin-123',
            title: 'Python Backend',
            problem_statement: 'Build an API',
            build_requirements: 'Use FastAPI',
            input_output_examples: 'Input X -> Output Y',
            acceptance_criteria: 'Meets requirements',
            constraints: 'Keep it simple',
            submission_instructions: 'Submit a GitHub repo',
            description: 'Test your Python and API skills',
            starter_repo_url: null,
            rubric_url: null,
            time_limit_minutes: 60,
            starter_code: null,
            helpful_docs: null,
            visibility: 'active',
            evaluation_mode: 'ai_only',
            status: 'active',
            time_limit_days: null,
            tags: ['backend'],
            weight_correctness: 0.3,
            weight_quality: 0.2,
            weight_readability: 0.1,
            weight_robustness: 0.1,
            weight_clarity: 0.1,
            weight_depth: 0.1,
            weight_structure: 0.1,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }),
      });
    });

    // Mock submission create
    await page.route('**/api/v1/submissions', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'new-sub-123',
            organization_id: 'org-123',
            candidate_id: 'candidate-user-id',
            assessment_id: 'assess-1',
            event_id: null,
            github_repo_url: 'https://github.com/example/python-backend',
            explanation_text: null,
            status: 'QUEUED',
            commit_sha: null,
            analyzed_files: null,
            clone_started_at: null,
            clone_completed_at: null,
            job_started_at: null,
            job_completed_at: null,
            final_score: null,
            points_awarded: 0,
            error_message: null,
            retry_count: 0,
            submitted_at: new Date().toISOString(),
            evaluated_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    // Mock submission detail (landing page after redirect)
    await page.route('**/api/v1/submissions/new-sub-123', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'new-sub-123',
            organization_id: 'org-123',
            candidate_id: 'candidate-user-id',
            assessment_id: 'assess-1',
            event_id: null,
            github_repo_url: 'https://github.com/example/python-backend',
            explanation_text: null,
            status: 'QUEUED',
            commit_sha: null,
            analyzed_files: null,
            clone_started_at: null,
            clone_completed_at: null,
            job_started_at: null,
            job_completed_at: null,
            final_score: null,
            points_awarded: 0,
            error_message: null,
            retry_count: 0,
            submitted_at: new Date().toISOString(),
            evaluated_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assessment_title: 'Python Backend',
            ai_score: null,
          },
        }),
      });
    });

    await page.goto('/assessments');

    await page.getByText('Python Backend').click();
    await expect(page.getByRole('heading', { name: /python backend/i })).toBeVisible({ timeout: 10000 });

    await page.getByLabel(/repository url/i).fill('https://github.com/example/python-backend');
    await page.getByRole('button', { name: /submit assessment/i }).click();

    await expect(page).toHaveURL(/\/submissions\/new-sub-123/, { timeout: 10000 });
  });
});
