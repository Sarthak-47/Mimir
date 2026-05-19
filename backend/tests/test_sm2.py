"""
Tests for the SM-2 spaced-repetition algorithm (agent/tools.py).

The function under test is `compute_sm2(score, total, ease_factor,
repetitions, interval)` which returns (new_ease, new_reps, new_interval,
next_review_datetime).

All tests are pure (no I/O, no mocking) because compute_sm2 is a
self-contained mathematical function.
"""

import pytest
from datetime import datetime, timedelta

from agent.tools import compute_sm2, compute_next_review


# ─────────────────────────────────────────────────────────────────────────────
# Quality mapping from percentage
# ─────────────────────────────────────────────────────────────────────────────

class TestQualityMapping:
    """Verify that score percentages map to the correct SM-2 quality grades."""

    def test_perfect_score_gives_quality_5(self):
        """100% → quality 5 → ease increases by 0.1."""
        ease, reps, interval, _ = compute_sm2(score=10, total=10)
        # quality 5: new_ease = 2.5 + 0.1 - 0*(…) = 2.6
        assert ease == pytest.approx(2.6, abs=1e-3)

    def test_90_percent_gives_quality_5(self):
        ease, _, _, _ = compute_sm2(score=9, total=10)
        assert ease == pytest.approx(2.6, abs=1e-3)

    def test_80_percent_gives_quality_4(self):
        """80–89% → quality 4 → ease stays the same (2.5)."""
        ease, _, _, _ = compute_sm2(score=8, total=10)
        # quality 4: 2.5 + 0.1 - 1*(0.08 + 0.02) = 2.5
        assert ease == pytest.approx(2.5, abs=1e-3)

    def test_70_percent_gives_quality_3(self):
        """70–79% → quality 3 (lowest pass) → ease decreases slightly."""
        ease, _, _, _ = compute_sm2(score=7, total=10)
        # quality 3: 2.5 + 0.1 - 2*(0.08 + 0.04) = 2.5 + 0.1 - 0.24 = 2.36
        assert ease == pytest.approx(2.36, abs=1e-3)

    def test_60_percent_is_a_fail(self):
        """60–69% → quality 2 → triggers the failure path (reps reset to 0)."""
        _, reps, interval, _ = compute_sm2(score=6, total=10)
        assert reps == 0
        assert interval == 1

    def test_40_percent_is_a_fail(self):
        """40–59% → quality 1 → failure path."""
        _, reps, interval, _ = compute_sm2(score=4, total=10)
        assert reps == 0
        assert interval == 1

    def test_below_40_is_complete_fail(self):
        """<40% → quality 0 → failure path."""
        _, reps, interval, _ = compute_sm2(score=3, total=10)
        assert reps == 0
        assert interval == 1


# ─────────────────────────────────────────────────────────────────────────────
# Interval progression
# ─────────────────────────────────────────────────────────────────────────────

class TestIntervalProgression:
    """The SM-2 interval schedule: 1 day → 6 days → ease×previous."""

    def test_first_successful_rep_gives_interval_1(self):
        """repetitions=0 + success → next review in 1 day."""
        _, _, interval, _ = compute_sm2(score=10, total=10, repetitions=0)
        assert interval == 1

    def test_second_successful_rep_gives_interval_6(self):
        """repetitions=1 + success → next review in 6 days."""
        _, _, interval, _ = compute_sm2(score=10, total=10, repetitions=1)
        assert interval == 6

    def test_third_rep_multiplies_by_ease_factor(self):
        """repetitions=2, interval=6, ease=2.5 → new_interval = round(6×2.5) = 15."""
        _, _, interval, _ = compute_sm2(
            score=10, total=10,
            ease_factor=2.5, repetitions=2, interval=6,
        )
        assert interval == 15

    def test_interval_grows_over_successive_reps(self):
        """Simulate five consecutive perfect reviews and verify monotonic growth."""
        ef, reps, iv = 2.5, 0, 1
        prev_iv = 0
        for _ in range(5):
            ef, reps, iv, _ = compute_sm2(
                score=10, total=10,
                ease_factor=ef, repetitions=reps, interval=iv,
            )
            assert iv >= prev_iv
            prev_iv = iv

    def test_interval_capped_at_365_days(self):
        """A very long interval is capped at one year."""
        _, _, interval, _ = compute_sm2(
            score=10, total=10,
            ease_factor=3.0, repetitions=10, interval=200,
        )
        # round(200 × 3.0) = 600 → capped at 365
        assert interval == 365


