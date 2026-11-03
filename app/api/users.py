import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles, require_primary_admin
from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_primary_admin)],
)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    """Primary-admin only: create a staff account (pharmacist, cashier, inventory
    manager, or another admin)."""

    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken"
        )

    user = User(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_primary_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get(
    "",
    response_model=list[UserOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)
def list_users(db: Session = Depends(get_db)):
    """List all staff accounts."""
    return db.scalars(select(User).order_by(User.created_at)).all()


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(require_primary_admin)],
)
def update_user(user_id: uuid.UUID, payload: UserUpdate, db: Session = Depends(get_db)):
    """Primary-admin only: update staff account details, role, status, or password."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.is_primary_admin:
        if payload.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary owner account cannot be deactivated",
            )
        if payload.role is not None and payload.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary owner role cannot be changed from Admin",
            )

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None and payload.password.strip():
        user.password_hash = hash_password(payload.password.strip())

    db.commit()
    db.refresh(user)
    return user


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_primary_admin)],
)
def delete_user(
    user_id: uuid.UUID,
    permanent: bool = False,
    db: Session = Depends(get_db),
):
    """Primary-admin only: delete a staff account.
    If permanent=True, permanently removes the user account from the database.
    If permanent=False (default for backwards compatibility), deactivates the account.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.is_primary_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary owner account cannot be deactivated or deleted",
        )

    if permanent:
        db.delete(user)
    else:
        user.is_active = False
    db.commit()
    return None
