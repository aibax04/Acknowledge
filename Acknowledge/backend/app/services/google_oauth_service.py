
import os
import httpx
from fastapi import Request
from app.config import settings

class GoogleOAuthService:
    def __init__(self):
        self.client_id = settings.GOOGLE_CLIENT_ID
        self.client_secret = settings.GOOGLE_CLIENT_SECRET
        self.token_url = "https://oauth2.googleapis.com/token"
        self.user_info_url = "https://www.googleapis.com/oauth2/v2/userinfo"

    async def get_access_token(self, code: str, redirect_uri: str) -> dict:
        """Exchange the authorization code for an access token."""
        async with httpx.AsyncClient() as client:
            data = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code"
            }
            response = await client.post(self.token_url, data=data)
            
            if response.status_code != 200:
                print(f"Google Token Error: {response.text}")
                return None
            
            return response.json()

    async def get_user_info(self, access_token: str) -> dict:
        """Fetch user profile information using the access token."""
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"Bearer {access_token}"}
            response = await client.get(self.user_info_url, headers=headers)
            
            if response.status_code != 200:
                print(f"Google User Info Error: {response.text}")
                return None
            
            return response.json()
