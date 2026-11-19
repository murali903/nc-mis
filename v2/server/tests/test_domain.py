import datetime as dt
import unittest
from decimal import Decimal as D

from app.domain import approvals, hierarchy, model, numbering, visibility
from app.domain.model import IndentRef, Member, RuleError

P = model
ENG = frozenset({P.INDENT_CREATE})
STORE = frozenset({P.INDENT_CREATE, P.RECEIPT_RECORD})
PM = frozenset({P.INDENT_CREATE, P.INDENT_APPROVE})
CLERK = frozenset({P.PO_CREATE, P.INDENT_VIEW_COMPANY, P.PO_VIEW_COMPANY})
PROC = frozenset({P.PO_CREATE, P.PO_APPROVE, P.PO_CLOSE, P.INDENT_VIEW_COMPANY, P.PO_VIEW_COMPANY, P.VENDOR_MANAGE})
GM = frozenset({P.INDENT_APPROVE, P.PO_APPROVE, P.INDENT_VIEW_COMPANY, P.PO_VIEW_COMPANY})
MD = GM


def company():
    """MD at the top. Two GMs. PM1 reports to GM1, PM2 straight to the MD.
    Procurement manager reports to GM2; a clerk reports to the procurement manager."""
    people = [
        Member("md", "nc", "MD", "md", MD, None, None),
        Member("gm1", "nc", "GM One", "gm", GM, "md", D("500000")),
        Member("gm2", "nc", "GM Two", "gm", GM, "md", D("500000")),
        Member("pm1", "nc", "PM One", "pm", PM, "gm1", D("0"), frozenset({"s1", "s2"})),
        Member("pm2", "nc", "PM Two", "pm", PM, "md", D("0"), frozenset({"s3"})),
        Member("eng1", "nc", "Engineer One", "eng", ENG, "pm1", D("0"), frozenset({"s1"})),
        Member("eng3", "nc", "Engineer Three", "eng", ENG, "pm2", D("0"), frozenset({"s3"})),
        Member("store1", "nc", "Store One", "store", STORE, "pm1", D("0"), frozenset({"s1"})),
        Member("proc", "nc", "Procurement Manager", "proc", PROC, "gm2", D("50000")),
        Member("clerk", "nc", "Clerk", "clerk", CLERK, "proc", D("0")),
        Member("other", "xx", "Other Co PM", "pm", PM, None, None, frozenset({"s1"})),
    ]
    return hierarchy.index(people)


class Hierarchy(unittest.TestCase):
    def test_chain_runs_to_the_top(self):
        m = company()
        self.assertEqual([x.id for x in hierarchy.chain_above("eng1", m)], ["pm1", "gm1", "md"])
        self.assertEqual([x.id for x in hierarchy.chain_above("eng3", m)], ["pm2", "md"])
        self.assertEqual(hierarchy.chain_above("md", m), [])

    def test_everyone_below(self):
        m = company()
        self.assertEqual(hierarchy.everyone_below("gm1", m), {"pm1", "eng1", "store1"})
        self.assertEqual(hierarchy.everyone_below("eng1", m), set())
        self.assertEqual(len(hierarchy.everyone_below("md", m)), 9)

    def test_inactive_boss_is_skipped(self):
        m = company()
        m["pm1"] = Member("pm1", "nc", "PM One", "pm", PM, "gm1", D("0"), frozenset({"s1"}), active=False)
        self.assertEqual([x.id for x in hierarchy.chain_above("eng1", m)], ["gm1", "md"])
        self.assertEqual(approvals.indent_approver("eng1", m).id, "gm1")

    def test_loop_is_refused(self):
        m = company()
        with self.assertRaises(RuleError):
            hierarchy.check_reporting_change("gm1", "eng1", m)      # eng1 is below gm1
        with self.assertRaises(RuleError):
            hierarchy.check_reporting_change("pm1", "pm1", m)
        with self.assertRaises(RuleError):
            hierarchy.check_reporting_change("pm1", "other", m)     # other company
        hierarchy.check_reporting_change("pm1", "gm2", m)            # a normal move is fine

    def test_existing_loop_is_reported_not_hung(self):
        m = company()
        m["md"] = Member("md", "nc", "MD", "md", MD, "eng1", None)
        with self.assertRaises(RuleError):
            hierarchy.chain_above("eng1", m)
        self.assertTrue(hierarchy.structure_problems(m))

    def test_sound_structure_has_no_problems(self):
        self.assertEqual(hierarchy.structure_problems(company()), [])


