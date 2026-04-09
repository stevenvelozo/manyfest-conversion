# Sidecar Reports

Every fill produces two files: the filled artifact (PDF or XLSX) and a **sidecar report** (JSON) that describes the outcome of the fill at the per-field level.

The sidecar has a single purpose: **make data-quality gaps visible**. No field is silently dropped. Every descriptor either appears in the `Successes` array (written) or in `Warnings` / `Errors` (not written, with a reason).

## File naming

The sidecar is written next to the filled artifact with `.report.json` appended:

| Filled artifact | Sidecar |
|-----------------|---------|
| `filled/PO-2026-0001.pdf` | `filled/PO-2026-0001.pdf.report.json` |
| `filled/inventory-2026-04-08.xlsx` | `filled/inventory-2026-04-08.xlsx.report.json` |

`convert-batch` writes sidecars into a separate `reports/` subdirectory under the output folder instead of next to the artifacts, so the output tree stays easy to browse.

Override the sidecar path with `--sidecar <path>` on `fill-pdf` and `fill-xlsx`.

## Schema

```json
{
  "SourceFile": "sources/PO-2026-0001.json",
  "SourceDocumentType": "Bookstore-Acquisition",
  "TargetFile": "AcquisitionOrder.pdf",
  "MappingManyfestScope": "Bookstore-Acquisition::AcquisitionOrder.pdf",
  "Timestamp": "2026-04-08T14:03:22.101Z",
  "Successes":
  [
    {
      "FieldName": "po_number",
      "SourceAddress": "OrderData.Header.PONumber",
      "Value": "PO-2026-0001"
    }
  ],
  "Warnings":
  [
    {
      "FieldName": "ship_to_signature",
      "SourceAddress": null,
      "Message": "Target field has no mapping."
    }
  ],
  "Errors":
  [
    {
      "FieldName": "line1_title",
      "SourceAddress": "OrderData.LineItems[0].Title",
      "Message": "Source address resolved to an object/array, not a scalar."
    }
  ],
  "Stats":
  {
    "TotalFields": 3,
    "SuccessCount": 1,
    "WarningCount": 1,
    "ErrorCount": 1
  }
}
```

## Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `SourceFile` | string | Path to the source JSON that drove this fill. |
| `SourceDocumentType` | string | `ReportData.DocumentType` value of the source. Copied from the mapping manyfest's `SourceDocumentType`. |
| `TargetFile` | string | Filename of the target form. Copied from the mapping manyfest's `TargetFile`. |
| `MappingManyfestScope` | string | The `Scope` of the mapping manyfest used. Useful when several mappings target the same filename. |
| `Timestamp` | string | ISO 8601 timestamp captured at `newReport` time (not at write time). |
| `Successes` | array | See below. |
| `Warnings` | array | See below. |
| `Errors` | array | See below. |
| `Stats` | object | Roll-up counts. |

## Success entries

Each entry in `Successes` describes one descriptor that was resolved and written to the output artifact.

```json
{
  "FieldName": "po_number",
  "SourceAddress": "OrderData.Header.PONumber",
  "Value": "PO-2026-0001"
}
```

| Field | Description |
|-------|-------------|
| `FieldName` | The target field identifier. For XLSX array broadcast the entry uses the form `<range spec> -> <cell>` (e.g. `'Line Items'!B3-14 -> B3`). |
| `SourceAddress` | The fully-qualified source address (including the `SourceRootAddress` prefix). |
| `Value` | The scalar value that was written. For array broadcast this is the per-element value, and the `SourceAddress` ends with ` [i]`. |

## Warning entries

Each entry in `Warnings` describes a descriptor that was **not** written, but where the failure is soft -- typically because the source value is missing or the descriptor type is unsupported.

```json
{
  "FieldName": "ship_to_signature",
  "SourceAddress": null,
  "Message": "Target field has no mapping."
}
```

Common warning messages:

| Message | Cause |
|---------|-------|
| `Source address did not resolve to a value in the payload.` | The source address resolved to `null` or `undefined`. The field in the form will remain blank. |
| `PDF checkbox/Button mappings are warn-and-skip in manyfest-conversion v1.` | The descriptor's `TargetFieldType` is `'Button'`. See the architecture doc for the rationale. |
| `Element at index N is missing or null.` | Array-broadcast source had a null/undefined element. Other elements in the array may still be written. |
| `Scalar source paired with a N-cell range; refusing to broadcast a single value.` | A scalar source was paired with a multi-cell target range. No cells were written. |
| `Source array has N elements but target range has M cells; truncated X value(s).` | Array-broadcast source was longer than the target range. |
| `Source array has N elements but target range has M cells; X cell(s) left untouched.` | Array-broadcast source was shorter than the target range. The extra cells kept their template content. |

