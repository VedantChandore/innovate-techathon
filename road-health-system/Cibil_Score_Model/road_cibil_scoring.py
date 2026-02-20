"""
================================================================================
  ROAD CIBIL SCORING MODULE
  Maharashtra Central Road Condition Monitoring System (CRCMS)
  Version : 1.0.0
  Author  : Senior ML Engineering Team
  Date    : 2026-02-19
================================================================================

Architecture Overview
---------------------
  Phase 1 → Data Preprocessing
  Phase 2 → Pseudo-Label Generation  (PDI → Pseudo_CIBIL)
  Phase 3 → Supervised Regression    (RandomForestRegressor)
  Phase 4 → Feature Importance       (RF + SHAP)
  Phase 5 → Hybrid CIBIL System      (0.7 * Pseudo + 0.3 * ML)
  Phase 6 → Output Module            (CSV export)

Design principles
-----------------
  • Every phase is a pure, independently-testable function.
  • No deep learning; no unnecessary hyperparameter tuning.
  • Production-ready: can be wired to a FastAPI / PostgreSQL backend.
"""

# ─── Standard library ────────────────────────────────────────────────────────
import os
import warnings
import logging

# ─── Third-party ─────────────────────────────────────────────────────────────
import numpy  as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")                      # headless-safe; swap to "TkAgg" locally
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.ensemble        import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics         import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing   import MinMaxScaler

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger(__name__)

