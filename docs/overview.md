# Overview

Manyfest Conversion solves a specific data-integration problem: taking a structured JSON payload produced by a platform (a form submission, an inspection report, a purchase order) and rendering its values into an existing fillable PDF or Excel template that customers already expect to receive.

## The problem

Large organizations rarely want their data as JSON. They want it in the forms they already use -- the state DOT form, the vendor purchase order, the IRS tax form, the insurance claim PDF. They already have the templates. They already have the downstream business processes. They just need the fields filled in.

Meanwhile, the platform producing the data already knows the shape of its own payload. What's missing is a **mapping** -- a declarative description of which JSON address feeds which form field -- that can be authored once, stored alongside the form template, and then used by code to perform the fill deterministically.

Manyfest Conversion provides that mapping format and the tooling to author it, apply it, and audit the results.

## What you get

- A **mapping manyfest** file format (standard Manyfest JSON with custom descriptor keys)
- A **builder service** that bootstraps mapping manyfests from a flat CSV (one row per target field), grouping by target file
- A **PDF filler service** that uses an existing fillable PDF template and a source JSON to produce a filled PDF via `pdftk`
- A **XLSX filler service** that does the same for Excel workbooks, preserving all formatting via `exceljs`
- A **conversion report service** that writes a sidecar JSON next to every filled artifact enumerating every success, warning, and error
- A **CLI (`mfconv`)** that exposes the services as four commands (`build-mappings`, `fill-pdf`, `fill-xlsx`, `convert-batch`)
- A **programmatic API** so the same services can be used directly from Node code without the CLI

## When to use each command

| Command | Use it when |
|---------|-------------|
| `extract-fields` | You have a new fillable PDF and do **not** yet have a mapping CSV. The command sniffs every form field out of the PDF and emits a ready-to-edit CSV skeleton. |
| `build-mappings` | You have a CSV of field mappings (authored by a domain expert, or produced by `extract-fields` and then hand-edited) and want to produce one mapping manyfest per target form. |
| `fill-pdf`       | You have a single source JSON and want to fill a single PDF template. |
| `fill-xlsx`      | You have a single source JSON and want to fill a single Excel workbook template. |
| `convert-batch`  | You have a folder of source JSONs and a folder of mapping manyfests and want to fill every applicable target form for every matching source in one shot. |

## When to use the services directly

Skip the CLI when:

- You're running inside an existing Fable application and want to call the filler services as part of a larger workflow
- You need to build mapping manyfests programmatically from a source other than a CSV (e.g. straight from a database, or from a REST API response)
- You want to wrap the fill pipeline in a REST endpoint, a queue worker, or a web UI
- You need fine-grained control over the conversion report (e.g. redirecting errors into a different bug-tracking system)

The four services (`MappingManyfestBuilder`, `PDFFormFiller`, `XLSXFormFiller`, `ConversionReport`) are exported from the module entry point and can be registered on any Fable or Pict instance.

## The mapping manyfest format

Each mapping manyfest is a standard Manyfest JSON schema with two additions:

1. **Top-level metadata** identifying the target form, its file type, the source document type, and the source root address
2. **Custom descriptor keys** (`TargetFieldName`, `TargetFieldType`, `SourceAddressRaw`) that drive the fillers

The shape:

```json
{
  "Scope": "Bookstore::AcquisitionOrder.pdf",
  "SourceRootAddress": "OrderData",
  "TargetFile": "AcquisitionOrder.pdf",
  "TargetFileType": "PDF",
  "SourceDocumentType": "Bookstore-Acquisition",
  "Descriptors":
  {
    "Header.PONumber":
    {
      "Name": "PO Number",
      "TargetFieldName": "po_number",
      "TargetFieldType": "Text"
    }
  },
  "UnmappedTargetFields":
  [
    { "FieldName": "ship_to_signature", "FieldType": "Text", "Notes": "Not collected in the platform yet" }
  ]
}
```

Each descriptor key is a **source address** relative to `SourceRootAddress`. At fill time the filler prepends the source root (for example, `OrderData.Header.PONumber` when `SourceRootAddress` is `OrderData` and the descriptor key is `Header.PONumber`) and resolves the result through Manyfest's standard address parser.

