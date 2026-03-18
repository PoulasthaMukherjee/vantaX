"""
Tests for scoring worker tasks.

Covers:
- File filtering (file_filter.py)
- LLM scoring (scoring.py)
- Score submission pipeline (score_submission.py)
"""

import json
import os
import tempfile
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.models.assessment import Assessment
from app.models.enums import AssessmentStatus, AssessmentVisibility, EvaluationMode
from app.worker.tasks.file_filter import (
    ALLOWED_EXTENSIONS,
    IGNORED_DIRS,
    MAX_FILE_COUNT,
    MAX_FILE_SIZE,
    filter_code_files,
    get_file_summary,
)
from app.worker.tasks.scoring import (
    MAX_CONTEXT_CHARS,
    build_scoring_prompt,
    parse_scores,
)

# =============================================================================
# File Filter Tests
# =============================================================================


class TestFileFilter:
    """Tests for file_filter.py functions."""

    def test_filter_code_files_basic(self, tmp_path):
        """Test basic file filtering with valid code files."""
        # Create test files
        (tmp_path / "main.py").write_text("print('hello')")
        (tmp_path / "app.js").write_text("console.log('hello')")
        (tmp_path / "README.md").write_text("# Readme")  # Should be ignored

        files = filter_code_files(str(tmp_path))

        assert len(files) == 2
        paths = [f["path"] for f in files]
        assert "main.py" in paths
        assert "app.js" in paths
        assert "README.md" not in paths

    def test_filter_code_files_ignores_node_modules(self, tmp_path):
        """Test that node_modules directory is ignored."""
        (tmp_path / "index.js").write_text("const x = 1;")
        node_modules = tmp_path / "node_modules"
        node_modules.mkdir()
        (node_modules / "package.js").write_text("module.exports = {};")

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["path"] == "index.js"

    def test_filter_code_files_ignores_git_directory(self, tmp_path):
        """Test that .git directory is ignored."""
        (tmp_path / "main.py").write_text("x = 1")
        git_dir = tmp_path / ".git"
        git_dir.mkdir()
        (git_dir / "config.py").write_text("config = {}")

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["path"] == "main.py"

    def test_filter_code_files_ignores_minified(self, tmp_path):
        """Test that minified files are ignored."""
        (tmp_path / "app.js").write_text("const x = 1;")
        (tmp_path / "app.min.js").write_text("const x=1;")
        (tmp_path / "bundle.min.js").write_text("bundled")

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["path"] == "app.js"

    def test_filter_code_files_respects_size_limit(self, tmp_path):
        """Test that files over MAX_FILE_SIZE are ignored."""
        (tmp_path / "small.py").write_text("x = 1")
        (tmp_path / "large.py").write_text("x" * (MAX_FILE_SIZE + 1))

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["path"] == "small.py"

    def test_filter_code_files_respects_count_limit(self, tmp_path):
        """Test that no more than MAX_FILE_COUNT files are returned."""
        # Create more files than the limit
        for i in range(MAX_FILE_COUNT + 10):
            (tmp_path / f"file{i}.py").write_text(f"x = {i}")

        files = filter_code_files(str(tmp_path))

        assert len(files) == MAX_FILE_COUNT

    def test_filter_code_files_ignores_empty_files(self, tmp_path):
        """Test that empty files are ignored."""
        (tmp_path / "empty.py").write_text("")
        (tmp_path / "content.py").write_text("x = 1")

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["path"] == "content.py"

    def test_filter_code_files_nested_directories(self, tmp_path):
        """Test filtering in nested directory structure."""
        src = tmp_path / "src"
        src.mkdir()
        (src / "main.py").write_text("main")

        lib = src / "lib"
        lib.mkdir()
        (lib / "utils.py").write_text("utils")

        files = filter_code_files(str(tmp_path))

        assert len(files) == 2
        paths = [f["path"] for f in files]
        assert "src/main.py" in paths
        assert "src/lib/utils.py" in paths

    def test_filter_code_files_sorted_by_path(self, tmp_path):
        """Test that files are sorted by path."""
        (tmp_path / "z_last.py").write_text("z")
        (tmp_path / "a_first.py").write_text("a")
        (tmp_path / "m_middle.py").write_text("m")

        files = filter_code_files(str(tmp_path))

        paths = [f["path"] for f in files]
        assert paths == ["a_first.py", "m_middle.py", "z_last.py"]

    def test_filter_code_files_includes_content(self, tmp_path):
        """Test that file content is included correctly."""
        content = "def hello():\n    print('world')"
        (tmp_path / "main.py").write_text(content)

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["content"] == content
        assert files[0]["size"] == len(content)

    def test_filter_code_files_all_extensions(self, tmp_path):
        """Test that all allowed extensions are recognized."""
        for ext in ALLOWED_EXTENSIONS:
            filename = f"test{ext}"
            (tmp_path / filename).write_text(f"content for {ext}")

        files = filter_code_files(str(tmp_path))

        assert len(files) == len(ALLOWED_EXTENSIONS)

    def test_filter_code_files_ignores_hidden_dirs(self, tmp_path):
        """Test that hidden directories (starting with .) are ignored."""
        (tmp_path / "main.py").write_text("visible")
        hidden = tmp_path / ".hidden"
        hidden.mkdir()
        (hidden / "secret.py").write_text("hidden")

        files = filter_code_files(str(tmp_path))

        assert len(files) == 1
        assert files[0]["path"] == "main.py"