# ─── Global paths ─────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_PATH   = os.path.join(BASE_DIR, "all_highways_segments_conditions.csv")
OUTPUT_CSV  = os.path.join(BASE_DIR, "final_road_cibil_scores.csv")
PLOT_DIR    = os.path.join(BASE_DIR, "plots")
os.makedirs(PLOT_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 1 — DATA PREPROCESSING
# ══════════════════════════════════════════════════════════════════════════════

# Distress columns used throughout every phase
DISTRESS_COLS = [
    "iri_value",
    "alligator_cracking_pct",
    "potholes_per_km",
    "rutting_depth_mm",
    "cracks_longitudinal_pct",
    "cracks_transverse_per_km",
    "raveling_pct",
    "edge_breaking_pct",
    "patches_per_km",
    "pothole_avg_depth_cm",
]

# ── 1-A: Raw max values observed / domain-known upper bounds  ─────────────────
#    Used for deterministic clipped normalisation so a score-100 road
#    always maps to 1.0 regardless of training-set skew.
DISTRESS_MAX = {
    "iri_value"               : 10.0,    # IRI scale: 0–10 m/km
    "alligator_cracking_pct"  : 40.0,    # % of surface area
    "potholes_per_km"         : 30.0,    # count per km
    "rutting_depth_mm"        : 40.0,    # mm
    "cracks_longitudinal_pct" : 60.0,    # %
    "cracks_transverse_per_km": 25.0,    # count per km
    "raveling_pct"            : 45.0,    # %
    "edge_breaking_pct"       : 50.0,    # %
    "patches_per_km"          : 20.0,    # count per km
    "pothole_avg_depth_cm"    : 15.0,    # cm
}

# ── 1-B: PDI weights (must sum to 1.0) ───────────────────────────────────────
PDI_WEIGHTS = {
    "iri_value"               : 0.22,
    "alligator_cracking_pct"  : 0.18,
    "potholes_per_km"         : 0.14,
    "rutting_depth_mm"        : 0.12,
    "cracks_longitudinal_pct" : 0.08,
    "cracks_transverse_per_km": 0.07,
    "raveling_pct"            : 0.07,
    "edge_breaking_pct"       : 0.06,
    "patches_per_km"          : 0.04,
    "pothole_avg_depth_cm"    : 0.02,
}
assert abs(sum(PDI_WEIGHTS.values()) - 1.0) < 1e-9, "PDI weights must sum to 1.0"


def load_raw_data(path: str = DATA_PATH) -> pd.DataFrame:
    """
    Load the raw CSV. Returns a DataFrame with the original dtypes.
    """
    log.info(f"Loading dataset from: {path}")
    df = pd.read_csv(path)
    log.info(f"  Loaded {df.shape[0]:,} rows × {df.shape[1]} columns")
    return df


def handle_missing_values(df: pd.DataFrame) -> pd.DataFrame:
    """
    Impute or drop missing values by column type:
      - Distress numerics  → median
      - last_major_rehab_year → year_constructed (assumed never rehabbed)
      - lanes / maxspeed   → median (OSM data artifacts, not in model)
      - Categoricals       → mode
    """
    df = df.copy()

    # Distress features — median impute (robust to outliers)
    for col in DISTRESS_COLS:
        if col in df.columns and df[col].isnull().any():
            df[col].fillna(df[col].median(), inplace=True)

    # Structural / traffic numerics
    numeric_fill = [
        "avg_daily_traffic", "truck_percentage", "peak_hour_traffic",
        "traffic_weight", "elevation_m", "lane_count",
        "year_constructed",
    ]
    for col in numeric_fill:
        if col in df.columns and df[col].isnull().any():
            df[col].fillna(df[col].median(), inplace=True)

    # Rehab year: if unknown assume never rehabbed → use year_constructed
    if "last_major_rehab_year" in df.columns:
        df["last_major_rehab_year"].fillna(df["year_constructed"], inplace=True)

    # Categorical mode impute
    cat_cols = ["surface_type", "slope_category", "monsoon_rainfall_category",
                "region_type", "terrain_type"]
    for col in cat_cols:
        if col in df.columns and df[col].isnull().any():
            df[col].fillna(df[col].mode()[0], inplace=True)

    log.info("  Missing-value handling complete")
    return df


def encode_categoricals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ordinal-encode high-cardinality categoricals and one-hot-encode
    low-cardinality ones. Boolean flags are cast to int.

    Encoding map is deterministic (not fit on training data), making it
    safe for production inference on new rows.
    """
    df = df.copy()

    # ── Ordinal encodings ──────────────────────────────────────────────────
    ordinal_maps = {
        "surface_type": {
            "earthen" : 1,
            "gravel"  : 2,
            "bitumen" : 3,
            "concrete": 4,
        },
        "slope_category": {
            "flat"    : 1,
            "moderate": 2,
            "steep"   : 3,
        },
        "monsoon_rainfall_category": {
            "low"   : 1,
            "medium": 2,
            "high"  : 3,
        },
        "terrain_type": {
            "plain": 1,
            "hilly": 2,
            "steep": 3,
        },
    }
    for col, mapping in ordinal_maps.items():
        if col in df.columns:
            df[col] = df[col].map(mapping).fillna(2).astype(int)  # fallback = mid

    # ── One-hot: region_type (5 levels, low cardinality) ─────────────────
    if "region_type" in df.columns:
        dummies = pd.get_dummies(df["region_type"], prefix="region", dtype=int)
        df = pd.concat([df, dummies], axis=1)
        df.drop(columns=["region_type"], inplace=True)

    # ── Boolean flags → int ───────────────────────────────────────────────
    bool_cols = ["landslide_prone", "flood_prone", "ghat_section_flag",
                 "tourism_route_flag"]
    for col in bool_cols:
        if col in df.columns:
            df[col] = df[col].astype(int)

    log.info("  Categorical encoding complete")
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Derive additional domain features:
      - road_age            : years since construction
      - years_since_rehab   : years since last major rehabilitation
      - traffic_stress      : ADT × truck_percentage / 100 (ESALs proxy)
    """
    current_year = 2026
    df = df.copy()

    if "year_constructed" in df.columns:
        df["road_age"] = (current_year - df["year_constructed"]).clip(lower=0)

    if "last_major_rehab_year" in df.columns:
        df["years_since_rehab"] = (current_year - df["last_major_rehab_year"]).clip(lower=0)

    if "avg_daily_traffic" in df.columns and "truck_percentage" in df.columns:
        df["traffic_stress"] = df["avg_daily_traffic"] * df["truck_percentage"] / 100.0

    log.info("  Feature engineering complete")
    return df


def build_feature_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Select the model's feature columns from the cleaned DataFrame.
    Returns (X_df, feature_names).

    Dropped columns: identifiers, raw geo coordinates, columns unused by model,
    and any pseudo-label / PDI columns that haven't been added yet.
    """
    DROP_COLS = [
        # identifiers
        "geojson_id", "highway_ref", "road_id", "name",
        # raw geo (not predictive for scores)
        "start_lat", "start_lon", "end_lat", "end_lon",
        # admin / string metadata
        "condition", "status", "state", "district", "taluka",
        "jurisdiction", "category", "oneway", "highway_type",
        # sparse / high-missing OSM fields
        "lanes", "maxspeed",
        # JSON string column
        "seasonal_variation",
        # raw construction / rehab years (replaced by derived features)
        "year_constructed", "last_major_rehab_year",
        # segment geometry
        "segment_start_km", "segment_end_km", "segment_number",
    ]

    feature_cols = [c for c in df.columns if c not in DROP_COLS]
    # Remove any target/label columns if they were already added
    for label_col in ["PDI", "Pseudo_CIBIL", "ML_Predicted_CIBIL",
                      "Final_CIBIL", "Condition_Category"]:
        if label_col in feature_cols:
            feature_cols.remove(label_col)

    X = df[feature_cols].copy()
    log.info(f"  Feature matrix: {X.shape[0]:,} rows × {X.shape[1]} features")
    return X, feature_cols


def preprocess_pipeline(path: str = DATA_PATH) -> pd.DataFrame:
    """
    End-to-end preprocessing entry point.
    Returns a fully cleaned, encoded, feature-engineered DataFrame.
    """
    log.info("── Phase 1: Data Preprocessing ─────────────────────────────────")
    df = load_raw_data(path)
    df = handle_missing_values(df)
    df = encode_categoricals(df)
    df = engineer_features(df)
    log.info("── Phase 1 complete ─────────────────────────────────────────────")
    return df


# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — PSEUDO LABEL GENERATION
# ══════════════════════════════════════════════════════════════════════════════

def _clip_normalise(series: pd.Series, max_val: float) -> pd.Series:
    """
    Normalise a distress metric to [0, 1] using a known engineering ceiling.
    Values above the ceiling are clipped to 1.0 (fully distressed).
    """
    return (series.clip(lower=0, upper=max_val) / max_val).astype(float)


def compute_pdi(df: pd.DataFrame) -> pd.Series:
    """
    Pavement Distress Index (PDI) — deterministic, engineering-based.

    PDI = Σ  weight_i × normalised_distress_i
    PDI is then scaled to [0, 100] where 100 = maximally damaged.

    The normalisation uses fixed domain ceilings (DISTRESS_MAX) so the
    formula remains stable across different dataset samples.
    """
    weighted_sum = pd.Series(np.zeros(len(df)), index=df.index)

    for col, weight in PDI_WEIGHTS.items():
        normalised = _clip_normalise(df[col], DISTRESS_MAX[col])
        weighted_sum += weight * normalised

    # Scale to 0–100
    pdi = (weighted_sum * 100).clip(0, 100)
    return pdi


def generate_pseudo_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Attach PDI and Pseudo_CIBIL columns to the DataFrame.

    Pseudo_CIBIL = 100 - PDI
      → 100 means perfect road (zero distress)
      →   0 means maximum distress

    This inverted scale mirrors a credit score: higher is better.
    """
    log.info("── Phase 2: Pseudo-Label Generation ────────────────────────────")
    df = df.copy()

    df["PDI"]          = compute_pdi(df).round(2)
    df["Pseudo_CIBIL"] = (100 - df["PDI"]).clip(0, 100).round(2)

    log.info(f"  PDI          → mean={df['PDI'].mean():.1f}  "
             f"std={df['PDI'].std():.1f}")
    log.info(f"  Pseudo_CIBIL → mean={df['Pseudo_CIBIL'].mean():.1f}  "
             f"std={df['Pseudo_CIBIL'].std():.1f}")
    log.info("── Phase 2 complete ─────────────────────────────────────────────")
    return df


# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 3 — SUPERVISED REGRESSION MODEL
# ══════════════════════════════════════════════════════════════════════════════

def train_rf_model(
    df: pd.DataFrame,
    feature_cols: list[str],
    target_col: str = "Pseudo_CIBIL",
    test_size: float = 0.2,
    random_state: int = 42,
) -> tuple[RandomForestRegressor, pd.DataFrame, dict]:
    """
    Train a RandomForestRegressor on (X → Pseudo_CIBIL).

    Parameters
    ----------
    df           : fully preprocessed + pseudo-labelled DataFrame
    feature_cols : list of model feature column names
    target_col   : column to predict (default: Pseudo_CIBIL)
    test_size    : fraction held-out for evaluation
    random_state : reproducibility seed

    Returns
    -------
    model        : fitted RandomForestRegressor
    test_df      : DataFrame of test rows with true & predicted values
    metrics      : dict {MAE, RMSE, R²}
    """
    log.info("── Phase 3: Supervised Regression Model ────────────────────────")

    X = df[feature_cols].copy()
    y = df[target_col].copy()

    # Scale features for RF (optional but keeps pipeline consistent)
    scaler = MinMaxScaler()
    X_scaled = pd.DataFrame(
        scaler.fit_transform(X),
        columns=feature_cols,
        index=X.index,
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y,
        test_size=test_size,
        random_state=random_state,
    )

    model = RandomForestRegressor(
        n_estimators=200,
        max_depth=15,
        min_samples_leaf=4,
        n_jobs=-1,
        random_state=random_state,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)

    mae  = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2   = r2_score(y_test, y_pred)

    metrics = {"MAE": round(mae, 4), "RMSE": round(rmse, 4), "R²": round(r2, 4)}

    log.info(f"  MAE  = {metrics['MAE']}")
    log.info(f"  RMSE = {metrics['RMSE']}")
    log.info(f"  R²   = {metrics['R²']}")

    test_df = X_test.copy()
    test_df["y_true"] = y_test.values
    test_df["y_pred"] = y_pred

    # Store scaler on model object for inference convenience
    model._scaler      = scaler
    model._feature_cols = feature_cols

    log.info("── Phase 3 complete ─────────────────────────────────────────────")
    return model, test_df, metrics


def predict_full_dataset(
    model: RandomForestRegressor,
    df: pd.DataFrame,
    feature_cols: list[str],
) -> np.ndarray:
    """
    Run inference on the full dataset using the fitted model + scaler.
    Returns an array of ML-predicted CIBIL scores.
    """
    X = df[feature_cols].copy()
    X_scaled = pd.DataFrame(
        model._scaler.transform(X),
        columns=feature_cols,
        index=X.index,
    )
    return model.predict(X_scaled)


# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 4 — FEATURE IMPORTANCE
# ══════════════════════════════════════════════════════════════════════════════

def plot_feature_importance(
    model: RandomForestRegressor,
    feature_cols: list[str],
    top_n: int = 20,
    save_path: str | None = None,
) -> pd.DataFrame:
    """
    Extract and plot the top-N most important features from the
    RandomForestRegressor using built-in impurity-based importance.

    Returns a ranked DataFrame of (feature, importance).
    """
    log.info("── Phase 4: Feature Importance ─────────────────────────────────")

    importance_df = pd.DataFrame({
        "feature"   : feature_cols,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False).reset_index(drop=True)

    top_df = importance_df.head(top_n)

    fig, ax = plt.subplots(figsize=(10, 7))
    sns.barplot(
        data=top_df,
        x="importance",
        y="feature",
        palette="viridis",
        ax=ax,
    )
    ax.set_title(f"Top {top_n} Feature Importances — Road CIBIL Model",
                 fontsize=13, fontweight="bold")
    ax.set_xlabel("Mean Decrease in Impurity (MDI)")
    ax.set_ylabel("")
    plt.tight_layout()

    path = save_path or os.path.join(PLOT_DIR, "feature_importance.png")
    fig.savefig(path, dpi=150)
    plt.close(fig)
    log.info(f"  Feature importance plot saved → {path}")
    log.info("── Phase 4 complete ─────────────────────────────────────────────")
    return importance_df


def compute_shap_values(
    model: RandomForestRegressor,
    df: pd.DataFrame,
    feature_cols: list[str],
    sample_n: int = 500,
    save_path: str | None = None,
) -> None:
    """
    Generate a SHAP summary plot for a random sample of roads.
    Gracefully skips if SHAP is unavailable or fails.
    """
    try:
        import shap  # optional dependency

        log.info("  Computing SHAP values (this may take ~30 s)…")
        X = df[feature_cols].copy()
        X_scaled = pd.DataFrame(
            model._scaler.transform(X),
            columns=feature_cols,
            index=X.index,
        )
        sample = X_scaled.sample(n=min(sample_n, len(X_scaled)), random_state=42)
        explainer   = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(sample)

        fig, ax = plt.subplots(figsize=(10, 8))
        shap.summary_plot(
            shap_values, sample,
            show=False,
            plot_type="bar",
        )
        path = save_path or os.path.join(PLOT_DIR, "shap_summary.png")
        plt.savefig(path, dpi=150, bbox_inches="tight")
        plt.close()
        log.info(f"  SHAP summary saved → {path}")

    except Exception as e:
        log.warning(f"  SHAP computation skipped: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — HYBRID CIBIL SCORING
# ══════════════════════════════════════════════════════════════════════════════

def assign_condition_category(score: float) -> str:
    """
    Map a CIBIL score to a human-readable road condition category.

    Bands:
      80–100 → Good
      60–79  → Fair
      40–59  → Poor
      0–39   → Critical
    """
    if score >= 80:
        return "Good"
    elif score >= 60:
        return "Fair"
    elif score >= 40:
        return "Poor"
    else:
        return "Critical"


def compute_hybrid_cibil(
    df: pd.DataFrame,
    ml_predictions: np.ndarray,
    pseudo_weight: float = 0.7,
    ml_weight: float = 0.3,
) -> pd.DataFrame:
    """
    Blend deterministic PDI-based score with ML-predicted score.

    Final_CIBIL = pseudo_weight × Pseudo_CIBIL
                + ml_weight    × ML_Predicted_CIBIL

    Default blend: 70 % deterministic (engineering transparency)
                   30 % ML           (nonlinear refinement)

    Returns the DataFrame with new columns:
      ML_Predicted_CIBIL, Final_CIBIL, Condition_Category
    """
    log.info("── Phase 5: Hybrid CIBIL Scoring ───────────────────────────────")
    assert abs(pseudo_weight + ml_weight - 1.0) < 1e-9, \
        "pseudo_weight + ml_weight must equal 1.0"

    df = df.copy()
    df["ML_Predicted_CIBIL"] = np.clip(ml_predictions, 0, 100).round(2)

    df["Final_CIBIL"] = (
        pseudo_weight * df["Pseudo_CIBIL"]
        + ml_weight   * df["ML_Predicted_CIBIL"]
    ).clip(0, 100).round(2)

    df["Condition_Category"] = df["Final_CIBIL"].apply(assign_condition_category)

    category_dist = df["Condition_Category"].value_counts()
    log.info(f"  Final_CIBIL  → mean={df['Final_CIBIL'].mean():.1f}  "
             f"std={df['Final_CIBIL'].std():.1f}")
    log.info(f"  Condition distribution:\n{category_dist.to_string()}")
    log.info("── Phase 5 complete ─────────────────────────────────────────────")
    return df


# ══════════════════════════════════════════════════════════════════════════════
#  PHASE 6 — OUTPUT MODULE
# ══════════════════════════════════════════════════════════════════════════════

def build_output_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Assemble the final, export-ready DataFrame containing road identifiers
    and all scoring columns. Sorted descending by Final_CIBIL.
    """
    log.info("── Phase 6: Output Module ───────────────────────────────────────")

    id_cols = []
    for col in ["road_id", "name", "geojson_id", "highway_ref",
                "segment_number", "segment_start_km", "segment_end_km",
                "length_km", "district", "taluka"]:
        if col in df.columns:
            id_cols.append(col)

    score_cols = ["PDI", "Pseudo_CIBIL", "ML_Predicted_CIBIL",
                  "Final_CIBIL", "Condition_Category"]

    output_df = (
        df[id_cols + score_cols]
        .sort_values("Final_CIBIL", ascending=False)
        .reset_index(drop=True)
    )

    log.info(f"  Output dataframe: {output_df.shape[0]:,} rows × "
             f"{output_df.shape[1]} columns")
    return output_df


def export_results(output_df: pd.DataFrame, path: str = OUTPUT_CSV) -> str:
    """
    Export the final scoring DataFrame to CSV. Returns the file path.
    """
    output_df.to_csv(path, index=False)
    log.info(f"  Results exported → {path}")
    return path


# ══════════════════════════════════════════════════════════════════════════════
#  VISUALISATIONS — DIAGNOSTICS & REPORTING
# ══════════════════════════════════════════════════════════════════════════════

def plot_score_distributions(df: pd.DataFrame) -> None:
    """
    Side-by-side KDE plots of PDI, Pseudo_CIBIL, ML_Predicted_CIBIL,
    and Final_CIBIL for visual sanity-checking.
    """
    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    fig.suptitle("Road CIBIL Scoring — Score Distributions",
                 fontsize=14, fontweight="bold")

    pairs = [
        ("PDI",                "PDI (0=pristine, 100=destroyed)", "tomato"),
        ("Pseudo_CIBIL",       "Pseudo CIBIL",                    "steelblue"),
        ("ML_Predicted_CIBIL", "ML Predicted CIBIL",              "mediumseagreen"),
        ("Final_CIBIL",        "Final Hybrid CIBIL",              "darkorange"),
    ]
    for ax, (col, title, color) in zip(axes.flat, pairs):
        ax.hist(df[col], bins=40, color=color, edgecolor="white", alpha=0.85)
        ax.axvline(df[col].mean(), color="black", linestyle="--",
                   linewidth=1.2, label=f"mean={df[col].mean():.1f}")
        ax.set_title(title, fontsize=11)
        ax.set_xlabel("Score")
        ax.set_ylabel("Count")
        ax.legend(fontsize=9)

    plt.tight_layout()
    path = os.path.join(PLOT_DIR, "score_distributions.png")
    fig.savefig(path, dpi=150)
    plt.close(fig)
    log.info(f"  Score distributions plot saved → {path}")


def plot_condition_pie(df: pd.DataFrame) -> None:
    """
    Pie chart of road condition category breakdown.
    """
    counts = df["Condition_Category"].value_counts()
    colors = {
        "Good"    : "#2ecc71",
        "Fair"    : "#f39c12",
        "Poor"    : "#e67e22",
        "Critical": "#e74c3c",
    }
    pie_colors = [colors.get(c, "#bdc3c7") for c in counts.index]

    fig, ax = plt.subplots(figsize=(7, 7))
    wedges, texts, autotexts = ax.pie(
        counts.values,
        labels=counts.index,
        colors=pie_colors,
        autopct="%1.1f%%",
        startangle=140,
        pctdistance=0.82,
    )
    for at in autotexts:
        at.set_fontsize(11)
    ax.set_title("Road Condition Category Distribution\n(Maharashtra Highway Network)",
                 fontsize=12, fontweight="bold")

    path = os.path.join(PLOT_DIR, "condition_pie.png")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    log.info(f"  Condition pie chart saved → {path}")


def plot_predicted_vs_actual(test_df: pd.DataFrame) -> None:
    """
    Scatter plot of RF predictions vs. pseudo-label actuals on the test set.
    """
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(test_df["y_true"], test_df["y_pred"],
               alpha=0.3, s=10, color="steelblue", label="Test samples")
    lims = [0, 100]
    ax.plot(lims, lims, "r--", linewidth=1.5, label="Perfect prediction")
    ax.set_xlim(lims); ax.set_ylim(lims)
    ax.set_xlabel("Pseudo_CIBIL (actual)")
    ax.set_ylabel("RF Predicted CIBIL")
    ax.set_title("Predicted vs. Actual — Test Set", fontsize=12, fontweight="bold")
    ax.legend()
    plt.tight_layout()

    path = os.path.join(PLOT_DIR, "predicted_vs_actual.png")
    fig.savefig(path, dpi=150)
    plt.close(fig)
    log.info(f"  Predicted vs. actual plot saved → {path}")


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════════════════

def run_pipeline(data_path: str = DATA_PATH) -> dict:
    """
    Execute the full Road CIBIL Scoring pipeline end-to-end.

    Returns
    -------
    A result dictionary containing:
      - output_df   : final scoring DataFrame
      - metrics     : model evaluation metrics
      - importance  : feature importance DataFrame
      - output_csv  : path to exported CSV
    """
    log.info("╔══════════════════════════════════════════════════════════╗")
    log.info("║   ROAD CIBIL SCORING MODULE — PIPELINE START            ║")
    log.info("╚══════════════════════════════════════════════════════════╝")

    # ── Phase 1: Preprocessing ────────────────────────────────────────────
    df = preprocess_pipeline(data_path)

    # ── Phase 2: Pseudo labels ───────────────────────────────────────────
    df = generate_pseudo_labels(df)

    # ── Build feature matrix ─────────────────────────────────────────────
    X_df, feature_cols = build_feature_matrix(df)

    # Re-attach to df so train_rf_model can slice correctly
    for col in feature_cols:
        if col not in df.columns:
            df[col] = X_df[col]

    # ── Phase 3: Train model ─────────────────────────────────────────────
    model, test_df, metrics = train_rf_model(df, feature_cols)

    # ── Phase 4: Feature importance + SHAP ───────────────────────────────
    importance_df = plot_feature_importance(model, feature_cols)
    compute_shap_values(model, df, feature_cols)

    # ── Phase 5: Hybrid scoring ───────────────────────────────────────────
    ml_preds = predict_full_dataset(model, df, feature_cols)
    df       = compute_hybrid_cibil(df, ml_preds)

    # ── Diagnostics plots ────────────────────────────────────────────────
    plot_score_distributions(df)
    plot_condition_pie(df)
    plot_predicted_vs_actual(test_df)

    # ── Phase 6: Output ──────────────────────────────────────────────────
    output_df  = build_output_dataframe(df)
    output_csv = export_results(output_df)

    # ── Summary ──────────────────────────────────────────────────────────
    log.info("╔══════════════════════════════════════════════════════════╗")
    log.info("║   PIPELINE COMPLETE                                      ║")
    log.info("╚══════════════════════════════════════════════════════════╝")
    log.info(f"  MAE  = {metrics['MAE']}")
    log.info(f"  RMSE = {metrics['RMSE']}")
    log.info(f"  R²   = {metrics['R²']}")
    log.info(f"  Output CSV → {output_csv}")

    return {
        "output_df"  : output_df,
        "metrics"    : metrics,
        "importance" : importance_df,
        "output_csv" : output_csv,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    results = run_pipeline()

    print("\n" + "=" * 60)
    print("  MODEL EVALUATION METRICS")
    print("=" * 60)
    for k, v in results["metrics"].items():
        print(f"  {k:<6} = {v}")

    print("\n" + "=" * 60)
    print("  TOP 10 ROADS BY FINAL CIBIL SCORE")
    print("=" * 60)
    print(results["output_df"].head(10).to_string(index=False))

    print("\n" + "=" * 60)
    print("  CONDITION CATEGORY SUMMARY")
    print("=" * 60)
    print(results["output_df"]["Condition_Category"].value_counts().to_string())

    print(f"\n  Full results saved to: {results['output_csv']}")
    print(f"  Plots saved to       : {os.path.join(BASE_DIR, 'plots')}")