The **`TargetFieldName`** carries the target field identifier in the form: a PDF form field name (`po_number`, `Text1`, `Check Box3`) or an Excel cell reference (`E5`, `'Line Items'!B3-14`).

`UnmappedTargetFields` is a flat list of target fields that exist in the form but have no source address yet -- this surfaces work the CSV author still needs to do.

See [Mapping Manyfest Format](mapping-manyfest-format.md) for the complete field reference.

## The source root

The `SourceRootAddress` on every mapping manyfest is prepended to each descriptor key at resolution time. This lets the same mapping manyfest run against different payload envelopes without rewriting every descriptor:

| Scenario | `SourceRootAddress` |
|----------|---------------------|
| Disk-exported sample payloads with `ReportData.FormData.*` nesting | `ReportData.FormData` |
| Platform-envelope payloads with `AppData.DocumentData.ReportData.FormData.*` nesting | `AppData.DocumentData.ReportData.FormData` |
| Flat payloads where descriptors are already root-relative | (empty string) |

Override the root at fill time with the `--source-root` CLI flag on `fill-pdf`, `fill-xlsx`, or `convert-batch`.

## Array broadcast

Target fields on Excel workbooks often span a **range of cells**, not a single cell (think: a repeating line-item table). Source payloads often express the same data as an **array of objects**. Mapping manyfest descriptors can pair them with two small conventions:

- A source address like `LineItems[].Price` means "take the `Price` field from every element of the `LineItems` array"
- A target field name like `'Line Items'!B3-14` means "write to cells B3, B4, ..., B14 in the `Line Items` sheet"

At fill time the XLSX filler pairs each array element with the corresponding cell. Size mismatches produce truncation / under-fill warnings on the sidecar report but never crash the fill.

```json
{
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
  "LineItems[].QtyOrdered":
  {
    "TargetFieldName": "'Line Items'!C3-14",
    "TargetFieldType": "Text"
  },
  "LineItems[].Price":
  {
    "TargetFieldName": "'Line Items'!D3-14",
    "TargetFieldType": "Text"
  }
}
```

See [Source Address Syntax](source-address-syntax.md) and [Target Cell and Range Syntax](target-cell-syntax.md) for the complete conventions.

## Sidecar reports

Every fill writes a companion JSON file next to the output artifact. The report lists every descriptor that was processed, bucketed into successes, warnings, and errors. Callers never have to guess whether a fill "worked" -- the report has the definitive per-field answer.

```json
{
  "SourceFile": "orders/PO-2026-0001.json",
  "SourceDocumentType": "Bookstore-Acquisition",
  "TargetFile": "AcquisitionOrder.pdf",
  "MappingManyfestScope": "Bookstore::AcquisitionOrder.pdf",
  "Timestamp": "2026-04-08T14:03:22.101Z",
  "Successes":
  [
    { "FieldName": "po_number", "SourceAddress": "OrderData.Header.PONumber", "Value": "PO-2026-0001" }
  ],
  "Warnings":
  [
    { "FieldName": "ship_to_signature", "SourceAddress": null, "Message": "Target field has no mapping." }
  ],
  "Errors": [],
  "Stats": { "TotalFields": 2, "SuccessCount": 1, "WarningCount": 1, "ErrorCount": 0 }
}
```

See [Sidecar Reports](sidecar-reports.md) for the full schema.

## Exit codes (CLI)

- `0` -- Clean fill, no errors
- `1` -- Usage or I/O error (missing file, bad flag)
- `2` -- Fill completed but one or more sidecar reports contain errors

Warnings alone never fail the exit. The design goal is "fail loudly on unrecoverable errors, but always produce a partial artifact plus a sidecar report so the operator has something to inspect."

## Next steps

- [Quick Start](quickstart.md) -- install and run an end-to-end fill in five minutes
- [Architecture](architecture.md) -- system design and data flow
- [CLI Reference](cli/overview.md) -- every command with options and examples
- [Examples](examples/README.md) -- runnable bookstore, library catalog, and IRS W-9 walkthroughs
