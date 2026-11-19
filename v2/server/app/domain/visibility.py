"""Who can see which indent.

A person sees an indent when at least one of these is true:
  1. they raised it;
  2. it is for a site they are assigned to;
  3. the person who raised it reports to them, directly or through others;
  4. it is waiting for their decision, is assigned to them, or they acted on it;
  5. their role sees the whole company (procurement, top management, admin).
People in another company never see it."""
from __future__ import annotations

from typing import Iterable, List, Optional, Set

from . import model
from .hierarchy import Members, everyone_below
from .model import IndentRef, Member


def reason_can_see(member: Member, indent: IndentRef, members: Members,
                   below: Optional[Set[str]] = None) -> Optional[str]:
    """Why this person can see the indent, or None if they cannot."""
    if not member.active or member.company_id != indent.company_id:
        return None
    if indent.created_by == member.id:
        return "raised it"
    if indent.site_id in member.site_ids:
        return "assigned to the site"
    if below is None:
        below = everyone_below(member.id, members)
    if indent.created_by in below:
        return "manages the person who raised it"
    if member.id in (indent.waiting_on, indent.assigned_to) or member.id in indent.involved:
        return "has a part in it"
    if member.can(model.INDENT_VIEW_COMPANY) or member.can(model.ADMIN):
        return "sees the whole company"
    return None


def can_see(member: Member, indent: IndentRef, members: Members) -> bool:
    return reason_can_see(member, indent, members) is not None


def visible_indents(member: Member, indents: Iterable[IndentRef], members: Members) -> List[IndentRef]:
    below = everyone_below(member.id, members)
    return [i for i in indents if reason_can_see(member, i, members, below) is not None]
