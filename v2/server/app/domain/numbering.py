"""Document numbers.

    NC-IND-GCB-2627-0042
    |  |   |   |    |
    |  |   |   |    running number, restarts each financial year
    |  |   |   financial year, April to March (2026-27)
    |  |   where: the site for indents and receipts, the office for purchase orders
    |  what: IND indent, PO purchase order, GRN goods receipt
    company

The running number is kept per company + document type + place + financial year,
so each site and office has its own unbroken series. It is taken from a counter in
the database inside the same transaction that creates the document, which is what
keeps the series free of gaps and duplicates."""
from __future__ import annotations

import datetime as dt
import re

from .model import RuleError

DOC_TYPES = {"IND": "site", "PO": "office", "GRN": "site"}
_CODE = re.compile(r"^[A-Z0-9]{2,5}$")


def financial_year(day: dt.date) -> str:
    """'2627' for any date from 1 April 2026 to 31 March 2027."""
    start = day.year if day.month >= 4 else day.year - 1
    return "%02d%02d" % (start % 100, (start + 1) % 100)


def check_code(code: str, what: str) -> str:
    code = (code or "").strip().upper()
    if not _CODE.match(code):
        raise RuleError("The %s code must be 2 to 5 letters or digits (e.g. HYD)" % what)
    return code


def counter_key(company_code: str, doc_type: str, place_code: str, day: dt.date) -> str:
    if doc_type not in DOC_TYPES:
        raise RuleError("Unknown document type: %s" % doc_type)
    return "-".join([check_code(company_code, "company"), doc_type,
                     check_code(place_code, DOC_TYPES[doc_type]), financial_year(day)])


def format_number(company_code: str, doc_type: str, place_code: str, day: dt.date, sequence: int) -> str:
    if sequence < 1:
        raise RuleError("A document number starts at 1")
    return "%s-%04d" % (counter_key(company_code, doc_type, place_code, day), sequence)
