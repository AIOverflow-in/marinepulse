from typing import List, Dict, Any


def compute_audit_score(scores: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute audit score matching Yatendra's Excel workbook logic.
    - Numeric scores 0-5 are included in calculations
    - "NS" (Not Sighted) items are excluded from max score and average
    - None (unscored) items are excluded
    """
    numeric = [s for s in scores if isinstance(s.get("score"), int)]
    ns_count = sum(1 for s in scores if s.get("score") == "NS")

    total_assessed = len(numeric)
    total_ns = ns_count
    max_score = total_assessed * 5
    total_score = sum(s["score"] for s in numeric)
    average = round(total_score / total_assessed, 2) if total_assessed > 0 else 0.0
    percentage = round((total_score / max_score) * 100, 2) if max_score > 0 else 0.0

    # Per-category breakdown
    cat_data: Dict[tuple, Dict] = {}
    for s in numeric:
        cat = s["category"]
        atype = s.get("assessment_type", "static")
        key = (atype, cat)
        if key not in cat_data:
            cat_data[key] = {"scores": [], "assessment_type": atype, "category": cat}
        cat_data[key]["scores"].append(s["score"])

    category_summary = []
    for data in cat_data.values():
        cat_scores = data["scores"]
        cat_assessed = len(cat_scores)
        cat_total = sum(cat_scores)
        category_summary.append({
            "assessment_type": data["assessment_type"],
            "category": data["category"],
            "subjects_assessed": cat_assessed,
            "average_score": round(cat_total / cat_assessed, 2),
            "percentage_score": round((cat_total / (cat_assessed * 5)) * 100, 2),
        })

    return {
        "total_subjects": len(scores),
        "total_assessed": total_assessed,
        "total_ns": total_ns,
        "max_score": max_score,
        "total_score": total_score,
        "average": average,
        "percentage": percentage,
        "category_summary": category_summary,
    }


# Legacy alias — kept so existing callers don't break
def compute_vhi(scores: List[Dict[str, Any]]) -> float:
    return compute_audit_score(scores)["percentage"]


def grade_from_vhi(score: float) -> str:
    """Map percentage score to a grade letter."""
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 50:
        return "C"
    if score >= 35:
        return "D"
    return "F"
