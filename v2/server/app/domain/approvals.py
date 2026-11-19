"""Who has to decide what.

One idea covers every case: a decision goes to the nearest person above you in
the reporting line who is allowed to make it. If your boss cannot (no permission,
or the value is above their limit), it passes to their boss, and so on up."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from . import model
from .hierarchy import Members, chain_above
from .model import Member, RuleError


def indent_approver(creator_id: str, members: Members) -> Member:
    """Who approves an indent raised by this person: the nearest manager above
    them who may approve indents. Nobody approves their own."""
    for boss in chain_above(creator_id, members):
        if boss.can(model.INDENT_APPROVE):
            return boss
    creator = members[creator_id]
    raise RuleError("Nobody above %s can approve indents. Ask the admin to check the reporting line."
                    % creator.name)


def escalation_target(current_id: str, permission: str, members: Members) -> Member:
    """Who a decision goes to when the person holding it escalates."""
    for boss in chain_above(current_id, members):
        if boss.can(permission):
            return boss
    raise RuleError("%s is at the top of the reporting line: there is nobody to escalate to"
                    % members[current_id].name)


@dataclass(frozen=True)
class PORoute:
    """How a PO of a given value, raised by a given buyer, reaches the vendor."""
    can_issue_directly: bool          # within the buyer's own authority
    approver: Optional[Member]        # who must approve it otherwise
    skipped: tuple = ()               # managers passed over because the value is above their limit


def po_route(buyer_id: str, value: Decimal, members: Members) -> PORoute:
    buyer = members.get(buyer_id)
    if buyer is None or not buyer.can(model.PO_CREATE):
        raise RuleError("This user is not allowed to raise purchase orders")
    value = Decimal(value)
    if value <= 0:
        raise RuleError("A purchase order must have a value above zero")

    direct = buyer.covers(value)
    skipped = []
    for boss in chain_above(buyer_id, members):
        if not boss.can(model.PO_APPROVE):
            continue
        if boss.covers(value):
            return PORoute(can_issue_directly=direct, approver=boss, skipped=tuple(skipped))
        skipped.append(boss)
    if direct:
        return PORoute(can_issue_directly=True, approver=None, skipped=tuple(skipped))
    raise RuleError("Nobody above %s has the authority to approve a purchase order of this value. "
                    "Ask the admin to check the approval limits." % buyer.name)


def can_decide_po(member_id: str, buyer_id: str, value: Decimal, waiting_on: Optional[str],
                  members: Members) -> None:
    """Raises unless this person may approve or reject this PO right now."""
    member = members.get(member_id)
    if member is None or not member.can(model.PO_APPROVE):
        raise RuleError("You are not allowed to approve purchase orders")
    if member_id == buyer_id:
        raise RuleError("You raised this purchase order, so someone above you has to approve it")
    if waiting_on != member_id:
        raise RuleError("This purchase order is not waiting for your approval")
    if not member.covers(Decimal(value)):
        raise RuleError("This purchase order is above your approval limit; escalate it")


def can_decide_indent(member_id: str, creator_id: str, waiting_on: Optional[str],
                      members: Members) -> None:
    """Raises unless this person may approve, return or reject this indent now."""
    member = members.get(member_id)
    if member is None or not member.can(model.INDENT_APPROVE):
        raise RuleError("You are not allowed to approve indents")
    if member_id == creator_id:
        raise RuleError("You raised this indent yourself, so someone above you has to decide it")
    if waiting_on != member_id:
        raise RuleError("This indent is not waiting for your decision")
