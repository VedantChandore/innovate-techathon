"""
visualization.py - Potree viewer URL generation
In production: run PotreeConverter, host output, return URL.
"""
from pathlib import Path

from config import POTREE_VIEWER_DIR


def get_potree_viewer_url(scan_id: str, base_url: str = "https://potree.example.com/viewer") -> str:
    """
    Return Potree viewer URL for a scan.
    In production: run PotreeConverter on LAS, deploy to /viewer/{scan_id}/, return URL.
    """
    return f"{base_url.rstrip('/')}/{scan_id}"
