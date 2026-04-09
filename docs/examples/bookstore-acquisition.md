# Example: Bookstore Acquisition Order

A fictional bookstore (**Fable & Ink Books**) places purchase orders with a book distributor. The platform captures the order as JSON. The distributor expects:

- An `AcquisitionOrder.pdf` form (fillable PDF with fixed-position fields for header + 3 line items + totals)
- An `InventorySheet.xlsx` workbook (three sheets: `Header`, `Line Items`, `Totals` -- the line-items sheet holds up to 12 rows of books)

This example walks through the full pipeline.

## Files

All example data lives under [`data/bookstore/`](data/bookstore/):

- [`mappings.csv`](data/bookstore/mappings.csv) -- the CSV of field mappings (42 rows)
- [`source.json`](data/bookstore/source.json) -- a sample order payload (one PO with 5 line items)
- [`built-mappings/AcquisitionOrder.pdf.mapping.json`](data/bookstore/built-mappings/AcquisitionOrder.pdf.mapping.json) -- built PDF mapping (27 mapped fields + 2 unmapped signature fields)
- [`built-mappings/InventorySheet.xlsx.mapping.json`](data/bookstore/built-mappings/InventorySheet.xlsx.mapping.json) -- built XLSX mapping (13 fields: 4 headers + 5 array-broadcast rows + 4 totals)

## Step 1: The CSV

The first few rows of [`data/bookstore/mappings.csv`](data/bookstore/mappings.csv):

```csv
Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes
1,AcquisitionOrder.pdf,Text,po_number,Bookstore-Acquisition,OrderData.,Header.PONumber,OrderData.Header.PONumber,
2,AcquisitionOrder.pdf,Text,order_date,Bookstore-Acquisition,OrderData.,Header.OrderDate,OrderData.Header.OrderDate,
3,AcquisitionOrder.pdf,Text,vendor_name,Bookstore-Acquisition,OrderData.,Header.VendorName,OrderData.Header.VendorName,
...
10,AcquisitionOrder.pdf,Text,line1_isbn,Bookstore-Acquisition,OrderData.,LineItems[0].ISBN,OrderData.LineItems[0].ISBN,
11,AcquisitionOrder.pdf,Text,line1_title,Bookstore-Acquisition,OrderData.,LineItems[0].Title,OrderData.LineItems[0].Title,
...
```

Two interesting patterns:

1. **PDF line items use explicit indices.** Rows 10-14 map `LineItems[0].*` to `line1_*` fields; rows 20-24 map `LineItems[1].*` to `line2_*`; etc. PDF line items are fixed-position so explicit indices are the only sensible choice.

2. **XLSX line items use array broadcast.** Near the end of the CSV, the XLSX target rows look like this:

```csv
,InventorySheet.xlsx,,'Line Items'!A3-14,Bookstore-Acquisition,OrderData.,LineItems[].ISBN,OrderData.LineItems[].ISBN,
,InventorySheet.xlsx,,'Line Items'!B3-14,Bookstore-Acquisition,OrderData.,LineItems[].Title,OrderData.LineItems[].Title,
,InventorySheet.xlsx,,'Line Items'!C3-14,Bookstore-Acquisition,OrderData.,LineItems[].Author,OrderData.LineItems[].Author,
,InventorySheet.xlsx,,'Line Items'!D3-14,Bookstore-Acquisition,OrderData.,LineItems[].QtyOrdered,OrderData.LineItems[].QtyOrdered,
,InventorySheet.xlsx,,'Line Items'!E3-14,Bookstore-Acquisition,OrderData.,LineItems[].UnitPrice,OrderData.LineItems[].UnitPrice,
```

Each row maps `LineItems[].<field>` to a cell range `'Line Items'!<col>3-14`. The XLSX filler pairs elements with cells index-by-index, so a 5-element source array fills rows 3-7 and leaves rows 8-14 untouched (with a warning).

## Step 2: Build the mapping manyfests

```shell
mfconv build-mappings \
  -i docs/examples/data/bookstore/mappings.csv \
  -o docs/examples/data/bookstore/built-mappings \
  --source-root "ReportData.OrderData"
```

Console output:

