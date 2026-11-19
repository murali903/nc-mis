"""Who reports to whom, and what follows from it.

Every member reports to one other member of the same company, except the person
at the top. Escalations and approvals travel up this line; visibility travels
down it (a manager sees the work of everyone below them)."""
from __future__ import annotations

from typing import Dict, Iterable, List, Set

from .model import Member, RuleError

Members = Dict[str, Member]


def index(members: Iterable[Member]) -> Members:
    return {m.id: m for m in members}


def chain_above(member_id: str, members: Members) -> List[Member]:
    """The member's boss, the boss's boss, and so on to the top (nearest first).
    Inactive people are left out: their work passes to the next person up."""
    chain: List[Member] = []
    seen: Set[str] = {member_id}
    current = members.get(member_id)
    if current is None:
        raise RuleError("This user is not set up in the company")
    while current.reports_to:
        if current.reports_to in seen:
            raise RuleError("The reporting line of %s loops back on itself" % current.name)
        boss = members.get(current.reports_to)
        if boss is None:
            raise RuleError("%s reports to someone who is not in the company" % current.name)
        seen.add(boss.id)
        if boss.active:
            chain.append(boss)
        current = boss
    return chain


def everyone_below(member_id: str, members: Members) -> Set[str]:
    """Ids of every person who reports to this member, directly or through others."""
    by_boss: Dict[str, List[str]] = {}
    for m in members.values():
        if m.reports_to:
            by_boss.setdefault(m.reports_to, []).append(m.id)
    below: Set[str] = set()
    stack = list(by_boss.get(member_id, []))
    while stack:
        mid = stack.pop()
        if mid in below or mid == member_id:
            continue
        below.add(mid)
        stack.extend(by_boss.get(mid, []))
    return below


def is_above(boss_id: str, member_id: str, members: Members) -> bool:
    return any(m.id == boss_id for m in _raw_chain(member_id, members))


def _raw_chain(member_id: str, members: Members) -> List[Member]:
    """Like chain_above but keeps inactive people (used for structure checks)."""
    chain: List[Member] = []
    seen = {member_id}
    current = members.get(member_id)
    while current is not None and current.reports_to and current.reports_to not in seen:
        boss = members.get(current.reports_to)
        if boss is None:
            break
        chain.append(boss)
        seen.add(boss.id)
        current = boss
    return chain


def check_reporting_change(member_id: str, new_boss_id: str, members: Members) -> None:
    """Refuses a reporting line that would not make sense. Called when an admin
    sets or changes who someone reports to."""
    member = members.get(member_id)
    boss = members.get(new_boss_id)
    if member is None or boss is None:
        raise RuleError("Both people must be users of the company")
    if member_id == new_boss_id:
        raise RuleError("%s cannot report to themselves" % member.name)
    if member.company_id != boss.company_id:
        raise RuleError("%s and %s are in different companies" % (member.name, boss.name))
    if not boss.active:
        raise RuleError("%s is not an active user" % boss.name)
    if member_id == boss.id or is_above(member_id, new_boss_id, members):
        raise RuleError("%s already reports (directly or indirectly) to %s, so the line would loop"
                        % (boss.name, member.name))


def structure_problems(members: Members) -> List[str]:
    """Things an admin should fix, in plain words. Empty when the set-up is sound."""
    problems: List[str] = []
    by_company: Dict[str, List[Member]] = {}
    for m in members.values():
        if m.active:
            by_company.setdefault(m.company_id, []).append(m)
    for company_id, people in by_company.items():
        tops = [m for m in people if not m.reports_to]
        if not tops:
            problems.append("Nobody is at the top of the company: one person must report to no one")
        for m in people:
            if not m.reports_to:
                continue
            boss = members.get(m.reports_to)
            if boss is None or boss.company_id != company_id:
                problems.append("%s reports to someone outside the company" % m.name)
                continue
            try:
                chain = chain_above(m.id, members)
            except RuleError as err:
                problems.append(str(err))
                continue
            if not chain:
                problems.append("%s has no active manager above them" % m.name)
    return problems