class IndentRouting(unittest.TestCase):
    def test_engineer_indent_goes_to_their_pm(self):
        self.assertEqual(approvals.indent_approver("eng1", company()).id, "pm1")

    def test_pm_indent_goes_to_whoever_the_pm_reports_to(self):
        m = company()
        self.assertEqual(approvals.indent_approver("pm1", m).id, "gm1")   # reports to a GM
        self.assertEqual(approvals.indent_approver("pm2", m).id, "md")    # reports to the MD

    def test_escalation_goes_one_level_up_each_time(self):
        m = company()
        self.assertEqual(approvals.escalation_target("pm1", P.INDENT_APPROVE, m).id, "gm1")
        self.assertEqual(approvals.escalation_target("gm1", P.INDENT_APPROVE, m).id, "md")
        with self.assertRaises(RuleError):
            approvals.escalation_target("md", P.INDENT_APPROVE, m)

    def test_nobody_decides_their_own_or_out_of_turn(self):
        m = company()
        with self.assertRaises(RuleError):
            approvals.can_decide_indent("pm1", "pm1", "pm1", m)      # own indent
        with self.assertRaises(RuleError):
            approvals.can_decide_indent("pm2", "eng1", "pm1", m)     # waiting on someone else
        with self.assertRaises(RuleError):
            approvals.can_decide_indent("eng1", "store1", "eng1", m) # no permission
        approvals.can_decide_indent("pm1", "eng1", "pm1", m)

    def test_top_person_cannot_raise_an_indent_nobody_can_approve(self):
        m = company()
        with self.assertRaises(RuleError):
            approvals.indent_approver("md", m)


class PORouting(unittest.TestCase):
    def test_manager_issues_small_po_directly(self):
        r = approvals.po_route("proc", D("50000"), company())
        self.assertTrue(r.can_issue_directly)
        self.assertEqual(r.approver.id, "gm2")       # may still send it up if they wish

    def test_just_over_the_limit_goes_to_the_boss(self):
        r = approvals.po_route("proc", D("50000.01"), company())
        self.assertFalse(r.can_issue_directly)
        self.assertEqual(r.approver.id, "gm2")

    def test_above_the_boss_limit_passes_to_the_next_level(self):
        r = approvals.po_route("proc", D("750000"), company())
        self.assertEqual(r.approver.id, "md")
        self.assertEqual([s.id for s in r.skipped], ["gm2"])

    def test_clerk_po_goes_to_procurement_manager_then_up(self):
        m = company()
        small = approvals.po_route("clerk", D("20000"), m)
        self.assertFalse(small.can_issue_directly)
        self.assertEqual(small.approver.id, "proc")
        big = approvals.po_route("clerk", D("200000"), m)
        self.assertEqual(big.approver.id, "gm2")
        self.assertEqual([s.id for s in big.skipped], ["proc"])

    def test_refusals(self):
        m = company()
        with self.assertRaises(RuleError):
            approvals.po_route("eng1", D("100"), m)           # not a buyer
        with self.assertRaises(RuleError):
            approvals.po_route("proc", D("0"), m)             # zero value
        with self.assertRaises(RuleError):
            approvals.can_decide_po("proc", "proc", D("100"), "proc", m)     # own PO
        with self.assertRaises(RuleError):
            approvals.can_decide_po("gm2", "proc", D("900000"), "gm2", m)    # above limit
        with self.assertRaises(RuleError):
            approvals.can_decide_po("gm1", "proc", D("100"), "gm2", m)       # not waiting on them
        approvals.can_decide_po("gm2", "proc", D("100000"), "gm2", m)

    def test_no_authority_anywhere_is_reported(self):
        m = company()
        m["md"] = Member("md", "nc", "MD", "md", MD, None, D("100000"))
        with self.assertRaises(RuleError):
            approvals.po_route("proc", D("900000"), m)


