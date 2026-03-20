from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.schemas.user_schema import UserCreate, UserResponse, UserUpdate, Token
from app.services.auth_service import create_user, authenticate_user, get_user_by_email
from app.services.microsoft_oauth_service import microsoft_oauth_service
from app.utils.jwt_handler import create_access_token, verify_token
from app.utils.hashing import get_password_hash
from app.models.user import User, UserRole
from app.config import settings
import secrets

router = APIRouter(prefix="/auth", tags=["auth"])


def _require_senior_signup_key(role: UserRole, provided_key: Optional[str]) -> None:
    """Raise HTTPException if role is senior and key is missing or invalid."""
    if role != UserRole.SENIOR:
        return
    if not settings.SENIOR_SIGNUP_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Senior signup is not configured",
        )
    if not provided_key or provided_key.strip() != settings.SENIOR_SIGNUP_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid senior signup key",
        )
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Pydantic models for Microsoft OAuth
class MicrosoftCallbackRequest(BaseModel):
    code: str
    redirect_uri: str
    action: Optional[str] = "login"  # "login" or "signup"
    role: Optional[str] = "employee"  # Default role for new users
    senior_signup_key: Optional[str] = None  # required when creating account as senior

class MicrosoftAuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token, credentials_exception)
    user = await get_user_by_email(db, email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

@router.post("/signup", response_model=UserResponse)
async def signup(user: UserCreate, db: AsyncSession = Depends(get_db)):
    _require_senior_signup_key(user.role, getattr(user, "senior_signup_key", None))
    db_user = await get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return await create_user(db, user)

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # The role enum needs to be converted to string if it isn't already handled by Pydantic
    access_token = create_access_token(data={"sub": user.email, "role": user.role.value}) 
    return {"access_token": access_token, "token_type": "bearer"}

# --- MICROSOFT OAUTH ENDPOINTS ---

@router.get("/microsoft/config")
async def get_microsoft_config():
    """Get Microsoft OAuth configuration for frontend."""
    config = microsoft_oauth_service.get_config()
    if not config["configured"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft OAuth is not configured"
        )
    return config

@router.post("/microsoft/callback")
async def microsoft_callback(
    callback_data: MicrosoftCallbackRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Microsoft OAuth callback.
    Exchanges authorization code for tokens and creates or logs in user.
    """
    if not microsoft_oauth_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft OAuth is not configured"
        )
    
    try:
        # Exchange code for token
        token_response = await microsoft_oauth_service.exchange_code_for_token(
            code=callback_data.code,
            redirect_uri=callback_data.redirect_uri
        )
        
        ms_access_token = token_response.get("access_token")
        if not ms_access_token:
            raise HTTPException(status_code=400, detail="No access token received from Microsoft")
        
        # Get user info from Microsoft Graph
        ms_user_info = await microsoft_oauth_service.get_user_info(ms_access_token)
        
        email = ms_user_info.get("mail") or ms_user_info.get("userPrincipalName")
        if not email:
            raise HTTPException(status_code=400, detail="Could not get email from Microsoft account")
        
        # Normalize email to lowercase
        email = email.lower()
        
        # Get display name
        display_name = ms_user_info.get("displayName") or ms_user_info.get("givenName", "User")
        
        # Check if user exists
        existing_user = await get_user_by_email(db, email=email)
        
        if existing_user:
            # User exists - log them in
            user = existing_user
        else:
            # User doesn't exist - create new account
            # Generate a random password (user won't use it - they login via Microsoft)
            random_password = secrets.token_urlsafe(32)
            hashed_password = get_password_hash(random_password)
            
            # Determine role - default to employee for new Microsoft signups
            role_str = callback_data.role or "employee"
            try:
                role = UserRole(role_str)
            except ValueError:
                role = UserRole.EMPLOYEE
            
            _require_senior_signup_key(role, callback_data.senior_signup_key)
            
            # Create new user
            user = User(
                email=email,
                full_name=display_name,
                hashed_password=hashed_password,
                role=role,
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        # Create our JWT token
        access_token = create_access_token(data={"sub": user.email, "role": user.role.value})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
                "is_active": user.is_active,
                "created_at": user.created_at
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Microsoft authentication failed: {str(e)}"
        )


# --- GOOGLE OAUTH ENDPOINTS ---
from app.services.google_oauth_service import GoogleOAuthService

google_oauth_service = GoogleOAuthService()

class GoogleCallbackRequest(BaseModel):
    code: str
    redirect_uri: str
    action: Optional[str] = "login"
    role: Optional[str] = "intern"
    senior_signup_key: Optional[str] = None  # required when creating account as senior

@router.get("/google/config")
async def get_google_config():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    return {"client_id": settings.GOOGLE_CLIENT_ID}

@router.post("/google/callback")
async def google_callback(
    callback_data: GoogleCallbackRequest,
    db: AsyncSession = Depends(get_db)
):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    
    try:
        token_response = await google_oauth_service.get_access_token(
            code=callback_data.code,
            redirect_uri=callback_data.redirect_uri
        )
        if not token_response:
             raise HTTPException(status_code=400, detail="Failed to retrieve Google token")
             
        access_token = token_response.get("access_token")
        
        user_info = await google_oauth_service.get_user_info(access_token)
        if not user_info:
             raise HTTPException(status_code=400, detail="Failed to retrieve Google user info")
             
        email = user_info.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="No email provided by Google")
        
        email = email.lower()
        
        # Enforce Gmail restriction for Inter role if user is signing up as Intern
        # Or if login is attempted for an Intern user.
        # But here we just get email.
        # Logic: If role requested is Intern, MUST be Gmail?
        # User said: "interns can only login through gmail".
        # This implies if you are an Intern, you better be using Google.
        # And if you use Google... should we restrict to @gmail.com?
        # "login through gmail" usually means "Using Google Account".
        # Many Google accounts are @gmail.com, but some are Workspace.
        # I will enforce @gmail.com ONLY IF the role is INTERN.
        
        role_str = callback_data.role or "intern"
        
        if role_str == "intern" and not email.endswith("@gmail.com"):
             raise HTTPException(status_code=403, detail="Interns must use a @gmail.com account")

        display_name = user_info.get("name", "Google User")
        
        existing_user = await get_user_by_email(db, email=email)
        
        if existing_user:
            user = existing_user
            # If user is logging in specifically as Intern via Google, ensure their role is set to Intern
            # This handles the case where they might have been created as Employee before
            if role_str == "intern" and user.role != UserRole.INTERN:
                 user.role = UserRole.INTERN
                 db.add(user)
                 await db.commit()
                 await db.refresh(user)
        else:
             random_password = secrets.token_urlsafe(32)
             hashed_password = get_password_hash(random_password)
             
             try:
                role = UserRole(role_str)
             except ValueError:
                role = UserRole.INTERN # Default for Google flow? Or stick to input.
             
             _require_senior_signup_key(role, callback_data.senior_signup_key)
             
             user = User(
                email=email,
                full_name=display_name,
                hashed_password=hashed_password,
                role=role,
                is_active=True
            )
             db.add(user)
             await db.commit()
             await db.refresh(user)
             
        access_token = create_access_token(data={"sub": user.email, "role": user.role.value})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role.value,
                "is_active": user.is_active,
                "created_at": user.created_at
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google authentication failed: {str(e)}"
        )

# --- EXISTING ENDPOINTS ---

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

async def _do_update_profile(update: UserUpdate, current_user: User, db: AsyncSession):
    """Shared logic for PATCH/POST profile update."""
    changed = False
    if update.full_name is not None:
        name = (update.full_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        current_user.full_name = name
        changed = True
    if update.office is not None:
        office = (update.office or "").strip().lower()
        if office == "igen":
            office = "eigen"
        if office not in ("panscience", "eigen"):
            raise HTTPException(status_code=400, detail="Office must be 'panscience' or 'eigen'")
        current_user.office = office
        changed = True
    if update.joining_date is not None:
        current_user.joining_date = update.joining_date
        changed = True
    if update.is_on_probation is not None:
        current_user.is_on_probation = update.is_on_probation
        changed = True
    if changed:
        db.add(current_user)
        await db.commit()
        await db.refresh(current_user)
    return current_user

@router.patch("/me", response_model=UserResponse)
async def update_profile_patch(update: UserUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Update current user's profile (e.g. display name). PATCH method."""
    return await _do_update_profile(update, current_user, db)

@router.post("/me", response_model=UserResponse)
async def update_profile_post(update: UserUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Update current user's profile. POST supported for proxies that block PATCH."""
    return await _do_update_profile(update, current_user, db)

@router.get("/users", response_model=list[UserResponse])
async def get_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy.future import select
    from sqlalchemy import or_
    
    # Only managers and seniors can access this
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Return all users that a manager or senior should see in their directories
    # This includes Employees, Interns, and other Managers/Seniors
    allowed_roles = [UserRole.EMPLOYEE, UserRole.INTERN, UserRole.MANAGER, UserRole.SENIOR]
    
    result = await db.execute(select(User).filter(User.role.in_(allowed_roles)))
    users = result.scalars().all()
    return users

@router.get("/all-users", response_model=list[UserResponse])
async def get_all_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy.future import select
    
    # Organization directory: return all users except current user.
    # Include all roles (employees, interns, managers, and other seniors).
    result = await db.execute(select(User).filter(User.id != current_user.id))
    users = result.scalars().all()
    return users

@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy.future import select
    from sqlalchemy import update, delete
    
    # Only seniors can delete users
    if current_user.role != UserRole.SENIOR:
        raise HTTPException(status_code=403, detail="Only seniors can delete credentials")
    
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent senior from deleting themselves (though id check in UI/backend is good)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    try:
        # Handle related records before deleting user
        from app.models.task import TaskComment, Task
        await db.execute(delete(TaskComment).where(TaskComment.user_id == user_id))
        await db.execute(update(Task).where(Task.assigned_to_id == user_id).values(assigned_to_id=None))
        await db.execute(update(Task).where(Task.created_by_id == user_id).values(created_by_id=None))
        
        from app.models.notification import notification_acknowledgments, notification_recipients, Notification
        await db.execute(delete(notification_acknowledgments).where(notification_acknowledgments.c.user_id == user_id))
        await db.execute(delete(notification_recipients).where(notification_recipients.c.user_id == user_id))
        await db.execute(update(Notification).where(Notification.created_by_id == user_id).values(created_by_id=None))
        
        from app.models.policy import policy_acknowledgments
        await db.execute(delete(policy_acknowledgments).where(policy_acknowledgments.c.user_id == user_id))
        
        from app.models.concern import Concern, concern_acknowledgments, concern_notified_users
        await db.execute(delete(concern_acknowledgments).where(concern_acknowledgments.c.user_id == user_id))
        await db.execute(delete(concern_notified_users).where(concern_notified_users.c.user_id == user_id))
        await db.execute(update(Concern).where(Concern.raised_by_id == user_id).values(raised_by_id=None))
        await db.execute(update(Concern).where(Concern.resolved_by_id == user_id).values(resolved_by_id=None))
        
        from app.models.attendance import Attendance, AttendanceUpdateRequest
        await db.execute(delete(Attendance).where(Attendance.user_id == user_id))
        await db.execute(delete(AttendanceUpdateRequest).where(AttendanceUpdateRequest.user_id == user_id))
        await db.execute(delete(AttendanceUpdateRequest).where(AttendanceUpdateRequest.manager_id == user_id))
        
        from app.models.leave import LeaveRequest
        await db.execute(update(LeaveRequest).where(LeaveRequest.approved_by_id == user_id).values(approved_by_id=None))
        await db.execute(delete(LeaveRequest).where(LeaveRequest.user_id == user_id))
        
        from app.models.custom_leave_policy import CustomLeavePolicy
        from app.models.holiday import Holiday
        from app.models.policy import Policy
        from app.models.venture import Venture
        await db.execute(update(CustomLeavePolicy).where(CustomLeavePolicy.created_by_id == user_id).values(created_by_id=current_user.id))
        await db.execute(update(Holiday).where(Holiday.created_by_id == user_id).values(created_by_id=current_user.id))
        await db.execute(update(Policy).where(Policy.created_by_id == user_id).values(created_by_id=None))
        await db.execute(update(Venture).where(Venture.created_by == user_id).values(created_by=current_user.id))
        
        await db.delete(user)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Could not delete user credentials: {str(e)}"
        )
    return {"message": "User credentials deleted successfully"}

