# Example: Library Catalog Inventory

The **Willow Grove Public Library** maintains its catalog in a JSON database and needs a printable inventory workbook every quarter for the library board. The target workbook has four sheets:

- **Summary** -- library name, branch code, librarian, audit date, roll-up totals
- **Fiction** -- call number, title, author, copies on hand, last checkout date
- **Non-Fiction** -- call number, title, author, copies on hand, subject
- **Childrens** -- call number, title, author, copies on hand, age range

This example demonstrates a **multi-sheet XLSX fill** where each category is written to its own sheet via array broadcast.

## Files

- [`data/library/mappings.csv`](data/library/mappings.csv) -- the CSV of field mappings (23 rows)
- [`data/library/source.json`](data/library/source.json) -- a sample catalog payload (5 fiction + 3 non-fiction + 3 childrens)
- [`data/library/built-mappings/CatalogInventory.xlsx.mapping.json`](data/library/built-mappings/CatalogInventory.xlsx.mapping.json) -- built mapping manyfest

## The CSV

The CSV has three clean sections: summary, and one section per category sheet. Each category section uses array broadcast into a 20-row range (rows 3-22):

```csv
Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes
,CatalogInventory.xlsx,,'Summary'!B2,Library-Catalog,Catalog.,Header.LibraryName,Catalog.Header.LibraryName,
,CatalogInventory.xlsx,,'Summary'!B3,Library-Catalog,Catalog.,Header.BranchCode,Catalog.Header.BranchCode,
...
,CatalogInventory.xlsx,,'Fiction'!A3-22,Library-Catalog,Catalog.,Fiction[].CallNumber,Catalog.Fiction[].CallNumber,
,CatalogInventory.xlsx,,'Fiction'!B3-22,Library-Catalog,Catalog.,Fiction[].Title,Catalog.Fiction[].Title,
...
,CatalogInventory.xlsx,,'Non-Fiction'!A3-22,Library-Catalog,Catalog.,NonFiction[].CallNumber,Catalog.NonFiction[].CallNumber,
...
,CatalogInventory.xlsx,,'Childrens'!A3-22,Library-Catalog,Catalog.,Childrens[].CallNumber,Catalog.Childrens[].CallNumber,
```

## Build the mapping manyfest

```shell
mfconv build-mappings \
  -i docs/examples/data/library/mappings.csv \
  -o docs/examples/data/library/built-mappings \
  --source-root "ReportData.Catalog"
```

Console output:

```text
Parsed 23 CSV rows (23 accepted, 0 skipped).
Discovered 1 distinct target forms:
  -> [XLSX] CatalogInventory.xlsx (23 mapped, 0 unmapped)
Wrote 1 mapping manyfest file(s) to .../docs/examples/data/library/built-mappings
```

23 descriptors: 8 Summary-sheet scalars + 5 Fiction array-broadcast columns + 5 Non-Fiction array-broadcast columns + 5 Childrens array-broadcast columns.

## Source JSON