class Visibility(unittest.TestCase):
    def indent(self, **kw):
        base = dict(id="i1", company_id="nc", site_id="s1", created_by="eng1", status="pending_approval")
        base.update(kw)
        return IndentRef(**base)

    def test_site_people_and_managers_see_it(self):
        m = company()
        i = self.indent()
        self.assertEqual(visibility.reason_can_see(m["eng1"], i, m), "raised it")
        self.assertEqual(visibility.reason_can_see(m["store1"], i, m), "assigned to the site")
        self.assertEqual(visibility.reason_can_see(m["pm1"], i, m), "assigned to the site")
        self.assertEqual(visibility.reason_can_see(m["gm1"], i, m), "manages the person who raised it")

    def test_other_pm_and_other_engineer_do_not(self):
        m = company()
        i = self.indent()
        self.assertFalse(visibility.can_see(m["pm2"], i, m))
        self.assertFalse(visibility.can_see(m["eng3"], i, m))

    def test_other_company_never_sees_it_even_on_same_site_id(self):
        m = company()
        self.assertFalse(visibility.can_see(m["other"], self.indent(), m))

    def test_company_wide_roles_see_it(self):
        m = company()
        for who in ("proc", "clerk", "gm2", "md"):
            self.assertTrue(visibility.can_see(m[who], self.indent(), m), who)

    def test_person_with_a_part_in_it_sees_it(self):
        m = company()
        i = self.indent(site_id="s3", created_by="eng3", waiting_on="pm2")
        self.assertTrue(visibility.can_see(m["pm2"], i, m))
        self.assertFalse(visibility.can_see(m["pm1"], i, m))

    def test_list_is_filtered(self):
        m = company()
        indents = [self.indent(id="a"), self.indent(id="b", site_id="s3", created_by="eng3")]
        self.assertEqual([i.id for i in visibility.visible_indents(m["pm1"], indents, m)], ["a"])
        self.assertEqual([i.id for i in visibility.visible_indents(m["md"], indents, m)], ["a", "b"])

    def test_inactive_user_sees_nothing(self):
        m = company()
        gone = Member("eng1", "nc", "Engineer One", "eng", ENG, "pm1", D("0"), frozenset({"s1"}), active=False)
        self.assertFalse(visibility.can_see(gone, self.indent(), m))


class Numbering(unittest.TestCase):
    def test_financial_year(self):
        self.assertEqual(numbering.financial_year(dt.date(2026, 4, 1)), "2627")
        self.assertEqual(numbering.financial_year(dt.date(2027, 3, 31)), "2627")
        self.assertEqual(numbering.financial_year(dt.date(2026, 3, 31)), "2526")
        self.assertEqual(numbering.financial_year(dt.date(2099, 12, 1)), "9900")

    def test_format(self):
        d = dt.date(2026, 11, 18)
        self.assertEqual(numbering.format_number("NC", "IND", "GCB", d, 42), "NC-IND-GCB-2627-0042")
        self.assertEqual(numbering.format_number("nc", "PO", "hyd", d, 1), "NC-PO-HYD-2627-0001")
        self.assertEqual(numbering.format_number("NC", "GRN", "GCB", d, 12345), "NC-GRN-GCB-2627-12345")

    def test_series_is_per_place_and_year(self):
        d1, d2 = dt.date(2027, 3, 31), dt.date(2027, 4, 1)
        self.assertNotEqual(numbering.counter_key("NC", "PO", "HYD", d1), numbering.counter_key("NC", "PO", "HYD", d2))
        self.assertNotEqual(numbering.counter_key("NC", "PO", "HYD", d1), numbering.counter_key("NC", "PO", "VZG", d1))

    def test_bad_input(self):
        d = dt.date(2026, 11, 18)
        for args in (("NC", "XX", "HYD", d, 1), ("N", "PO", "HYD", d, 1), ("NC", "PO", "HY-D", d, 1), ("NC", "PO", "HYD", d, 0)):
            with self.assertRaises(RuleError):
                numbering.format_number(*args)


if __name__ == "__main__":
    unittest.main()
