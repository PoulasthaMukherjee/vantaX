/**
 * Assessment create/edit form page (admin only).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Sparkles, X } from 'lucide-react';
import { Layout } from '../components/layout';
import { useAuth } from '../contexts/AuthContext';
import { useAssessment, useCreateAssessment, useUpdateAssessment } from '../hooks/useAssessments';
import { assessmentsAPI } from '../lib/api';
import type { AssessmentCreateInput } from '../types/api';

const DEFAULT_WEIGHTS = {
  weight_correctness: 25,
  weight_quality: 20,
  weight_readability: 15,
  weight_robustness: 10,
  weight_clarity: 10,
  weight_depth: 10,
  weight_structure: 10,
};

export default function AssessmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isEdit = !!id;

  const { data: existingAssessment, isLoading: loadingAssessment } = useAssessment(id || '');
  const createMutation = useCreateAssessment();
  const updateMutation = useUpdateAssessment();

  const [form, setForm] = useState({
    title: '',
    problem_statement: '',
    build_requirements: '',
    input_output_examples: '',
    acceptance_criteria: '',
    constraints: '',
    submission_instructions: '',
    starter_code: '',
    helpful_docs: '',
    visibility: 'active' as 'public' | 'active' | 'invite_only' | 'hidden',
    evaluation_mode: 'ai_only' as 'ai_only' | 'hybrid' | 'manual_only',
    status: 'draft' as 'draft' | 'published' | 'archived',
    time_limit_days: '',
    tags: '',
    file_patterns: '',
    ...DEFAULT_WEIGHTS,
  });
  const [error, setError] = useState<string | null>(null);

  // AI Generation state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateInput, setGenerateInput] = useState({
    description: '',
    difficulty: 'intermediate' as 'easy' | 'intermediate' | 'hard',
    role: '',
    time_limit_days: 3,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Populate form for edit
  useEffect(() => {
    if (existingAssessment) {
      setForm({
        title: existingAssessment.title,
        problem_statement: existingAssessment.problem_statement || '',
        build_requirements: existingAssessment.build_requirements || '',
        input_output_examples: existingAssessment.input_output_examples || '',
        acceptance_criteria: existingAssessment.acceptance_criteria || '',
        constraints: existingAssessment.constraints || '',
        submission_instructions: existingAssessment.submission_instructions || '',
        starter_code: existingAssessment.starter_code || '',
        helpful_docs: existingAssessment.helpful_docs || '',
        visibility: existingAssessment.visibility,
        evaluation_mode: existingAssessment.evaluation_mode,
        status: existingAssessment.status as 'draft' | 'published' | 'archived',
        time_limit_days: existingAssessment.time_limit_days?.toString() || '',
        tags: existingAssessment.tags?.join(', ') || '',
        file_patterns: existingAssessment.file_patterns?.join('\n') || '',
        weight_correctness: existingAssessment.weight_correctness,
        weight_quality: existingAssessment.weight_quality,
        weight_readability: existingAssessment.weight_readability,
        weight_robustness: existingAssessment.weight_robustness,
        weight_clarity: existingAssessment.weight_clarity,
        weight_depth: existingAssessment.weight_depth,
        weight_structure: existingAssessment.weight_structure,
      });
    }
  }, [existingAssessment]);

  // Handle AI generation
  const handleGenerate = async () => {
    if (!generateInput.description.trim()) {
      setGenerateError('Please enter a description');
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const result = await assessmentsAPI.generate({
        description: generateInput.description,
        difficulty: generateInput.difficulty,
        role: generateInput.role || undefined,
        time_limit_days: generateInput.time_limit_days,
      });

      // Populate form with generated content
      setForm((prev) => ({
        ...prev,
        title: result.title,
        problem_statement: result.problem_statement,
        build_requirements: result.build_requirements,
        input_output_examples: result.input_output_examples,
        acceptance_criteria: result.acceptance_criteria,
        constraints: result.constraints,
        submission_instructions: result.submission_instructions,
        starter_code: result.starter_code || '',
        helpful_docs: result.helpful_docs || '',
        tags: result.suggested_tags?.join(', ') || '',
        time_limit_days: generateInput.time_limit_days.toString(),
      }));

      setShowGenerateModal(false);
      setGenerateInput({ description: '', difficulty: 'intermediate', role: '', time_limit_days: 3 });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate assessment');
    } finally {
      setIsGenerating(false);
    }
  };

  // Redirect non-admins
  if (!isAdmin) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600 mt-2">Only admins can create or edit assessments.</p>
        </div>
      </Layout>
    );
  }

  if (isEdit && loadingAssessment) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </Layout>
    );
  }

  const weightsSum =
    form.weight_correctness +
    form.weight_quality +
    form.weight_readability +
    form.weight_robustness +
    form.weight_clarity +
    form.weight_depth +
    form.weight_structure;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (weightsSum !== 100) {
      setError(`Rubric weights must sum to 100 (currently ${weightsSum})`);
      return;
    }

    const payload: AssessmentCreateInput = {
      title: form.title,
      problem_statement: form.problem_statement,
      build_requirements: form.build_requirements,
      input_output_examples: form.input_output_examples,
      acceptance_criteria: form.acceptance_criteria,
      constraints: form.constraints,
      submission_instructions: form.submission_instructions,
      starter_code: form.starter_code || undefined,
      helpful_docs: form.helpful_docs || undefined,
      visibility: form.visibility,
      evaluation_mode: form.evaluation_mode,
      status: form.status,
      time_limit_days: form.time_limit_days ? parseInt(form.time_limit_days) : undefined,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      file_patterns: form.file_patterns ? form.file_patterns.split('\n').map((p) => p.trim()).filter(Boolean) : undefined,
      weight_correctness: form.weight_correctness,
      weight_quality: form.weight_quality,
      weight_readability: form.weight_readability,
      weight_robustness: form.weight_robustness,
      weight_clarity: form.weight_clarity,
      weight_depth: form.weight_depth,
      weight_structure: form.weight_structure,
    };

    try {
      if (isEdit && id) {
        await updateMutation.mutateAsync({ id, data: payload });
        navigate(`/assessments/${id}`);
      } else {
        const assessment = await createMutation.mutateAsync(payload);
        navigate(`/assessments/${assessment.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assessment');
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <Link
        to={isEdit ? `/assessments/${id}` : '/assessments'}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {isEdit ? 'Back to assessment' : 'Back to assessments'}
      </Link>

      <div className="max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Assessment' : 'New Assessment'}
          </h1>
          {!isEdit && (
            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label htmlFor="visibility" className="block text-sm font-medium text-gray-700 mb-1">
                  Visibility
                </label>
                <select
                  id="visibility"
                  value={form.visibility}
                  onChange={(e) => setForm({ ...form, visibility: e.target.value as typeof form.visibility })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="public">Public</option>
                  <option value="active">Active</option>
                  <option value="invite_only">Invite Only</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>

              <div>
                <label htmlFor="evaluation_mode" className="block text-sm font-medium text-gray-700 mb-1">
                  Evaluation Mode
                </label>
                <select
                  id="evaluation_mode"
                  value={form.evaluation_mode}
                  onChange={(e) => setForm({ ...form, evaluation_mode: e.target.value as typeof form.evaluation_mode })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="ai_only">AI Only</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="manual_only">Manual Only</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="time_limit_days" className="block text-sm font-medium text-gray-700 mb-1">
                  Time Limit (days)
                </label>
                <input
                  type="number"
                  id="time_limit_days"
                  value={form.time_limit_days}
                  onChange={(e) => setForm({ ...form, time_limit_days: e.target.value })}
                  min={1}
                  max={365}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="python, api, backend"
                />
              </div>
            </div>
          </div>

          {/* Problem Definition */}
          <div className="card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Problem Definition</h2>

            <div>
              <label htmlFor="problem_statement" className="block text-sm font-medium text-gray-700 mb-1">
                Problem Statement <span className="text-red-500">*</span>
              </label>
              <textarea
                id="problem_statement"
                value={form.problem_statement}
                onChange={(e) => setForm({ ...form, problem_statement: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Describe the problem candidates need to solve..."
                required
              />
            </div>

            <div>
              <label htmlFor="build_requirements" className="block text-sm font-medium text-gray-700 mb-1">
                Build Requirements <span className="text-red-500">*</span>
              </label>
              <textarea
                id="build_requirements"
                value={form.build_requirements}
                onChange={(e) => setForm({ ...form, build_requirements: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="What should the candidate build? Technologies, frameworks, etc."
                required
              />
            </div>

            <div>
              <label htmlFor="input_output_examples" className="block text-sm font-medium text-gray-700 mb-1">
                Input/Output Examples <span className="text-red-500">*</span>
              </label>
              <textarea
                id="input_output_examples"
                value={form.input_output_examples}
                onChange={(e) => setForm({ ...form, input_output_examples: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                placeholder="Example inputs and expected outputs..."
                required
              />
            </div>

            <div>
              <label htmlFor="acceptance_criteria" className="block text-sm font-medium text-gray-700 mb-1">
                Acceptance Criteria <span className="text-red-500">*</span>
              </label>
              <textarea
                id="acceptance_criteria"
                value={form.acceptance_criteria}
                onChange={(e) => setForm({ ...form, acceptance_criteria: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="What defines a successful submission?"
                required
              />
            </div>

            <div>
              <label htmlFor="constraints" className="block text-sm font-medium text-gray-700 mb-1">
                Constraints <span className="text-red-500">*</span>
              </label>
              <textarea
                id="constraints"
                value={form.constraints}
                onChange={(e) => setForm({ ...form, constraints: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Any constraints or limitations..."
                required
              />
            </div>

            <div>
              <label htmlFor="submission_instructions" className="block text-sm font-medium text-gray-700 mb-1">
                Submission Instructions <span className="text-red-500">*</span>
              </label>
              <textarea
                id="submission_instructions"
                value={form.submission_instructions}
                onChange={(e) => setForm({ ...form, submission_instructions: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="How should candidates submit their work?"
                required
              />
            </div>
          </div>

          {/* Optional Helpers */}
          <div className="card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Optional Resources</h2>

            <div>
              <label htmlFor="starter_code" className="block text-sm font-medium text-gray-700 mb-1">
                Starter Code
              </label>
              <textarea
                id="starter_code"
                value={form.starter_code}
                onChange={(e) => setForm({ ...form, starter_code: e.target.value })}
                rows={6}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                placeholder="Optional boilerplate or starter code..."
              />
            </div>

            <div>
              <label htmlFor="helpful_docs" className="block text-sm font-medium text-gray-700 mb-1">
                Helpful Documentation
              </label>
              <textarea
                id="helpful_docs"
                value={form.helpful_docs}
                onChange={(e) => setForm({ ...form, helpful_docs: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Links to relevant documentation, tutorials, etc."
              />
            </div>
          </div>

          {/* File Filtering */}
          <div className="card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">File Filtering</h2>
            <p className="text-sm text-gray-600">
              Specify which files to analyze from submissions. Leave empty to analyze all common code files.
            </p>

            <div>
              <label htmlFor="file_patterns" className="block text-sm font-medium text-gray-700 mb-1">
                File Patterns (glob syntax)
              </label>
              <textarea
                id="file_patterns"
                value={form.file_patterns}
                onChange={(e) => setForm({ ...form, file_patterns: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                placeholder="*.py&#10;src/**/*.ts&#10;!**/test/**&#10;!**/__pycache__/**"
              />
              <p className="text-xs text-gray-500 mt-1">
                One pattern per line. Prefix with <code className="bg-gray-100 px-1 rounded">!</code> to exclude.
                Examples: <code className="bg-gray-100 px-1 rounded">*.py</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">src/**/*.ts</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">!**/test/**</code>
              </p>
            </div>
          </div>

          {/* Rubric Weights */}
          <div className="card p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Rubric Weights</h2>
              <span className={`text-sm font-medium ${weightsSum === 100 ? 'text-green-600' : 'text-red-600'}`}>
                Total: {weightsSum}/100
              </span>
            </div>

            <p className="text-sm text-gray-600">
              Adjust the weights for each scoring dimension. Must sum to 100.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'weight_correctness', label: 'Correctness', desc: 'Does it work correctly?' },
                { key: 'weight_quality', label: 'Code Quality', desc: 'Best practices, clean code' },
                { key: 'weight_readability', label: 'Readability', desc: 'Easy to read and understand' },
                { key: 'weight_robustness', label: 'Robustness', desc: 'Error handling, edge cases' },
                { key: 'weight_clarity', label: 'Reasoning Clarity', desc: 'Clear explanation' },
                { key: 'weight_depth', label: 'Reasoning Depth', desc: 'Thorough analysis' },
                { key: 'weight_structure', label: 'Structure', desc: 'Well-organized solution' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center gap-4">
                  <div className="flex-1">
                    <label htmlFor={key} className="block text-sm font-medium text-gray-700">
                      {label}
                    </label>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                  <input
                    type="number"
                    id={key}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
                    min={0}
                    max={100}
                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <Link
              to={isEdit ? `/assessments/${id}` : '/assessments'}
              className="btn btn-ghost"
            >
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEdit ? 'Save Changes' : 'Create Assessment'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* AI Generation Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                Generate Assessment with AI
              </h2>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Describe the assessment you want to create
                </label>
                <textarea
                  value={generateInput.description}
                  onChange={(e) => setGenerateInput({ ...generateInput, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., Build a REST API for a todo list app with authentication, CRUD operations, and PostgreSQL database"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Difficulty
                  </label>
                  <select
                    value={generateInput.difficulty}
                    onChange={(e) => setGenerateInput({ ...generateInput, difficulty: e.target.value as 'easy' | 'intermediate' | 'hard' })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time Limit (days)
                  </label>
                  <input
                    type="number"
                    value={generateInput.time_limit_days}
                    onChange={(e) => setGenerateInput({ ...generateInput, time_limit_days: parseInt(e.target.value) || 3 })}
                    min={1}
                    max={30}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Role (optional)
                </label>
                <input
                  type="text"
                  value={generateInput.role}
                  onChange={(e) => setGenerateInput({ ...generateInput, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., Backend Engineer, Full-Stack Developer"
                />
              </div>

              {generateError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {generateError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="btn btn-ghost"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !generateInput.description.trim()}
                className="btn btn-primary"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