Warnings are **never fatal**. The fill always produces an output artifact even when every descriptor produces a warning.

## Error entries

Each entry in `Errors` describes a descriptor that failed to resolve for a hard reason -- the source address is broken, the target sheet doesn't exist, or the source value is a type the filler cannot handle.

```json
{
  "FieldName": "line1_title",
  "SourceAddress": "OrderData.LineItems[0].Title",
  "Message": "Source address resolved to an object/array, not a scalar."
}
```

Common error messages:

| Message | Cause |
|---------|-------|
| `Source address resolved to an object/array, not a scalar.` | A non-array source address resolved to a JS object or array. Usually means the mapping is pointing at the wrong level of the source JSON. |
| `Error resolving source address: <details>` | The Manyfest address parser threw. Usually a malformed address. |
| `Source array prefix [<path>] did not resolve to an array.` | An array-broadcast address's prefix resolved to something that wasn't an array. |
| `Sheet [<name>] not found in workbook.` | The XLSX target specifies a sheet that does not exist in the template. |
| `Could not parse cell reference [<raw>]` | The target cell reference could not be parsed as A1 notation. |
| `Error writing cell: <details>` | The exceljs Cell write threw. |
| `PDF fill failed: <details>` | `pdftk` exited non-zero. The output PDF was not written. This is typically the only per-file (rather than per-field) error. |
| `Template PDF does not exist: <path>` | The template path could not be resolved. |

Errors **do not** abort the fill loop on a per-field basis. Even if every descriptor errors, the filler still writes the (partial or unchanged) output artifact and the sidecar. This gives the operator something to inspect.

Errors **do** influence the CLI exit code: `convert-batch` exits `2` if any sidecar has a non-zero `ErrorCount`, regardless of how many warnings are present.

## Stats block

```json
{
  "Stats":
  {
    "TotalFields": 6,
    "SuccessCount": 4,
    "WarningCount": 2,
    "ErrorCount": 0
  }
}
```

| Field | Description |
|-------|-------------|
| `TotalFields` | Sum of `SuccessCount + WarningCount + ErrorCount`. Note this can differ from the number of descriptors when array broadcast expands a single descriptor into many per-element entries. |
| `SuccessCount` | Number of entries in `Successes`. |
| `WarningCount` | Number of entries in `Warnings`. |
| `ErrorCount` | Number of entries in `Errors`. |

Stats are computed by `ConversionReport.finalize()`, which is called automatically by `writeSidecar()`. If you mutate `Successes` / `Warnings` / `Errors` manually after finalizing, call `finalize` again before writing.

## Programmatic access

The entire report is just a plain JS object and a plain JSON file. There is no schema validation and no required framework to read it back -- `JSON.parse` is enough.

```javascript
const tmpSidecar = JSON.parse(libFS.readFileSync('./filled/PO-2026-0001.pdf.report.json', 'utf8'));

if (tmpSidecar.Stats.ErrorCount > 0)
{
    console.error(`Fill had ${tmpSidecar.Stats.ErrorCount} errors:`);
    for (const tmpError of tmpSidecar.Errors)
    {
        console.error(`  ${tmpError.FieldName}: ${tmpError.Message}`);
    }
    process.exit(1);
}
```

## Aggregating sidecars (batch runs)

After a `convert-batch` run, aggregate sidecar stats with a tiny script:

```javascript
const libFS = require('fs');
const libPath = require('path');

const reportsDir = './output/reports';
const tmpFiles = libFS.readdirSync(reportsDir).filter((n) => n.endsWith('.report.json'));

let tmpTotal = 0;
let tmpSuccess = 0;
let tmpWarn = 0;
let tmpError = 0;

for (const tmpFile of tmpFiles)
{
    const tmpReport = JSON.parse(libFS.readFileSync(libPath.join(reportsDir, tmpFile), 'utf8'));
    tmpTotal += tmpReport.Stats.TotalFields;
    tmpSuccess += tmpReport.Stats.SuccessCount;
    tmpWarn += tmpReport.Stats.WarningCount;
    tmpError += tmpReport.Stats.ErrorCount;
}

console.log(`${tmpFiles.length} sidecars, ${tmpTotal} total fields`);
console.log(`  successes: ${tmpSuccess}`);
console.log(`  warnings : ${tmpWarn}`);
console.log(`  errors   : ${tmpError}`);
```

## See also

- [Implementation Reference: ConversionReport](implementation-reference.md#conversionreport) -- the service API
- [CLI Reference](cli/overview.md) -- CLI exit codes and the `--sidecar` flag
- [Architecture](architecture.md#exit-code-contract) -- the exit-code contract and why warnings don't fail
