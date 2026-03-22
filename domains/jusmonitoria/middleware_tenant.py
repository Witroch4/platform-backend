"""Tenant isolation middleware — thin re-export from platform_core.

Original implementation moved to platform_core/middleware/tenant.py.
This file kept for backward compatibility with existing imports.
"""

from platform_core.middleware.tenant import TenantMiddleware

__all__ = ["TenantMiddleware"]