class TestGetFileSummary:
    """Tests for get_file_summary function."""

    def test_get_file_summary_basic(self):
        """Test basic summary generation."""
        files = [
            {"path": "main.py", "content": "x = 1", "size": 100},
            {"path": "app.py", "content": "y = 2", "size": 200},
            {"path": "utils.js", "content": "z", "size": 50},
        ]

        summary = get_file_summary(files)

        assert summary["file_count"] == 3
        assert summary["total_size"] == 350
        assert summary["extensions"] == {".py": 2, ".js": 1}

    def test_get_file_summary_empty(self):
        """Test summary with empty file list."""
        summary = get_file_summary([])

        assert summary["file_count"] == 0
        assert summary["total_size"] == 0
        assert summary["extensions"] == {}


# =============================================================================
# Scoring Module Tests
# =============================================================================


class TestBuildScoringPrompt:
    """Tests for build_scoring_prompt function."""

    @pytest.fixture
    def mock_assessment(self):
        """Create a mock assessment for testing."""
        assessment = MagicMock(spec=Assessment)
        assessment.problem_statement = "Build a REST API"
        assessment.build_requirements = "Use FastAPI and Python"
        assessment.acceptance_criteria = "All tests pass"
        return assessment

    def test_build_scoring_prompt_basic(self, mock_assessment):
        """Test basic prompt generation."""
        files = [
            {"path": "main.py", "content": "print('hello')"},
        ]

        prompt = build_scoring_prompt(mock_assessment, files)

        assert "Build a REST API" in prompt
        assert "Use FastAPI and Python" in prompt
        assert "All tests pass" in prompt
        assert "main.py" in prompt
        assert "print('hello')" in prompt
        assert "correctness" in prompt.lower()

    def test_build_scoring_prompt_with_explanation(self, mock_assessment):
        """Test prompt includes candidate explanation."""
        files = [{"path": "main.py", "content": "code"}]
        explanation = "I chose this approach because..."

        prompt = build_scoring_prompt(mock_assessment, files, explanation)

        assert explanation in prompt
        assert "Candidate's Explanation" in prompt

    def test_build_scoring_prompt_truncates_large_files(self, mock_assessment):
        """Test that large files are truncated."""
        large_content = "x" * (MAX_CONTEXT_CHARS + 1000)
        files = [{"path": "large.py", "content": large_content}]

        prompt = build_scoring_prompt(mock_assessment, files)

        assert len(prompt) < MAX_CONTEXT_CHARS + 5000  # Some overhead
        assert "truncated" in prompt.lower()

    def test_build_scoring_prompt_multiple_files(self, mock_assessment):
        """Test prompt with multiple files."""
        files = [
            {"path": "main.py", "content": "main code"},
            {"path": "utils.py", "content": "utils code"},
            {"path": "tests.py", "content": "test code"},
        ]

        prompt = build_scoring_prompt(mock_assessment, files)

        assert "main.py" in prompt
        assert "utils.py" in prompt
        assert "tests.py" in prompt


