# Quick Start

Get from "I have a CSV of mappings and some source JSONs" to "I have filled PDFs and Excel workbooks plus sidecar reports" in under five minutes. This guide walks through the whole pipeline using a small bookstore example.

## Prerequisites

- Node.js 18 or newer
- For PDF filling: `pdftk` or `pdftk-java` on your PATH
  - macOS: `brew install pdftk-java`
  - Debian / Ubuntu: `apt install pdftk`
- For XLSX filling: nothing external

## 1. Install

```shell
npm install manyfest-conversion
```

The CLI is exposed as `mfconv`:

```shell
npx mfconv --help
```

## 2. (Optional) Extract a skeleton CSV from an existing PDF

If you have a fillable PDF but no mapping CSV yet, skip this step and hand-author the CSV from scratch. If you'd rather bootstrap from the PDF's form fields:

```shell
mfconv extract-fields -i ./templates/AcquisitionOrder.pdf -f Bookstore-Acquisition
```

This writes `./templates/AcquisitionOrder-ManyfestMapping.csv` with one row per form field. The `Form Input Address` column is empty on every row -- that's the work for the human author. See [cli/extract-fields](cli/extract-fields.md) for details and the filename convention.

## 3. Author a mapping CSV

A mapping CSV has one row per target field. The columns that matter are:

| Column | Purpose |
|--------|---------|
| `PDF File` | The target form filename (PDF or XLSX). Rows are grouped by this column into one mapping manyfest per target. |
| `Field Type` | `Text` for text fields, `Button` for checkboxes (PDF only). |
| `Field Name` | The field identifier in the target form: a PDF field name, or an Excel cell reference like `E5` or `'Sheet'!B3-14`. |
| `Form` | The `ReportData.DocumentType` value that a source JSON must carry for this mapping to apply to it. |
| `Form Input Address` | The source JSON address (relative to `SourceRootAddress`). Empty rows become `UnmappedTargetFields` entries on the manyfest. |
| `Notes` | (Optional) free-form notes carried through onto the descriptor. |

Here is a short example for a fictional bookstore's "Acquisition Order" PDF:

```csv
Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes
1,AcquisitionOrder.pdf,Text,po_number,Bookstore-Acquisition,OrderData.,Header.PONumber,OrderData.Header.PONumber,
2,AcquisitionOrder.pdf,Text,vendor_name,Bookstore-Acquisition,OrderData.,Header.VendorName,OrderData.Header.VendorName,
3,AcquisitionOrder.pdf,Text,order_date,Bookstore-Acquisition,OrderData.,Header.OrderDate,OrderData.Header.OrderDate,
4,AcquisitionOrder.pdf,Text,line1_title,Bookstore-Acquisition,OrderData.,LineItems[0].Title,OrderData.LineItems[0].Title,
5,AcquisitionOrder.pdf,Text,line1_isbn,Bookstore-Acquisition,OrderData.,LineItems[0].ISBN,OrderData.LineItems[0].ISBN,
6,AcquisitionOrder.pdf,Text,line1_qty,Bookstore-Acquisition,OrderData.,LineItems[0].QtyOrdered,OrderData.LineItems[0].QtyOrdered,
```

Save it as `mappings.csv`.

## 4. Build mapping manyfests

```shell
mfconv build-mappings -i ./mappings.csv -o ./translations
```

Output:

```text
Building mapping manyfests from [./mappings.csv]...
Parsed 6 CSV rows (6 accepted, 0 skipped).
Discovered 1 distinct target forms:
  -> [PDF] AcquisitionOrder.pdf (6 mapped, 0 unmapped)
Wrote 1 mapping manyfest file(s) to ./translations
```

`translations/AcquisitionOrder.pdf.mapping.json` now contains a mapping manyfest you can inspect, hand-edit, or check into version control.

## 5. Author (or export) a source JSON

Create a source JSON file at `sources/PO-2026-0001.json` that carries the platform's version of the order data. The `ReportData.DocumentType` must match the `Form` column you used in the CSV (`Bookstore-Acquisition`):

```json
{
  "ReportData":
  {
    "DocumentType": "Bookstore-Acquisition",
    "OrderData":
    {
      "Header":
      {
        "PONumber": "PO-2026-0001",
        "VendorName": "Ingram Book Company",
        "OrderDate": "2026-04-08"
      },
      "LineItems":
      [
        {
          "ISBN": "9780143127796",
          "Title": "Sapiens: A Brief History of Humankind",
          "QtyOrdered": 12
        }
      ]
    }
  }
}
```

## 6. Fill the PDF

Assume you have a fillable PDF template at `templates/AcquisitionOrder.pdf` with form fields named `po_number`, `vendor_name`, `order_date`, `line1_title`, `line1_isbn`, and `line1_qty`.

The default source root for built mapping manyfests is `ReportData.FormData`, but our JSON nests data under `ReportData.OrderData`. Override the source root at fill time:

