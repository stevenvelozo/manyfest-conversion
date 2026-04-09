# build-mappings

Parse a mapping CSV and write one mapping manyfest JSON per target form. This is typically the first command you run when bootstrapping a new set of mappings -- it converts a flat CSV (authored by a domain expert in a spreadsheet tool) into the per-form JSON files that the filler commands consume.

**Aliases:** `bm`, `build_mappings`

## Usage

```shell
mfconv build-mappings -i <csv> -o <dir> [--source-root <address>]
mfconv build-mappings <csv> -o <dir>                             # positional input file
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[file]` | No | Path to the mapping CSV (alternative to `-i`). If both the positional argument and `-i` are supplied, `-i` wins. |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <filepath>` | The mapping CSV to parse. | -- |
| `-o, --output <dirpath>` | Directory to write `.mapping.json` files into. Created if it does not exist. | `./mfconv-mappings` |
| `-r, --source-root <address>` | `SourceRootAddress` to bake into every produced mapping manyfest. | `ReportData.FormData` |

## CSV schema

The CSV must have the following columns (header row required, order flexible):

| Column | Purpose |
|--------|---------|
| `Sort` | Optional numeric sort order. Copied to `SourceSortOrder` on the descriptor. |
| `PDF File` | Target form filename (PDF or XLSX). **Required.** Rows are grouped by this column into one manyfest per file. |
| `Field Type` | `Text` or `Button`. Copied to `TargetFieldType`. |
| `Field Name` | Target field identifier: PDF form field name or Excel cell reference. Copied to `TargetFieldName`. |
| `Form` | The `ReportData.DocumentType` value that source JSONs must carry to route to this mapping. Stored as `SourceDocumentType`. |
| `Document Data Long Filler` | (Optional) prefix used when reconstructing the long-form source path. Stored as `SourceRootFullPath`. |
| `Form Input Address` | Source JSON address (relative to `SourceRootAddress`). **Empty rows become `UnmappedTargetFields` entries.** |
| `Form Input Address Long` | (Optional) full absolute source path. Stored as `SourceAddressLong` on the descriptor. |
| `Notes` | Free-form notes. Copied to `Notes` on the descriptor. |

## Output

For every distinct value of `PDF File`, `build-mappings` writes one file:

```text
<output-dir>/<sanitized-target-filename>.mapping.json
```

Non-alphanumeric characters in the target filename are replaced with underscores:

| `PDF File` value | Output filename |
|------------------|-----------------|
| `AcquisitionOrder.pdf` | `AcquisitionOrder.pdf.mapping.json` |
| `HMA - Data Sheet - MI.xlsx` | `HMA_-_Data_Sheet_-_MI.xlsx.mapping.json` |

A `build-report.json` file is also written into the output directory summarizing the build (rows parsed, rows accepted, rows skipped, per-form counts, skip reasons). This file is helpful for auditing the CSV -- if a row was silently dropped, it will appear in the skip reasons.

## Exit codes

- `0` -- CSV parsed successfully; all rows were either accepted or skipped with a reason recorded.
- `1` -- CSV file does not exist, output directory cannot be created, or the CSVParser service is unavailable.

## Examples

### Basic invocation

```shell
mfconv build-mappings -i ./mappings.csv -o ./translations
```

Console output:

```text
Building mapping manyfests from [./mappings.csv]...
Parsed 120 CSV rows (118 accepted, 2 skipped).
Discovered 4 distinct target forms:
  -> [PDF]  AcquisitionOrder.pdf (42 mapped, 0 unmapped)
  -> [PDF]  ReturnRequest.pdf (18 mapped, 3 unmapped)
  -> [XLSX] InventorySheet.xlsx (46 mapped, 0 unmapped)
  -> [PDF]  StoreCreditSlip.pdf (12 mapped, 5 unmapped)
Wrote 4 mapping manyfest file(s) to ./translations
2 row(s) were skipped.  Details in ./translations/build-report.json
```

### Override the source root

Bake `ReportData.OrderData` into every produced manyfest instead of the default `ReportData.FormData`:

```shell
mfconv build-mappings -i ./mappings.csv -o ./translations --source-root "ReportData.OrderData"
```

### Positional input argument

```shell
mfconv build-mappings ./mappings.csv -o ./translations
```

### Using the alias

```shell
mfconv bm -i ./mappings.csv -o ./translations
```

## Reading the build report

Every run writes `<output-dir>/build-report.json`:

```json
{
  "RowsParsed": 120,
  "RowsSkipped": 2,
  "RowsAccepted": 118,
  "FormCount": 4,
  "Forms":
  {
    "AcquisitionOrder.pdf": { "DescriptorCount": 42, "UnmappedCount": 0, "TargetFileType": "PDF" },
    "ReturnRequest.pdf": { "DescriptorCount": 18, "UnmappedCount": 3, "TargetFileType": "PDF" },
    "InventorySheet.xlsx": { "DescriptorCount": 46, "UnmappedCount": 0, "TargetFileType": "XLSX" },
    "StoreCreditSlip.pdf": { "DescriptorCount": 12, "UnmappedCount": 5, "TargetFileType": "PDF" }
  },
  "SkipReasons":
  [
    { "Row": 57, "TargetFile": "ReturnRequest.pdf", "FieldName": "Text22", "Reason": "Duplicate source address \"Header.CustomerEmail\" on form \"ReturnRequest.pdf\"; keeping first occurrence" },
    { "Row": 101, "TargetFile": "StoreCreditSlip.pdf", "Reason": "Missing Field Name" }
  ],
  "Errors": []
}
```

Useful fields:

- `FormCount` -- how many distinct target forms the CSV covered
- `Forms[name].DescriptorCount` -- how many target fields were wired to a source
- `Forms[name].UnmappedCount` -- how many target fields were enumerated but have no source yet
- `SkipReasons` -- why individual rows were dropped (typically duplicate addresses, missing columns)

## See also

- [Mapping Manyfest Format](../mapping-manyfest-format.md) -- the shape of the produced files
- [Source Address Syntax](../source-address-syntax.md) -- what goes in the `Form Input Address` column
- [Target Cell and Range Syntax](../target-cell-syntax.md) -- what goes in the `Field Name` column for XLSX targets
- [fill-pdf](fill-pdf.md) / [fill-xlsx](fill-xlsx.md) -- the next step: apply a mapping manyfest to a source JSON