# ─────────────────────────────────────────────────────────────────────────────
# Failure / reset behaviour
# ─────────────────────────────────────────────────────────────────────────────

class TestFailureBehaviour:
    """On failed recall the schedule resets and ease decreases."""

    def test_failure_resets_repetitions_to_zero(self):
        """Even mid-sequence (reps=4), failure resets reps to 0."""
        _, reps, _, _ = compute_sm2(
            score=3, total=10, repetitions=4, interval=30,
        )
        assert reps == 0

    def test_failure_resets_interval_to_one(self):
        _, _, interval, _ = compute_sm2(
            score=3, total=10, repetitions=4, interval=30,
        )
        assert interval == 1

    def test_failure_decreases_ease_by_0_2(self):
        """Failed recall reduces ease factor by 0.2."""
        ease, _, _, _ = compute_sm2(
            score=3, total=10, ease_factor=2.5,
        )
        assert ease == pytest.approx(2.3, abs=1e-3)

    def test_ease_never_drops_below_1_3(self):
        """Ease factor is clamped to a minimum of 1.3."""
        ease, _, _, _ = compute_sm2(
            score=0, total=10, ease_factor=1.3,
        )
        assert ease == pytest.approx(1.3, abs=1e-3)

    def test_ease_never_drops_below_1_3_when_already_low(self):
        """Even starting at 1.4 and failing, floor is respected."""
        ease, _, _, _ = compute_sm2(
            score=0, total=10, ease_factor=1.4,
        )
        assert ease == pytest.approx(1.3, abs=1e-3)


# ─────────────────────────────────────────────────────────────────────────────
# Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    """Boundary inputs that must not crash or produce nonsense."""

    def test_zero_total_does_not_divide_by_zero(self):
        """score/total=0/0 should treat the result as 0%, not raise ZeroDivisionError."""
        ease, reps, interval, next_review = compute_sm2(score=5, total=0)
        # pct=0 → quality=0 → failure path
        assert reps == 0
        assert interval == 1
        assert isinstance(next_review, datetime)

    def test_next_review_is_in_the_future(self):
        """next_review must always be after the current UTC time."""
        before = datetime.utcnow()
        _, _, _, next_review = compute_sm2(score=10, total=10)
        assert next_review > before

    def test_next_review_after_failure_is_tomorrow(self):
        """Failed review → 1-day interval → next_review ≈ now + 1 day."""
        before = datetime.utcnow()
        _, _, _, next_review = compute_sm2(score=0, total=10)
        delta = next_review - before
        assert timedelta(hours=23) < delta < timedelta(hours=25)

    def test_legacy_wrapper_returns_datetime(self):
        """compute_next_review (legacy wrapper) must return a datetime."""
        result = compute_next_review(score=8, total=10)
        assert isinstance(result, datetime)
        assert result > datetime.utcnow()

    def test_perfect_score_multiple_times_increases_ease(self):
        """Repeated perfect scores should keep raising the ease factor."""
        ef = 2.5
        for _ in range(4):
            ef, reps, iv, _ = compute_sm2(
                score=10, total=10, ease_factor=ef,
                repetitions=0, interval=1,
            )
        # After 4 perfect first-rep scores ease should be 2.6 each time
        assert ef > 2.5