class TestParseScores:
    """Tests for parse_scores function."""

    def test_parse_scores_valid_json(self):
        """Test parsing valid JSON response."""
        response = {
            "content": json.dumps(
                {
                    "correctness": 85,
                    "quality": 80,
                    "readability": 90,
                    "robustness": 75,
                    "clarity": 85,
                    "depth": 70,
                    "structure": 80,
                    "comment": "Good implementation",
                }
            )
        }

        scores = parse_scores(response)

        assert scores is not None
        assert scores["correctness"] == 85
        assert scores["quality"] == 80
        assert scores["comment"] == "Good implementation"

    def test_parse_scores_json_in_markdown(self):
        """Test parsing JSON wrapped in markdown code block."""
        json_content = json.dumps(
            {
                "correctness": 85,
                "quality": 80,
                "readability": 90,
                "robustness": 75,
                "clarity": 85,
                "depth": 70,
                "structure": 80,
                "comment": "Good",
            }
        )
        response = {"content": f"Here's the assessment:\n```json\n{json_content}\n```"}

        scores = parse_scores(response)

        assert scores is not None
        assert scores["correctness"] == 85

    def test_parse_scores_clamps_out_of_range(self):
        """Test that scores outside 0-100 are clamped."""
        response = {
            "content": json.dumps(
                {
                    "correctness": 150,  # Over 100
                    "quality": -10,  # Below 0
                    "readability": 90,
                    "robustness": 75,
                    "clarity": 85,
                    "depth": 70,
                    "structure": 80,
                    "comment": "Test",
                }
            )
        }

        scores = parse_scores(response)

        assert scores is not None
        assert scores["correctness"] == 100  # Clamped to max
        assert scores["quality"] == 0  # Clamped to min

    def test_parse_scores_missing_field_returns_none(self):
        """Test that missing required field returns None."""
        response = {
            "content": json.dumps(
                {
                    "correctness": 85,
                    "quality": 80,
                    # Missing other required fields
                }
            )
        }

        scores = parse_scores(response)

        assert scores is None

    def test_parse_scores_invalid_json_returns_none(self):
        """Test that invalid JSON returns None."""
        response = {"content": "This is not JSON at all"}

        scores = parse_scores(response)

        assert scores is None

    def test_parse_scores_non_numeric_value_returns_none(self):
        """Test that non-numeric score values return None."""
        response = {
            "content": json.dumps(
                {
                    "correctness": "high",  # Should be int
                    "quality": 80,
                    "readability": 90,
                    "robustness": 75,
                    "clarity": 85,
                    "depth": 70,
                    "structure": 80,
                    "comment": "Test",
                }
            )
        }

        scores = parse_scores(response)

        assert scores is None

    def test_parse_scores_empty_response(self):
        """Test handling of empty response."""
        response = {"content": ""}

        scores = parse_scores(response)

        assert scores is None


# =============================================================================
# Score Submission Tests
# =============================================================================


