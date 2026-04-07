from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.models.user import User
from app.services.auth_service import verify_password, create_access_token
from app.dependencies import get_current_user
from fastapi import Depends

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return LoginResponse(
        access_token=token,
        user={
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
            "company_id": str(user.company_id) if user.company_id else None,
        },
    )


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.value,
        "company_id": str(current_user.company_id) if current_user.company_id else None,
    }


@router.post("/logout")
async def logout():
    return {"message": "Logged out"}
