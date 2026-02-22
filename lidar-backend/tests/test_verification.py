"""Unit tests for contractor verification logic"""
import pytest
from lidar.verification import is_contractor_flagged


def test_contractor_flagged_when_improvement_low():
    assert is_contractor_flagged(85) is True
    assert is_contractor_flagged(89) is True


def test_contractor_not_flagged_when_improvement_high():
    assert is_contractor_flagged(90) is False
    assert is_contractor_flagged(95) is False