```json
{
  "ReportData":
  {
    "DocumentType": "Library-Catalog",
    "Catalog":
    {
      "Header":
      {
        "LibraryName": "Willow Grove Public Library",
        "BranchCode": "WGPL-MAIN",
        "Librarian": "Ananya Patel",
        "AuditDate": "2026-04-08"
      },
      "Summary":
      {
        "TotalBooks": "11",
        "TotalCopies": "37",
        "CheckedOut": "9",
        "OnShelf": "28"
      },
      "Fiction":
      [
        { "CallNumber": "FIC HAR", "Title": "Sapiens",                "Author": "Yuval Noah Harari", "CopiesOnHand": "2", "LastCheckoutDate": "2026-03-21" },
        { "CallNumber": "FIC ORW", "Title": "1984",                   "Author": "George Orwell",     "CopiesOnHand": "3", "LastCheckoutDate": "2026-04-01" },
        { "CallNumber": "FIC SAL", "Title": "The Catcher in the Rye", "Author": "J.D. Salinger",     "CopiesOnHand": "1", "LastCheckoutDate": "2026-02-14" },
        { "CallNumber": "FIC MCC", "Title": "The Road",               "Author": "Cormac McCarthy",   "CopiesOnHand": "4", "LastCheckoutDate": "2026-03-29" },
        { "CallNumber": "FIC AUS", "Title": "Pride and Prejudice",    "Author": "Jane Austen",       "CopiesOnHand": "2", "LastCheckoutDate": "2026-03-15" }
      ],
      "NonFiction":
      [
        { "CallNumber": "909 DIA", "Title": "Guns, Germs, and Steel", "Author": "Jared Diamond",       "CopiesOnHand": "2", "Subject": "World History" },
        { "CallNumber": "510 HOF", "Title": "Godel, Escher, Bach",    "Author": "Douglas Hofstadter",  "CopiesOnHand": "1", "Subject": "Mathematics" },
        { "CallNumber": "523 SAG", "Title": "Cosmos",                 "Author": "Carl Sagan",          "CopiesOnHand": "3", "Subject": "Astronomy" }
      ],
      "Childrens":
      [
        { "CallNumber": "E SEN", "Title": "Where the Wild Things Are",               "Author": "Maurice Sendak", "CopiesOnHand": "5", "AgeRange": "3-8"  },
        { "CallNumber": "E EAS", "Title": "The Very Hungry Caterpillar",             "Author": "Eric Carle",     "CopiesOnHand": "6", "AgeRange": "2-5"  },
        { "CallNumber": "E ROW", "Title": "Harry Potter and the Sorcerer's Stone",   "Author": "J.K. Rowling",   "CopiesOnHand": "8", "AgeRange": "8-12" }
      ]
    }
  }
}
```

## Fill the workbook

```shell
mfconv fill-xlsx \
  -m docs/examples/data/library/built-mappings/CatalogInventory.xlsx.mapping.json \
  -s docs/examples/data/library/source.json \
  -t path/to/CatalogInventory.xlsx \
  -o /tmp/library-audit-2026-04-08.xlsx \
  --source-root "ReportData.Catalog"
```

## Expected sidecar stats

| Section | Source elements | Target cells | Successes | Warnings (under-fill) |
|---------|----------------:|-------------:|----------:|----------------------:|
| Summary scalars | 8 | 8 | 8 | 0 |
| Fiction × 5 columns | 5 each | 20 each | 25 | 5 |
| Non-Fiction × 5 columns | 3 each | 20 each | 15 | 5 |
| Childrens × 5 columns | 3 each | 20 each | 15 | 5 |
| **Total** | | | **63** | **15** |

Sidecar totals: **63 success / 15 warning / 0 error**. All cells in the target ranges beyond the source array length are left untouched -- their template content (likely empty or header-row styling) is preserved because exceljs does in-place updates.

## Key takeaways

- **Multi-sheet fills work with a single mapping manyfest.** Every descriptor names its own sheet via the `'<sheet>'!<cell>` syntax; the filler resolves the sheet name at fill time.
- **Array broadcast scales to as many categories as you need.** Each category is an independent broadcast with its own target range and its own size-mismatch warnings.
- **Under-fill is never fatal.** The library might have 5 fiction titles today and 18 tomorrow -- the same mapping works for both, just with different warning counts.
- **No signature of "how many items"** is needed anywhere in the mapping. The source array length is the source of truth; the target range is the maximum capacity.

## See also

- [Bookstore Acquisition Order](bookstore-acquisition.md) -- simpler line-item case
- [IRS Form W-9](irs-w9.md) -- PDF fill with checkbox handling
- [Target Cell and Range Syntax](../target-cell-syntax.md)
- [Source Address Syntax](../source-address-syntax.md#array-broadcast--empty-brackets)
