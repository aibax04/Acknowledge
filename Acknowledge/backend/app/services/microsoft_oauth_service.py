"""
Microsoft OAuth2 Service for handling Azure AD authentication.
Supports both login and signup flows with Microsoft accounts.
"""
import httpx
from typing import Optional, Dict, Any
from app.config import settings

MICROSOFT_AUTHORITY = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}"
MICROSOFT_TOKEN_URL = f"{MICROSOFT_AUTHORITY}/oauth2/v2.0/token"
MICROSOFT_GRAPH_URL = "https://graph.microsoft.com/v1.0/me"

class MicrosoftOAuthService:
    """Service for handling Microsoft OAuth2 authentication."""
    
    def __init__(self):
        self.client_id = settings.MICROSOFT_CLIENT_ID
        self.client_secret = settings.MICROSOFT_CLIENT_SECRET
        self.tenant_id = settings.MICROSOFT_TENANT_ID
    
    def is_configured(self) -> bool:
        """Check if Microsoft OAuth is properly configured."""
        return bool(self.client_id and self.client_secret)
    
    def get_config(self) -> Dict[str, Any]:
        """Get public configuration for frontend."""
        return {
            "client_id": self.client_id,
            "tenant_id": self.tenant_id,
            "configured": self.is_configured()
        }
    
    async def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access token.
        
        Args:
            code: The authorization code from Microsoft
            redirect_uri: The redirect URI used in the authorization request
            
        Returns:
            Token response containing access_token, id_token, etc.
        """
        if not self.is_configured():
            raise ValueError("Microsoft OAuth is not configured")
        
        token_data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": "openid profile email User.Read"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                MICROSOFT_TOKEN_URL,
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                error_data = response.json()
                error_desc = error_data.get("error_description", "Token exchange failed")
                raise Exception(f"Token exchange failed: {error_desc}")
            
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get user information from Microsoft Graph API.
        
        Args:
            access_token: The Microsoft access token
            
        Returns:
            User profile information
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                MICROSOFT_GRAPH_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if response.status_code != 200:
                raise Exception("Failed to get user information from Microsoft")
            
            return response.json()

# Global service instance
microsoft_oauth_service = MicrosoftOAuthService()
