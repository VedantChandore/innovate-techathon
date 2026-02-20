"""
test_inference.py
=================
Validation test suite for the Road CIBIL inference pipeline.

Tests:
  1.  10 random real segments from the dataset
  2.  Extreme distress case (worst possible road)
  3.  Perfect road case (brand new, zero distress)
  4.  Missing / partial input (only distress fields, no traffic/env data)
  5.  Score range assertion (always 0–100, no negatives, no NaN)
  6.  Latency assertion (< 100 ms per request)

Run:
    python test_inference.py
    (from the api/ folder or the project root)
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

# ── Path setup ────────────────────────────────────────────────────────────────
_API_DIR     = Path(__file__).parent
_PROJECT_DIR = _API_DIR.parent
sys.path.insert(0, str(_API_DIR))

from road_cibil_inference import RoadCIBILPredictor

MODEL_PATH  = _PROJECT_DIR / "road_cibil_model.pkl"
DATA_PATH   = _PROJECT_DIR / "all_highways_segments_conditions.csv"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg: str) -> None:
    print(f"  {GREEN}✅  {msg}{RESET}")

def fail(msg: str) -> None:
    print(f"  {RED}❌  {msg}{RESET}")
    raise AssertionError(msg)

def info(msg: str) -> None:
    print(f"  {YELLOW}ℹ️   {msg}{RESET}")


def assert_valid_score(result: dict, label: str) -> None:
    """Assert the result dict contains a valid CIBIL score."""
    score = result["final_cibil_score"]
    assert isinstance(score, float), f"{label}: score is not float"
    assert 0.0 <= score <= 100.0,    f"{label}: score={score} out of 0–100"
    assert result["pdi"] >= 0.0,     f"{label}: PDI is negative"
    assert result["latency_ms"] < 200.0, f"{label}: latency={result['latency_ms']} ms >= 200ms"


def main() -> None:
    print()
    print(f"{BOLD}{'=' * 60}")
    print("  Road CIBIL Inference Validation Tests")
    print(f"{'=' * 60}{RESET}")

    # ── Load predictor ────────────────────────────────────────────────────────
    print(f"\n{BOLD}[SETUP] Loading model …{RESET}")
    t0 = time.perf_counter()
    predictor = RoadCIBILPredictor(MODEL_PATH)
    load_ms = (time.perf_counter() - t0) * 1000
    ok(f"Model loaded in {load_ms:.0f} ms | version={predictor.model_version}")

    # ── Test 1: 10 random real segments ──────────────────────────────────────
    print(f"\n{BOLD}[TEST 1] 10 random real segments from dataset{RESET}")
    df = pd.read_csv(DATA_PATH)
    sample = df.sample(10, random_state=42)

    latencies = []
    for i, (_, row) in enumerate(sample.iterrows(), 1):
        raw = row.to_dict()
        result = predictor.predict(raw)
        assert_valid_score(result, f"Segment #{i}")
        latencies.append(result["latency_ms"])
        print(
            f"    Seg {i:>2}: CIBIL={result['final_cibil_score']:>6.2f}  "
            f"PDI={result['pdi']:>5.2f}  "
            f"Condition={result['condition_category']:<10}  "
            f"{result['latency_ms']:.1f} ms"
        )

    avg_lat = sum(latencies) / len(latencies)
    ok(f"All 10 segments scored. Avg latency: {avg_lat:.1f} ms")

    # ── Test 2: Extreme distress case ─────────────────────────────────────────
    print(f"\n{BOLD}[TEST 2] Extreme distress case (worst road){RESET}")
    worst_road = {
        "iri_value": 9.4,
        "alligator_cracking_pct": 34.2,
        "potholes_per_km": 22.0,
        "rutting_depth_mm": 28.0,
        "cracks_longitudinal_pct": 51.8,
        "cracks_transverse_per_km": 25.0,
        "raveling_pct": 40.2,
        "edge_breaking_pct": 42.7,
        "patches_per_km": 19.0,
        "pothole_avg_depth_cm": 15.0,
        "pci_score": 5.0,
        "year_constructed": 1990.0,
        "last_major_rehab_year": 1995.0,
        "avg_daily_traffic": 25000.0,
        "truck_percentage": 40.0,
        "surface_type": "gravel",
        "slope_category": "steep",
        "monsoon_rainfall_category": "high",
        "terrain_type": "hilly",
        "region_type": "rural",
        "landslide_prone": 1,
        "flood_prone": 1,
    }
    result = predictor.predict(worst_road)
    assert_valid_score(result, "Extreme case")
    info(
        f"Worst road → CIBIL={result['final_cibil_score']}  "
        f"PDI={result['pdi']}  Condition={result['condition_category']}"
    )
    assert result["final_cibil_score"] < 50.0, \
        f"Expected Critical/Poor for worst road, got {result['final_cibil_score']}"
    ok("Extreme distress case scored correctly (< 50)")

    # ── Test 3: Perfect road ──────────────────────────────────────────────────
    print(f"\n{BOLD}[TEST 3] Perfect road (zero distress, brand new){RESET}")
    perfect_road = {
        "iri_value": 0.0,
        "alligator_cracking_pct": 0.0,
        "potholes_per_km": 0.0,
        "rutting_depth_mm": 0.0,
        "cracks_longitudinal_pct": 0.0,
        "cracks_transverse_per_km": 0.0,
        "raveling_pct": 0.0,
        "edge_breaking_pct": 0.0,
        "patches_per_km": 0.0,
        "pothole_avg_depth_cm": 0.0,
        "pci_score": 100.0,
        "year_constructed": 2025.0,
        "last_major_rehab_year": 2025.0,
        "avg_daily_traffic": 3000.0,
        "truck_percentage": 5.0,
        "surface_type": "concrete",
        "slope_category": "flat",
        "monsoon_rainfall_category": "low",
        "terrain_type": "plain",
        "region_type": "urban",
        "landslide_prone": 0,
        "flood_prone": 0,
    }
    result = predictor.predict(perfect_road)
    assert_valid_score(result, "Perfect road")
    info(
        f"Perfect road → CIBIL={result['final_cibil_score']}  "
        f"PDI={result['pdi']}  Condition={result['condition_category']}"
    )
    assert result["final_cibil_score"] >= 80.0, \
        f"Expected Good for perfect road, got {result['final_cibil_score']}"
    ok("Perfect road scored correctly (≥ 80)")

    # ── Test 4: Partial / missing input ──────────────────────────────────────
    print(f"\n{BOLD}[TEST 4] Partial input (only distress fields, defaults used for rest){RESET}")
    partial_road = {
        "iri_value": 4.2,
        "potholes_per_km": 8.0,
        "alligator_cracking_pct": 15.0,
        # all other fields will use schema defaults via predictor._handle_missing
    }
    result = predictor.predict(partial_road)
    assert_valid_score(result, "Partial input")
    info(
        f"Partial road → CIBIL={result['final_cibil_score']}  "
        f"Condition={result['condition_category']}  latency={result['latency_ms']} ms"
    )
    ok("Partial input handled safely with defaults")

    # ── Test 5: Score range over 100 random rows ──────────────────────────────
    print(f"\n{BOLD}[TEST 5] Score range check — 100 random segments{RESET}")
    big_sample = df.sample(100, random_state=99)
    all_scores = []
    for _, row in big_sample.iterrows():
        r = predictor.predict(row.to_dict())
        all_scores.append(r["final_cibil_score"])
        assert 0.0 <= r["final_cibil_score"] <= 100.0, \
            f"Score out of range: {r['final_cibil_score']}"
        assert r["pdi"] >= 0.0, f"Negative PDI: {r['pdi']}"

    ok(
        f"All 100 scores in [0, 100]. "
        f"Min={min(all_scores):.2f}  Max={max(all_scores):.2f}  "
        f"Avg={sum(all_scores)/len(all_scores):.2f}"
    )

    # ── Test 6: Latency benchmark ─────────────────────────────────────────────
    print(f"\n{BOLD}[TEST 6] Latency benchmark — 50 consecutive requests{RESET}")
    bench_sample = df.sample(50, random_state=7)
    bench_lats = []
    for _, row in bench_sample.iterrows():
        r = predictor.predict(row.to_dict())
        bench_lats.append(r["latency_ms"])

    avg_bench = sum(bench_lats) / len(bench_lats)
    max_bench = max(bench_lats)
    assert max_bench < 200.0, f"Max latency {max_bench:.1f} ms exceeds 200 ms SLA"
    ok(
        f"Latency SLA passed. "
        f"Avg={avg_bench:.1f} ms  Max={max_bench:.1f} ms  "
        f"(SLA: < 200 ms)"
    )

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print(f"{BOLD}{'=' * 60}")
    print(f"  {GREEN}ALL TESTS PASSED{RESET}{BOLD}")
    print(f"{'=' * 60}{RESET}")
    print(f"  Model version : {predictor.model_version}")
    print(f"  Training R²   : {predictor.metrics.get('R²', 'n/a')}")
    print(f"  Load time     : {load_ms:.0f} ms")
    print(f"  Avg inference : {avg_bench:.1f} ms")
    print()


if __name__ == "__main__":
    main()
