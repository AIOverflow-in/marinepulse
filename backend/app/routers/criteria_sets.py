from fastapi import APIRouter, Depends
from beanie import PydanticObjectId

from app.dependencies import get_current_user
from app.models.criteria_set import CriteriaSet
from app.models.user import User

router = APIRouter(prefix="/api/criteria-sets", tags=["criteria-sets"])


def _serialize(cs: CriteriaSet) -> dict:
    return {
        "id": str(cs.id),
        "name": cs.name,
        "description": cs.description,
        "is_default": cs.is_default,
        "criteria_count": len(cs.criteria),
        "company_id": str(cs.company_id) if cs.company_id else None,
        "created_at": cs.created_at.isoformat(),
    }


@router.get("")
async def list_criteria_sets(
    current_user: User = Depends(get_current_user),
):
    """Return all criteria sets visible to the user: global (no company) + company-specific."""
    company_id = current_user.company_id or current_user.id

    all_sets = await CriteriaSet.find().sort(-CriteriaSet.is_default).to_list()
    visible = [
        cs for cs in all_sets
        if cs.company_id is None or str(cs.company_id) == str(company_id)
    ]

    return [_serialize(cs) for cs in visible]


@router.get("/{criteria_set_id}")
async def get_criteria_set(
    criteria_set_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return a single criteria set including its full criteria list."""
    from fastapi import HTTPException
    cs = await CriteriaSet.get(criteria_set_id)
    if not cs:
        raise HTTPException(status_code=404, detail="Criteria set not found")

    d = _serialize(cs)
    d["criteria"] = [
        {"id": c.id, "category": c.category, "label": c.label, "priority": c.priority}
        for c in cs.criteria
    ]
    return d
