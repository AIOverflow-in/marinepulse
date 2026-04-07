from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from beanie import PydanticObjectId

from app.models.user import User, UserRole
from app.dependencies import require_role
from app.services.auth_service import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole
    company_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    company_id: Optional[str] = None


def user_to_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "company_id": str(u.company_id) if u.company_id else None,
        "is_active": u.is_active,
        "avatar_url": u.avatar_url,
        "created_at": u.created_at.isoformat(),
    }


@router.get("")
async def list_users(
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    filters = []
    if search:
        filters.append({"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]})
    if role:
        filters.append({"role": role})

    query = User.find(*filters) if filters else User.find_all()
    total = await query.count()
    users = await query.skip(skip).limit(limit).to_list()
    return {"items": [user_to_dict(u) for u in users], "total": total, "skip": skip, "limit": limit}


@router.post("")
async def create_user(
    body: UserCreate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    existing = await User.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        company_id=PydanticObjectId(body.company_id) if body.company_id else None,
    )
    await user.insert()
    return user_to_dict(user)


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_to_dict(user)


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if "company_id" in update:
        update["company_id"] = PydanticObjectId(update["company_id"])
    if update:
        await user.set(update)
    return user_to_dict(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(require_role(UserRole.consultancy_admin)),
):
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await user.set({"is_active": False})
    return {"message": "User deactivated"}
