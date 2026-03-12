interface CompanyGenerationContext {
  companyName: string;
  companySize?: string | null;
  industry?: string | null;
  rolesHiringFor: string[];
  numberRoles?: string | null;
  techStack?: string | null;
  skillsToEvaluate: string[];
  problemContext: string;
  strongSolutionCriteria?: string | null;
  suggestChallenge?: boolean;
}

export interface AssessmentDraft {
  problemStatement: {
    title: string;
    summary: string;
    candidatePrompt: string;
  };
  round1: {
    title: string;
    objective: string;
    task: string;
  };
  round2: {
    title: string;
    objective: string;
    task: string;
  };
  round3: {
    title: string;
    objective: string;
    task: string;
  };
  evaluationCriteria: string[];
  deliverables: string[];
  constraints: string[];
  reviewNotes: string[];
}

const broadOutcomeSignals = [
  'user experience',
  'ux',
  'friction',
  'drop-off',
  'dropoff',
  'workflow',
  'onboarding',
  'conversion',
  'funnel',
  'review flow',
];

function getPrimaryRole(context: CompanyGenerationContext) {
  return context.rolesHiringFor[0] || 'Engineering';
}

function summarizeSkills(context: CompanyGenerationContext) {
  return context.skillsToEvaluate.join(', ') || 'problem solving';
}

function isBroadOutcomeContext(context: CompanyGenerationContext) {
  const normalized = context.problemContext.toLowerCase();
  return broadOutcomeSignals.some((signal) => normalized.includes(signal));
}

function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function mentionsInfraRequirement(context: CompanyGenerationContext) {
  const normalized = `${context.problemContext} ${context.techStack || ''}`.toLowerCase();
  return ['docker', 'kubernetes', 'openapi', 'swagger', 'microservice', 'container'].some((term) => normalized.includes(term));
}

function sanitizeRoundTask(task: string, context: CompanyGenerationContext, round: 'round1' | 'round2' | 'round3') {
  let next = task.trim();

  if (round === 'round1') {
    next = next
      .replace(/Implement a FastAPI GET endpoint/gi, 'Implement a pure Python function')
      .replace(/Create a FastAPI application with/gi, 'Create a small pure Python exercise with')
      .replace(/endpoint\s+`GET\s+\/[^\s`]+`/gi, 'function')
      .replace(/request models?,?\s*/gi, '')
      .replace(/routing,?\s*/gi, '');
  }

  if (round === 'round2' && !mentionsInfraRequirement(context)) {
    next = next
      .replace(/,\s*a Dockerfile\s*\(or docker.?compose\)/gi, '')
      .replace(/,\s*Dockerfile\s*\(or docker.?compose\)/gi, '')
      .replace(/and a Dockerfile\s*\(or docker.?compose\)/gi, 'and a short README with local run instructions')
      .replace(/Provide an OpenAPI spec,?\s*/gi, 'Provide a short API contract in markdown, ')
      .replace(/OpenAPI spec/gi, 'API contract note')
      .replace(/Swagger/gi, 'API contract');
  }

  if (round === 'round3') {
    next = next.replace(/No new code should be written;?/gi, 'No new code should be written in this round;');
  }

  return next;
}

function sanitizeList(items: string[], maxItems: number, context: CompanyGenerationContext) {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => mentionsInfraRequirement(context) || (!/docker|docker-compose|openapi|swagger/i.test(item)))
    .slice(0, maxItems);
}

function harmonizeRound2Task(task: string) {
  let next = task;

  if (/POST\s+\/shortlist/i.test(next) && /GET\s+\/shortlist\/\{job_id\}/i.test(next) && !/"job_id"\s*:/i.test(next)) {
    next = next.replace(
      /POST\s+\/shortlist`\s+accepts JSON body\s+\{\s*"candidates"/i,
      'POST /shortlist` accepts JSON body `{ "job_id": string, "candidates"',
    );
    next = next.replace(
      /returns the last generated shortlist for a given job identifier/i,
      'returns the latest generated shortlist for a given job identifier',
    );
  }

  return next;
}