```shell
mfconv fill-pdf \
  -m ./translations/AcquisitionOrder.pdf.mapping.json \
  -s ./sources/PO-2026-0001.json \
  -t ./templates/AcquisitionOrder.pdf \
  -o ./filled/PO-2026-0001.pdf \
  --source-root "ReportData.OrderData"
```

Output:

```text
Filled PDF written to ./filled/PO-2026-0001.pdf
Sidecar report written to ./filled/PO-2026-0001.pdf.report.json
Stats: 6 success, 0 warning, 0 error (6 total)
```

## 7. Read the sidecar report

```shell
cat ./filled/PO-2026-0001.pdf.report.json
```

```json
{
  "SourceFile": "./sources/PO-2026-0001.json",
  "SourceDocumentType": "Bookstore-Acquisition",
  "TargetFile": "AcquisitionOrder.pdf",
  "MappingManyfestScope": "Bookstore-Acquisition::AcquisitionOrder.pdf",
  "Timestamp": "2026-04-08T14:03:22.101Z",
  "Successes":
  [
    { "FieldName": "po_number",   "SourceAddress": "ReportData.OrderData.Header.PONumber",  "Value": "PO-2026-0001" },
    { "FieldName": "vendor_name", "SourceAddress": "ReportData.OrderData.Header.VendorName","Value": "Ingram Book Company" },
    { "FieldName": "order_date",  "SourceAddress": "ReportData.OrderData.Header.OrderDate", "Value": "2026-04-08" },
    { "FieldName": "line1_title", "SourceAddress": "ReportData.OrderData.LineItems[0].Title","Value": "Sapiens: A Brief History of Humankind" },
    { "FieldName": "line1_isbn",  "SourceAddress": "ReportData.OrderData.LineItems[0].ISBN","Value": "9780143127796" },
    { "FieldName": "line1_qty",   "SourceAddress": "ReportData.OrderData.LineItems[0].QtyOrdered","Value": 12 }
  ],
  "Warnings": [],
  "Errors": [],
  "Stats": { "TotalFields": 6, "SuccessCount": 6, "WarningCount": 0, "ErrorCount": 0 }
}
```

Six fields, six successes, zero warnings, zero errors. The fill was clean.

## 8. Fill an Excel workbook (with an array broadcast)

Suppose you also have an Excel template `templates/InventorySheet.xlsx` with a worksheet called `Line Items` where rows 3-14 hold a repeating line-item table. Author the mapping CSV with array-broadcast rows:

```csv
Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes
1,InventorySheet.xlsx,,'Line Items'!B3-14,Bookstore-Acquisition,OrderData.,LineItems[].ISBN,OrderData.LineItems[].ISBN,
2,InventorySheet.xlsx,,'Line Items'!C3-14,Bookstore-Acquisition,OrderData.,LineItems[].Title,OrderData.LineItems[].Title,
3,InventorySheet.xlsx,,'Line Items'!D3-14,Bookstore-Acquisition,OrderData.,LineItems[].QtyOrdered,OrderData.LineItems[].QtyOrdered,
```

Build the mapping and fill:

```shell
mfconv build-mappings -i ./mappings.csv -o ./translations
mfconv fill-xlsx \
  -m ./translations/InventorySheet.xlsx.mapping.json \
  -s ./sources/PO-2026-0001.json \
  -t ./templates/InventorySheet.xlsx \
  -o ./filled/PO-2026-0001.xlsx \
  --source-root "ReportData.OrderData"
```

Output:

```text
Filled XLSX written to ./filled/PO-2026-0001.xlsx
Sidecar report written to ./filled/PO-2026-0001.xlsx.report.json
Stats: 3 success, 33 warning, 0 error (36 total)
```

The 3 successes are the first row of the line-items table. The 33 warnings are the 11 empty cells × 3 columns that the one-line source array didn't fill -- the sidecar clearly says "Source array has 1 elements but target range has 12 cells; 11 cell(s) left untouched" on each row.

Fonts, borders, merged cells, and sheet themes on the template are preserved exactly -- the filler uses `exceljs` and sets `cell.value` in place, leaving all style metadata intact.

## 9. Batch everything

Once you have a folder of mapping manyfests and a folder of source JSONs, `convert-batch` does the whole routing pass in one command:

```shell
mfconv convert-batch \
  -m ./translations \
  -s ./sources \
  -t ./templates \
  -o ./output \
  --source-root "ReportData.OrderData"
```

`convert-batch` loads every `.mapping.json` under `./translations`, walks every `.json` under `./sources`, routes each source to the mapping manyfest whose `SourceDocumentType` matches the source's `ReportData.DocumentType`, and writes the filled artifacts into `./output/` with sidecar reports under `./output/reports/`.

## What's next

- [Overview](overview.md) -- full feature tour
- [Architecture](architecture.md) -- system design with mermaid diagrams
- [CLI Reference](cli/overview.md) -- every command with options
- [Mapping Manyfest Format](mapping-manyfest-format.md) -- the descriptor keys and address syntax in detail
- [Sidecar Reports](sidecar-reports.md) -- the full report schema
- [Examples](examples/README.md) -- runnable bookstore, library catalog, and IRS W-9 walkthroughs