```text
Building mapping manyfests from [.../docs/examples/data/bookstore/mappings.csv]...
Parsed 42 CSV rows (40 accepted, 2 skipped).
Discovered 2 distinct target forms:
  -> [PDF]  AcquisitionOrder.pdf (27 mapped, 2 unmapped)
  -> [XLSX] InventorySheet.xlsx (13 mapped, 0 unmapped)
Wrote 2 mapping manyfest file(s) to .../docs/examples/data/bookstore/built-mappings
2 row(s) were skipped.  Details in .../docs/examples/data/bookstore/built-mappings/build-report.json
```

The two "skipped" rows are the signature fields (`receiver_signature`, `receiver_date`) which have no source address (they're filled by hand on delivery). They appear in `UnmappedTargetFields` on the PDF mapping manyfest.

## Step 3: Inspect the source JSON

[`data/bookstore/source.json`](data/bookstore/source.json):

```json
{
  "ReportData":
  {
    "DocumentType": "Bookstore-Acquisition",
    "IDDocument": 18274,
    "OrderData":
    {
      "Header":
      {
        "PONumber": "PO-2026-0042",
        "OrderDate": "2026-04-08",
        "VendorName": "Ingram Book Company",
        "VendorAccount": "INGR-00914",
        "ShipTo": "Fable & Ink Books, 112 Willow Lane, Portland, OR 97201",
        "BuyerName": "Marguerite Chen",
        "BuyerEmail": "marguerite@fableandink.example.com",
        "Notes": "Please hold until the end of the month; our stockroom is being renovated."
      },
      "LineItems":
      [
        { "ISBN": "9780143127796", "Title": "Sapiens: A Brief History of Humankind", "Author": "Yuval Noah Harari", "QtyOrdered": "12", "UnitPrice": "14.99" },
        { "ISBN": "9780451524935", "Title": "1984",                                   "Author": "George Orwell",      "QtyOrdered": "8",  "UnitPrice": "9.99" },
        { "ISBN": "9780316769488", "Title": "The Catcher in the Rye",                 "Author": "J.D. Salinger",      "QtyOrdered": "5",  "UnitPrice": "11.50" },
        { "ISBN": "9780307277671", "Title": "The Road",                               "Author": "Cormac McCarthy",    "QtyOrdered": "6",  "UnitPrice": "13.00" },
        { "ISBN": "9780679783268", "Title": "Pride and Prejudice",                    "Author": "Jane Austen",        "QtyOrdered": "10", "UnitPrice": "7.50" }
      ],
      "Totals": { "QtyTotal": "41", "Subtotal": "461.80", "Tax": "27.71", "Grand": "489.51" }
    }
  }
}
```

## Step 4: Fill the PDF (conceptually)

Assuming you have a fillable `AcquisitionOrder.pdf` with the form fields named in the CSV (`po_number`, `vendor_name`, `line1_isbn`, etc.):

```shell
mfconv fill-pdf \
  -m docs/examples/data/bookstore/built-mappings/AcquisitionOrder.pdf.mapping.json \
  -s docs/examples/data/bookstore/source.json \
  -t path/to/AcquisitionOrder.pdf \
  -o /tmp/PO-2026-0042.pdf \
  --source-root "ReportData.OrderData"
```

Expected sidecar stats: **25 success / 2 warning / 0 error**. Why 25 successes when the mapping has 27 mapped fields? Because the source JSON has 5 line items but the PDF only has fields for 3 (`line1_*`, `line2_*`, `line3_*`) -- the mapping only references rows 0, 1, 2. So 27 mapped - 2 missing (we only wrote 3 line items, but we wrote all their ISBN/Title/Author/Qty/Price = 15, plus 7 header fields, plus 4 totals fields, plus 1 notes field = 27). All 27 map reads succeed because the source has 5 line items >= 3 referenced.

Actually let me re-count: 7 header fields + 3 line items × 5 fields = 15 + 4 totals + 1 notes = 27 mapped descriptors. All 27 resolve because the source has enough line items. So the expected outcome is **27 success / 0 warning / 0 error**.

The two signature fields are in `UnmappedTargetFields` and are not processed during a fill; they do not appear in the sidecar.

Without a real PDF template, you can still inspect the mapping manyfest JSON:

```shell
cat docs/examples/data/bookstore/built-mappings/AcquisitionOrder.pdf.mapping.json
```

and the programmatic API will resolve each source address against the sample payload exactly as shown in the expected sidecar above.

## Step 5: Fill the XLSX (conceptually)

```shell
mfconv fill-xlsx \
  -m docs/examples/data/bookstore/built-mappings/InventorySheet.xlsx.mapping.json \
  -s docs/examples/data/bookstore/source.json \
  -t path/to/InventorySheet.xlsx \
  -o /tmp/PO-2026-0042.xlsx \
  --source-root "ReportData.OrderData"
```

Expected sidecar stats: **29 success / 5 warning / 0 error**.

- 4 Header sheet fields (PO number, order date, vendor, buyer) -> 4 successes
- 5 Line Items columns × 5 source array elements -> 25 successes
- 5 Line Items columns × 1 truncation warning each (source array has 5 elements, target range has 12 cells, 7 cells untouched) -> 5 warnings
- 4 Totals sheet fields -> 4 successes

Total: 29 successes + 5 warnings + 0 errors = 34 entries in the sidecar. The 34 includes the 25 per-element successes from array broadcast, which count individually in the per-field log.

## Step 6: Inspect the built mapping manyfest

The built PDF mapping (truncated) looks like this:

```json
{
  "Scope": "Bookstore-Acquisition::AcquisitionOrder.pdf",
  "SourceRootAddress": "ReportData.OrderData",
  "TargetFile": "AcquisitionOrder.pdf",
  "TargetFileType": "PDF",
  "SourceDocumentType": "Bookstore-Acquisition",
  "SourceRootFullPath": "OrderData.",
  "Descriptors":
  {
    "Header.PONumber":
    {
      "Name": "AcquisitionOrder.pdf/po_number",
      "Hash": "AcquisitionOrder__po_number",
      "DataType": "String",
      "TargetFieldName": "po_number",
      "TargetFieldType": "Text",
      "SourceSortOrder": 1,
      "SourceAddressRaw": "Header.PONumber",
      "SourceAddressLong": "OrderData.Header.PONumber"
    },
    "LineItems[0].Title":
    {
      "Name": "AcquisitionOrder.pdf/line1_title",
      "Hash": "AcquisitionOrder__line1_title",
      "DataType": "String",
      "TargetFieldName": "line1_title",
      "TargetFieldType": "Text",
      "SourceSortOrder": 11,
      "SourceAddressRaw": "LineItems[0].Title",
      "SourceAddressLong": "OrderData.LineItems[0].Title"
    }
  },
  "HashTranslations": {},
  "UnmappedTargetFields":
  [
    {
      "FieldName": "receiver_signature",
      "FieldType": "Text",
      "Notes": "To be signed by hand on delivery"
    },
    {
      "FieldName": "receiver_date",
      "FieldType": "Text",
      "Notes": "To be signed by hand on delivery"
    }
  ]
}
```

And the XLSX mapping (showing the array-broadcast descriptors):

```json
{
  "Scope": "Bookstore-Acquisition::InventorySheet.xlsx",
  "SourceRootAddress": "ReportData.OrderData",
  "TargetFile": "InventorySheet.xlsx",
  "TargetFileType": "XLSX",
  "SourceDocumentType": "Bookstore-Acquisition",
  "Descriptors":
  {
    "Header.PONumber":
    {
      "TargetFieldName": "'Header'!B2",
      "TargetFieldType": "Text"
    },
    "LineItems[].ISBN":
    {
      "TargetFieldName": "'Line Items'!A3-14",
      "TargetFieldType": "Text"
    },
    "LineItems[].Title":
    {
      "TargetFieldName": "'Line Items'!B3-14",
      "TargetFieldType": "Text"
    },
    "Totals.Grand":
    {
      "TargetFieldName": "'Totals'!B5",
      "TargetFieldType": "Text"
    }
  }
}
```

## Key takeaways

- **PDF line items use explicit indices** (`LineItems[0]`, `LineItems[1]`, ...) because PDF forms have fixed positions.
- **XLSX line items use array broadcast** (`LineItems[]`) paired with a cell range (`'Line Items'!B3-14`) because Excel sheets can hold variable-length tables.
- **Unmapped target fields** like the signature lines are tracked on `UnmappedTargetFields` for the CSV author to review, but are not processed at fill time.
- **Override `--source-root`** to match whatever envelope shape the source JSON uses. The built mapping manyfests default to `ReportData.FormData`, but the bookstore example uses `ReportData.OrderData`.

## See also

- [Library Catalog Inventory](library-catalog.md)
- [IRS Form W-9](irs-w9.md)
- [Quick Start](../quickstart.md)
- [Target Cell and Range Syntax](../target-cell-syntax.md)
- [Source Address Syntax](../source-address-syntax.md#array-broadcast--empty-brackets)