class TestCalculateWeightedScore:
    """Tests for _calculate_weighted_score function."""

    def test_calculate_weighted_score_default_weights(self):
        """Test weighted score with default weights."""
        from app.worker.tasks.score_submission import _calculate_weighted_score

        scores = {
            "correctness": 100,
            "quality": 100,
            "readability": 100,
            "robustness": 100,
            "clarity": 100,
            "depth": 100,
            "structure": 100,
        }

        mock_assessment = MagicMock()
        mock_assessment.weights_dict = {
            "correctness": 25,
            "quality": 20,
            "readability": 15,
            "robustness": 10,
            "clarity": 10,
            "depth": 10,
            "structure": 10,
        }

        result = _calculate_weighted_score(scores, mock_assessment)

        assert result == 100.0

    def test_calculate_weighted_score_mixed_scores(self):
        """Test weighted score with mixed scores."""
        from app.worker.tasks.score_submission import _calculate_weighted_score

        scores = {
            "correctness": 80,
            "quality": 70,
            "readability": 90,
            "robustness": 60,
            "clarity": 75,
            "depth": 85,
            "structure": 70,
        }

        mock_assessment = MagicMock()
        mock_assessment.weights_dict = {
            "correctness": 25,
            "quality": 20,
            "readability": 15,
            "robustness": 10,
            "clarity": 10,
            "depth": 10,
            "structure": 10,
        }

        result = _calculate_weighted_score(scores, mock_assessment)

        # (80*25 + 70*20 + 90*15 + 60*10 + 75*10 + 85*10 + 70*10) / 100
        # = (2000 + 1400 + 1350 + 600 + 750 + 850 + 700) / 100
        # = 7650 / 100 = 76.5
        assert result == 76.5

    def test_calculate_weighted_score_zero_scores(self):
        """Test weighted score when all scores are zero."""
        from app.worker.tasks.score_submission import _calculate_weighted_score

        scores = {
            "correctness": 0,
            "quality": 0,
            "readability": 0,
            "robustness": 0,
            "clarity": 0,
            "depth": 0,
            "structure": 0,
        }

        mock_assessment = MagicMock()
        mock_assessment.weights_dict = {
            "correctness": 25,
            "quality": 20,
            "readability": 15,
            "robustness": 10,
            "clarity": 10,
            "depth": 10,
            "structure": 10,
        }

        result = _calculate_weighted_score(scores, mock_assessment)

        assert result == 0.0


class TestCloneRepo:
    """Tests for _clone_repo function."""

    def test_clone_repo_success(self, tmp_path):
        """Test successful repository clone."""
        from app.worker.tasks.score_submission import _clone_repo

        with patch("subprocess.run") as mock_run:
            # Mock successful clone
            mock_run.side_effect = [
                MagicMock(returncode=0, stderr=""),  # git clone
                MagicMock(returncode=0, stdout="abc123\n"),  # git rev-parse
            ]

            result = _clone_repo("https://github.com/test/repo", str(tmp_path))

            assert result["success"] is True
            assert result["commit_sha"] == "abc123"

    def test_clone_repo_failure(self, tmp_path):
        """Test failed repository clone."""
        from app.worker.tasks.score_submission import _clone_repo

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1,
                stderr="Repository not found",
            )

            result = _clone_repo("https://github.com/invalid/repo", str(tmp_path))

            assert result["success"] is False
            assert "not found" in result["error"].lower()

    def test_clone_repo_timeout(self, tmp_path):
        """Test repository clone timeout."""
        from subprocess import TimeoutExpired

        from app.worker.tasks.score_submission import _clone_repo

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = TimeoutExpired("git", 60)

            result = _clone_repo("https://github.com/test/repo", str(tmp_path))

            assert result["success"] is False
            assert "timed out" in result["error"].lower()


