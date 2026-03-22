"""Instagram Business OAuth service."""

import logging
from urllib.parse import quote

import httpx

from platform_core.config import settings
from domains.jusmonitoria.crypto import decrypt, encrypt

logger = logging.getLogger(__name__)

INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_LONG_LIVED_TOKEN_URL = "https://graph.instagram.com/access_token"
INSTAGRAM_ME_URL = "https://graph.instagram.com/me"

IG_SCOPES = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
    "instagram_business_content_publish",
    "instagram_business_manage_insights",
]


def get_authorization_url(state: str) -> str:
    """Build the Instagram OAuth authorization URL."""
    scopes = quote(",".join(IG_SCOPES))
    callback = quote(settings.instagram_callback_url)
    return (
        f"{INSTAGRAM_AUTH_URL}"
        f"?client_id={settings.instagram_app_id}"
        f"&redirect_uri={callback}"
        f"&scope={scopes}"
        f"&response_type=code"
        f"&state={state}"
    )


async def exchange_code_for_token(code: str) -> dict:
    """
    Exchange authorization code for short-lived access token,
    then upgrade to long-lived token (60-day expiry).
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Exchange code for short-lived token
        response = await client.post(
            INSTAGRAM_TOKEN_URL,
            data={
                "client_id": settings.instagram_app_id,
                "client_secret": settings.instagram_app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": settings.instagram_callback_url,
                "code": code,
            },
        )
        response.raise_for_status()
        short_lived = response.json()
        short_token = short_lived["access_token"]

        # Step 2: Upgrade to long-lived token
        ll_response = await client.get(
            INSTAGRAM_LONG_LIVED_TOKEN_URL,
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": settings.instagram_app_secret,
                "access_token": short_token,
            },
        )
        ll_response.raise_for_status()
        long_lived = ll_response.json()

        return long_lived  # {access_token, token_type, expires_in}


async def fetch_instagram_profile(access_token: str) -> dict:
    """Fetch Instagram user profile."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            INSTAGRAM_ME_URL,
            params={
                "fields": "id,username,profile_picture_url,followers_count",
                "access_token": access_token,
            },
        )
        response.raise_for_status()
        return response.json()


def encrypt_token(token: str) -> str:
    """Encrypt an OAuth token for storage."""
    return encrypt(token)


def decrypt_token(encrypted: str) -> str:
    """Decrypt a stored OAuth token."""
    return decrypt(encrypted)