function harmonizeRound1Task(task: string, context: CompanyGenerationContext) {
  const normalized = task.trim();
  if (/fastapi|endpoint|route|uvicorn/i.test(normalized)) {
    const role = getPrimaryRole(context);
    return `Implement a pure Python helper for ${role} screening that operates on an in-memory list of candidate/application objects. Keep it small, testable, and directly tied to the company context. Include at least two unit tests covering a normal case and one edge case.`;
  }

  if (/application_id/i.test(normalized) && !/application_id\s*\(/i.test(normalized) && !/application_id[`'\s:]/i.test(normalized)) {
    return normalized.replace(
      /Each dict contains\s+/i,
      'Each dict contains `application_id` (int), ',
    );
  }

  if (/candidate_id/i.test(normalized) && !/candidate_id\s*\(/i.test(normalized) && !/candidate_id[`'\s:]/i.test(normalized)) {
    return normalized.replace(
      /Each dict contains\s+/i,
      'Each dict contains `candidate_id` (int), ',
    );
  }

  return normalized;
}

function harmonizeConstraints(constraints: string[]) {
  return constraints.map((constraint) => {
    if (/standard library\s*\+\s*fastapi only/i.test(constraint)) {
      return 'Use Python and FastAPI. Keep dependencies minimal and justified.';
    }
    if (/pytest or similar/i.test(constraint)) {
      return 'Include at least two runnable tests for the core logic.';
    }
    return constraint;
  });
}

function harmonizeReviewNotes(reviewNotes: string[], constraints: string[]) {
  const keepsDependenciesMinimal = constraints.some((constraint) => /minimal and justified/i.test(constraint));
  return reviewNotes.map((note) => {
    if (/pytest or similar/i.test(note) && keepsDependenciesMinimal) {
      return 'Confirm that the candidate included runnable tests for the core logic and documented how to execute them.';
    }
    return note;
  });
}

function buildRound1Task(context: CompanyGenerationContext) {
  const role = getPrimaryRole(context);
  const skills = summarizeSkills(context);
  return `Give candidates a short, time-boxed execution exercise directly tied to the company context. It should validate baseline ${skills} readiness for ${role} in 15-30 minutes without turning into a generic puzzle or a discussion-only round.`;
}

function buildRound2Task(context: CompanyGenerationContext) {
  const criteria = context.strongSolutionCriteria || 'clear reasoning, clean implementation, and defensible tradeoffs';
  return `Use the stated company context as the main build task. Round 2 must be meaningfully deeper than Round 1 and should produce a realistic solution that demonstrates ${criteria}. Keep it to one core workflow or service slice rather than a full platform build.`;
}

function buildRound3Task(context: CompanyGenerationContext) {
  return `Finalists present the full picture of their Round 2 solution: the business problem they solved, the architecture they chose, the tradeoffs they made, what they would improve next, and how the solution would evolve in production at ${context.companyName}. Do not ask for a fresh implementation in this round.`;
}

function normalizeDraft(draft: AssessmentDraft, context: CompanyGenerationContext): AssessmentDraft {
  const round1Task = harmonizeRound1Task(
    sanitizeRoundTask(draft.round1.task.trim() || buildRound1Task(context), context, 'round1'),
    context,
  );
  const round2Task = harmonizeRound2Task(
    sanitizeRoundTask(draft.round2.task.trim() || buildRound2Task(context), context, 'round2'),
  );
  const constraints = harmonizeConstraints(sanitizeList(draft.constraints, 5, context));
  const reviewNotes = harmonizeReviewNotes(sanitizeList(draft.reviewNotes, 4, context), constraints);

  return {
    ...draft,
    problemStatement: {
      title: normalizeSpacing(draft.problemStatement.title),
      summary: normalizeSpacing(draft.problemStatement.summary),
      candidatePrompt: draft.problemStatement.candidatePrompt.trim(),
    },
    round1: {
      title: 'Skill Screening',
      objective: normalizeSpacing(draft.round1.objective || `Quickly validate core readiness for ${getPrimaryRole(context)}.`),
      task: round1Task,
    },
    round2: {
      title: 'Problem Build',
      objective: normalizeSpacing(draft.round2.objective || 'Test deeper execution on the company problem.'),
      task: round2Task,
    },
    round3: {
      title: 'Solution Presentation',
      objective: normalizeSpacing(draft.round3.objective || 'Validate communication quality, design judgment, and tradeoffs.'),
      task: /present|presentation|walk through|walkthrough|explain/i.test(draft.round3.task)
        ? sanitizeRoundTask(draft.round3.task.trim(), context, 'round3')
        : buildRound3Task(context),
    },
    evaluationCriteria: sanitizeList(draft.evaluationCriteria, 6, context),
    deliverables: sanitizeList(draft.deliverables, 4, context),
    constraints,
    reviewNotes,
  };
}

function makeTitle(context: CompanyGenerationContext) {
  const role = getPrimaryRole(context);
  const industry = context.industry ? `${context.industry} ` : '';
  return `${industry}${role} Hiring Audition`;
}

function buildFallbackDraft(context: CompanyGenerationContext): AssessmentDraft {
  const role = context.rolesHiringFor.join(', ') || 'engineering';
  const stack = context.techStack || 'the company stack';
  const skills = summarizeSkills(context);
  const criteria = context.strongSolutionCriteria || 'clear reasoning, clean implementation, and defensible tradeoffs';

  return {
    problemStatement: {
      title: makeTitle(context),
      summary: `Design a hiring audition for ${context.companyName} focused on ${role}. Candidates should work from a real business context and demonstrate practical judgment on ${stack}.`,
      candidatePrompt: `Company context: ${context.problemContext}\n\nBuild a solution proposal and implementation approach that reflects the constraints, priorities, and tradeoffs in this scenario.`,
    },
    round1: {
      title: 'Skill Screening',
      objective: `Quickly validate core readiness for ${role}.`,
      task: `Create a short, time-boxed challenge that tests the essentials of ${skills}. Keep it narrow enough to filter for baseline execution without turning it into a generic coding puzzle.`,
    },
    round2: {
      title: 'Problem Build',
      objective: 'Test deeper execution on the company problem.',
      task: `Use the company context to define the main build task. The candidate should produce a practical solution that reflects the real-world constraints in the brief and demonstrates ${criteria}.`,
    },
    round3: {
      title: 'Solution Presentation',
      objective: 'Validate communication quality, design judgment, and tradeoffs.',
      task: 'Ask finalists to present their Round 2 solution, explain key decisions, justify tradeoffs, and outline what they would improve next if they joined the team.',
    },
    evaluationCriteria: [
      'Execution quality against the brief',
      'Problem understanding and constraint handling',
      'Logical structuring and prioritization',
      'Practical feasibility in a real environment',
      'Communication clarity and defensibility',
    ],
    deliverables: [
      'Working code or implementation artifact',
      'Short explanation of approach and tradeoffs',
      'AI usage disclosure, if applicable',
      'Presentation notes for finalist round',
    ],
    constraints: [
      'Keep the audition scoped for early-career candidates',
      'Avoid proprietary or confidential dependencies',
      'Focus on realism over trick questions',
      'Use the role and stack context provided by the company',
    ],
    reviewNotes: [
      'Tune challenge difficulty before publishing',
      'Confirm expected stack and candidate level with the company',
      'Ensure Round 1 filters without duplicating Round 2',
    ],
  };
}

function buildPrompt(context: CompanyGenerationContext) {
  const broadOutcomeNote = isBroadOutcomeContext(context)
    ? 'Yes. The context is broad and outcome-based. Stay close to the stated friction and avoid inventing a new subsystem unless the context explicitly names it.'
    : 'No. The context is specific enough to derive a concrete build task directly.';

  return [
    'Create a realistic VantaX hiring audition draft.',
    'Non-negotiable rules:',
    '1. Treat the company problem context as the source of truth.',
    '2. Infer conservatively. Do not invent a new product priority or subsystem unless it is clearly implied.',
    '3. Keep the challenge role-aligned. For backend roles, avoid frontend-heavy work unless explicitly requested. For frontend roles, avoid backend-heavy work unless explicitly requested.',
    '4. Use the fixed VantaX structure: Round 1 = Skill Screening, Round 2 = Problem Build, Round 3 = Solution Presentation.',
    '5. Round 1 must be a short execution screen, not a discussion-only round. Keep it light and narrow. Prefer pure logic/function work over framework setup.',
    '6. Round 2 must be the main build task, clearly more substantial than Round 1, and stay directly tied to the stated company friction.',
    '7. Round 3 must only be a presentation and full-picture tradeoff review of the Round 2 work. Do not add new implementation work in Round 3.',
    '8. Keep the full audition realistic for an early-career candidate and scoped to about 2 hours of build work, not a multi-day project.',
    '9. Round 2 should focus on one core workflow or service slice, not a full platform build. At most ask for one main endpoint/service plus supporting logic.',
    '10. Do not require Docker, deployment, infrastructure setup, or formal OpenAPI/Swagger specs unless the company context explicitly asks for them.',
    '11. Deliverables should stay lightweight: working code, a short README, and a brief tradeoff note are usually enough.',
    '12. Evaluation criteria and deliverables must align with the requested role, stack, and skills only.',
    '13. Prefer workflow, product, or system bottlenecks directly implied by the context over speculative platform redesigns.',
    '14. Progression rule: Round 1 checks essentials, Round 2 proves real execution, Round 3 shows the candidate can explain the full picture.',
    '15. Round 1 should usually avoid framework bootstrapping. Save FastAPI, database wiring, and endpoint implementation for Round 2 unless the company explicitly asks otherwise.',
    `Company: ${context.companyName}`,
    `Company size: ${context.companySize || 'Not provided'}`,
    `Industry: ${context.industry || 'Not provided'}`,
    `Roles hiring for: ${context.rolesHiringFor.join(', ')}`,
    `Number of roles: ${context.numberRoles || 'Not provided'}`,
    `Tech stack: ${context.techStack || 'Not provided'}`,
    `Skills to evaluate: ${context.skillsToEvaluate.join(', ')}`,
    `Suggest challenge from role only: ${context.suggestChallenge ? 'Yes' : 'No'}`,
    `Strong solution should demonstrate: ${context.strongSolutionCriteria || 'Not provided'}`,
    `Broad outcome context: ${broadOutcomeNote}`,
    `Business/problem context: ${context.problemContext}`,
  ].join('\n');
}

const draftSchema = {
  name: 'assessment_draft',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['problemStatement', 'round1', 'round2', 'round3', 'evaluationCriteria', 'deliverables', 'constraints', 'reviewNotes'],
    properties: {
      problemStatement: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'candidatePrompt'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          candidatePrompt: { type: 'string' },
        },
      },
      round1: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'objective', 'task'],
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          task: { type: 'string' },
        },
      },
      round2: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'objective', 'task'],
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          task: { type: 'string' },
        },
      },
      round3: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'objective', 'task'],
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          task: { type: 'string' },
        },
      },
      evaluationCriteria: { type: 'array', items: { type: 'string' } },
      deliverables: { type: 'array', items: { type: 'string' } },
      constraints: { type: 'array', items: { type: 'string' } },
      reviewNotes: { type: 'array', items: { type: 'string' } },
    },
  },
};

async function generateViaGroq(context: CompanyGenerationContext): Promise<AssessmentDraft> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You write high-signal hiring audition drafts for engineering hiring. Output only valid JSON matching the provided schema. Keep it practical, scoped, role-specific, and grounded in the company context. Avoid generic LeetCode-style prompts. Infer conservatively from the stated context and keep the VantaX round structure intact.',
        },
        {
          role: 'user',
          content: buildPrompt(context),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: draftSchema,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq generation failed: ${errorText}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq generation returned no content');
  }

  return normalizeDraft(JSON.parse(content) as AssessmentDraft, context);
}

export async function generateAssessmentDraft(context: CompanyGenerationContext): Promise<AssessmentDraft> {
  try {
    return await generateViaGroq(context);
  } catch (error) {
    console.error('AI generation fallback triggered:', error);
    return normalizeDraft(buildFallbackDraft(context), context);
  }
}
