"""Plain data the rules work on. No database, no web framework: these are
filled in by the data layer and handed to the rule functions, which makes every
rule testable on its own."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import FrozenSet, Optional

# Permissions a role can carry. A role is just a named set of these.
INDENT_CREATE = "indent.create"
INDENT_APPROVE = "indent.approve"
INDENT_VIEW_COMPANY = "indent.view_company"   # sees every indent in the company
PO_CREATE = "po.create"
PO_APPROVE = "po.approve"
PO_CLOSE = "po.close"
PO_VIEW_COMPANY = "po.view_company"
RECEIPT_RECORD = "receipt.record"
VENDOR_MANAGE = "vendor.manage"
ADMIN = "admin.manage"

ALL_PERMISSIONS = frozenset({
    INDENT_CREATE, INDENT_APPROVE, INDENT_VIEW_COMPANY, PO_CREATE, PO_APPROVE,
    PO_CLOSE, PO_VIEW_COMPANY, RECEIPT_RECORD, VENDOR_MANAGE, ADMIN,
})


@dataclass(frozen=True)
class Member:
    """One person in one company."""
    id: str
    company_id: str
    name: str
    role: str
    permissions: FrozenSet[str] = frozenset()
    reports_to: Optional[str] = None          # another member's id; None = top of the company
    # Highest PO value (incl. GST) this person may approve or issue on their own
    # authority. None = no ceiling. 0 = none at all.
    po_limit: Optional[Decimal] = Decimal("0")
    site_ids: FrozenSet[str] = frozenset()
    active: bool = True

    def can(self, permission: str) -> bool:
        return self.active and permission in self.permissions

    def covers(self, value: Decimal) -> bool:
        """True if a PO of this value is within this person's authority."""
        return self.po_limit is None or Decimal(value) <= self.po_limit


@dataclass(frozen=True)
class IndentRef:
    """The few facts about an indent that visibility and routing need."""
    id: str
    company_id: str
    site_id: str
    created_by: str
    status: str
    waiting_on: Optional[str] = None           # member who has to act next, if any
    assigned_to: Optional[str] = None          # buyer handling it, if any
    involved: FrozenSet[str] = field(default_factory=frozenset)  # everyone who has acted on it


class RuleError(Exception):
    """A business rule was broken. The message is written for the user."""