class TestScoreSubmissionIntegration:
    """Integration tests for score_submission function."""

    @pytest.fixture
    def mock_db_session(self):
        """Create a mock database session."""
        session = MagicMock()
        session.query.return_value.filter.return_value.first.return_value = None
        return session

    @pytest.fixture
    def test_assessment(self, db, test_org, test_owner):
        """Create a test assessment."""
        assessment = Assessment(
            organization_id=test_org.id,
            created_by=test_owner.id,
            title="Test Assessment",
            problem_statement="Build something",
            build_requirements="Use Python",
            input_output_examples="Input: x, Output: y",
            acceptance_criteria="Tests pass",
            constraints="No constraints",
            submission_instructions="Submit via GitHub",
            visibility=AssessmentVisibility.ACTIVE,
            evaluation_mode=EvaluationMode.AI_ONLY,
            status=AssessmentStatus.PUBLISHED,
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        return assessment

    def test_score_submission_not_found(self):
        """Test score_submission with non-existent submission."""
        from app.worker.tasks.score_submission import score_submission

        with patch("app.worker.tasks.score_submission.SessionLocal") as mock_session:
            mock_db = MagicMock()
            mock_db.query.return_value.filter.return_value.first.return_value = None
            mock_session.return_value = mock_db

            with pytest.raises(ValueError, match="not found"):
                score_submission(str(uuid4()), str(uuid4()))

    def test_score_submission_success_flow(self, tmp_path):
        """Test successful score_submission flow end-to-end."""
        from app.worker.tasks.score_submission import score_submission

        submission_id = str(uuid4())
        org_id = str(uuid4())
        assessment_id = str(uuid4())
        candidate_id = str(uuid4())

        # Create mock submission
        mock_submission = MagicMock()
        mock_submission.id = uuid4()
        mock_submission.organization_id = uuid4()
        mock_submission.assessment_id = assessment_id
        mock_submission.candidate_id = candidate_id
        mock_submission.github_repo_url = "https://github.com/test/repo"
        mock_submission.explanation_text = "My approach"
        mock_submission.retry_count = 0

        # Create mock assessment
        mock_assessment = MagicMock()
        mock_assessment.id = assessment_id
        mock_assessment.title = "Test Assessment"
        mock_assessment.problem_statement = "Build a thing"
        mock_assessment.build_requirements = "Use Python"
        mock_assessment.acceptance_criteria = "Works correctly"
        mock_assessment.weights_dict = {
            "correctness": 25,
            "quality": 20,
            "readability": 15,
            "robustness": 10,
            "clarity": 10,
            "depth": 10,
            "structure": 10,
        }

        # Create mock candidate
        mock_candidate = MagicMock()
        mock_candidate.email = "test@example.com"
        mock_candidate.name = "Test User"

        # Mock database session
        mock_db = MagicMock()

        def query_side_effect(model):
            mock_query = MagicMock()
            mock_filter = MagicMock()

            if "Submission" in str(model):
                mock_filter.first.return_value = mock_submission
                mock_filter.count.return_value = 1
            elif "Assessment" in str(model):
                mock_filter.first.return_value = mock_assessment
            elif "User" in str(model):
                mock_filter.first.return_value = mock_candidate
            else:
                mock_filter.first.return_value = None

            mock_query.filter.return_value = mock_filter
            return mock_query

        mock_db.query.side_effect = query_side_effect

        # Create temp repo with code files
        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()
        (repo_dir / "main.py").write_text("print('hello')")

        valid_scores = {
            "correctness": 85,
            "quality": 80,
            "readability": 90,
            "robustness": 75,
            "clarity": 85,
            "depth": 70,
            "structure": 80,
            "comment": "Good work",
        }

        with (
            patch(
                "app.worker.tasks.score_submission.SessionLocal", return_value=mock_db
            ),
            patch("app.worker.tasks.score_submission._clone_repo") as mock_clone,
            patch("app.worker.tasks.file_filter.filter_code_files") as mock_filter,
            patch("app.worker.tasks.scoring.call_llm_with_json_retry") as mock_llm,
            patch("app.services.budget.check_budget") as mock_budget,
            patch(
                "app.worker.tasks.score_submission.award_submission_points",
                return_value=50,
            ),
            patch("app.worker.tasks.score_submission.log_submission_scored"),
            patch("app.services.email.send_score_ready_email_sync"),
        ):

            mock_clone.return_value = {"success": True, "commit_sha": "abc123"}
            mock_filter.return_value = [
                {"path": "main.py", "content": "print('hello')", "size": 15}
            ]
            mock_llm.return_value = (
                {"content": json.dumps(valid_scores)},
                valid_scores,
            )
            mock_budget.return_value = MagicMock(allowed=True, warning=None)

            result = score_submission(submission_id, org_id)

            assert result["status"] == "success"
            assert result["score"] == 81.75  # Weighted average
            assert result["points_awarded"] == 50

    def test_score_submission_clone_failed(self):
        """Test score_submission when clone fails."""
        from app.worker.tasks.score_submission import score_submission

        mock_submission = MagicMock()
        mock_submission.github_repo_url = "https://github.com/invalid/repo"
        mock_submission.retry_count = 0

        mock_assessment = MagicMock()

        mock_db = MagicMock()

        def query_side_effect(model):
            mock_query = MagicMock()
            mock_filter = MagicMock()
            if "Submission" in str(model):
                mock_filter.first.return_value = mock_submission
            elif "Assessment" in str(model):
                mock_filter.first.return_value = mock_assessment
            else:
                mock_filter.first.return_value = None
            mock_query.filter.return_value = mock_filter
            return mock_query

        mock_db.query.side_effect = query_side_effect

        with (
            patch(
                "app.worker.tasks.score_submission.SessionLocal", return_value=mock_db
            ),
            patch("app.worker.tasks.score_submission._clone_repo") as mock_clone,
            patch("app.services.budget.check_budget") as mock_budget,
        ):

            mock_clone.return_value = {
                "success": False,
                "error": "Repository not found",
            }
            mock_budget.return_value = MagicMock(allowed=True, warning=None)

            result = score_submission(str(uuid4()), str(uuid4()))

            assert result["status"] == "clone_failed"
            assert "not found" in result["error"].lower()

    def test_score_submission_budget_exceeded(self):
        """Test score_submission when LLM budget is exceeded."""
        from app.worker.tasks.score_submission import score_submission

        mock_submission = MagicMock()
        mock_submission.retry_count = 0

        mock_assessment = MagicMock()

        mock_db = MagicMock()

        def query_side_effect(model):
            mock_query = MagicMock()
            mock_filter = MagicMock()
            if "Submission" in str(model):
                mock_filter.first.return_value = mock_submission
            elif "Assessment" in str(model):
                mock_filter.first.return_value = mock_assessment
            else:
                mock_filter.first.return_value = None
            mock_query.filter.return_value = mock_filter
            return mock_query

        mock_db.query.side_effect = query_side_effect

        with (
            patch(
                "app.worker.tasks.score_submission.SessionLocal", return_value=mock_db
            ),
            patch("app.services.budget.check_budget") as mock_budget,
        ):

            mock_budget.return_value = MagicMock(
                allowed=False, warning="Monthly budget exceeded"
            )

            result = score_submission(str(uuid4()), str(uuid4()))

            assert result["status"] == "budget_exceeded"


# =============================================================================
# LLM Retry Tests
# =============================================================================


class TestCallLlmWithJsonRetry:
    """Tests for call_llm_with_json_retry function."""

    def test_call_llm_with_json_retry_success_first_try(self):
        """Test successful LLM call on first attempt."""
        from app.worker.tasks.scoring import call_llm_with_json_retry

        valid_scores = {
            "correctness": 85,
            "quality": 80,
            "readability": 90,
            "robustness": 75,
            "clarity": 85,
            "depth": 70,
            "structure": 80,
            "comment": "Good",
        }

        mock_db = MagicMock()

        with patch("app.worker.tasks.scoring.call_llm_sync") as mock_llm:
            mock_llm.return_value = {"content": json.dumps(valid_scores)}

            response, scores = call_llm_with_json_retry(
                prompt="Test prompt",
                organization_id=str(uuid4()),
                submission_id=str(uuid4()),
                db=mock_db,
            )

            assert scores is not None
            assert scores["correctness"] == 85
            # Should only call LLM once
            assert mock_llm.call_count == 1

    def test_call_llm_with_json_retry_success_on_retry(self):
        """Test successful LLM call after first attempt fails JSON parsing."""
        from app.worker.tasks.scoring import call_llm_with_json_retry

        valid_scores = {
            "correctness": 85,
            "quality": 80,
            "readability": 90,
            "robustness": 75,
            "clarity": 85,
            "depth": 70,
            "structure": 80,
            "comment": "Good",
        }

        mock_db = MagicMock()

        with (
            patch("app.worker.tasks.scoring.call_llm_sync") as mock_llm_sync,
            patch("app.worker.tasks.scoring._call_llm_with_messages") as mock_retry,
        ):

            # First call returns invalid JSON
            mock_llm_sync.return_value = {"content": "This is not valid JSON"}
            # Retry returns valid JSON
            mock_retry.return_value = {"content": json.dumps(valid_scores)}

            response, scores = call_llm_with_json_retry(
                prompt="Test prompt",
                organization_id=str(uuid4()),
                submission_id=str(uuid4()),
                db=mock_db,
            )

            assert scores is not None
            assert scores["correctness"] == 85
            # First call + retry
            assert mock_llm_sync.call_count == 1
            assert mock_retry.call_count == 1

    def test_call_llm_with_json_retry_both_fail(self):
        """Test when both LLM attempts fail to produce valid JSON."""
        from app.worker.tasks.scoring import call_llm_with_json_retry

        mock_db = MagicMock()

        with (
            patch("app.worker.tasks.scoring.call_llm_sync") as mock_llm_sync,
            patch("app.worker.tasks.scoring._call_llm_with_messages") as mock_retry,
        ):

            # Both calls return invalid JSON
            mock_llm_sync.return_value = {"content": "Invalid JSON 1"}
            mock_retry.return_value = {"content": "Invalid JSON 2"}

            response, scores = call_llm_with_json_retry(
                prompt="Test prompt",
                organization_id=str(uuid4()),
                submission_id=str(uuid4()),
                db=mock_db,
            )

            assert scores is None
            # Both attempts made
            assert mock_llm_sync.call_count == 1
            assert mock_retry.call_count == 1


class TestCallLlmSync:
    """Tests for call_llm_sync function."""

    def test_call_llm_sync_success(self):
        """Test successful LLM API call."""
        from app.worker.tasks.scoring import call_llm_sync

        mock_db = MagicMock()

        with (
            patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}),
            patch("httpx.Client") as mock_client_class,
        ):

            mock_response = MagicMock()
            mock_response.json.return_value = {
                "choices": [{"message": {"content": "Test response"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            }
            mock_response.raise_for_status = MagicMock()

            mock_client = MagicMock()
            mock_client.post.return_value = mock_response
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client_class.return_value = mock_client

            result = call_llm_sync(
                prompt="Test prompt",
                organization_id=str(uuid4()),
                submission_id=str(uuid4()),
                db=mock_db,
            )

            assert result["content"] == "Test response"
            assert result["prompt_tokens"] == 100
            assert result["completion_tokens"] == 50

    def test_call_llm_sync_all_providers_fail(self):
        """Test that exception is raised when all providers fail."""
        from app.worker.tasks.scoring import call_llm_sync

        mock_db = MagicMock()

        with (
            patch.dict(
                os.environ, {"GROQ_API_KEY": "test-key", "OPENAI_API_KEY": "test-key"}
            ),
            patch("httpx.Client") as mock_client_class,
        ):

            mock_client = MagicMock()
            mock_client.post.side_effect = Exception("API Error")
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client_class.return_value = mock_client

            with pytest.raises(Exception, match="All LLM providers failed"):
                call_llm_sync(
                    prompt="Test prompt",
                    organization_id=str(uuid4()),
                    submission_id=str(uuid4()),
                    db=mock_db,
                )
