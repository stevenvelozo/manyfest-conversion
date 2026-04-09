# fill-pdf

Fill a single fillable PDF form from a single source JSON payload using a single mapping manyfest. Requires `pdftk` (or `pdftk-java`) on the PATH.

**Aliases:** `fp`, `fill_pdf`

## Usage

```shell
mfconv fill-pdf -m <mapping.json> -s <source.json> -t <template.pdf> -o <output.pdf> [options]
```

## Options

| Option | Required | Description | Default |
|--------|----------|-------------|---------|
| `-m, --mapping <filepath>` | Yes | Path to the mapping manyfest JSON file. | -- |
| `-s, --source <filepath>` | Yes | Path to the source JSON payload. | -- |
| `-t, --template <filepath>` | Yes | Path to the fillable PDF template. | -- |
| `-o, --output <filepath>` | Yes | Path to write the filled PDF to. | -- |
| `-r, --source-root <address>` | No | Override the `SourceRootAddress` stored in the mapping manyfest. | (use mapping's stored value) |
| `--sidecar <filepath>` | No | Override the sidecar report output path. | `<output>.report.json` |

## How it works

1. Loads the mapping manyfest from disk as a live Manyfest instance.
2. Reads and `JSON.parse`s the source file.
3. Iterates every descriptor on the mapping manyfest and builds an XFDF document, XML-escaping each value.
4. `Button`-typed descriptors are warn-and-skipped (see [Architecture](../architecture.md#pdf-fill-xfdf--pdftk)).
5. Descriptors whose source address doesn't resolve are warned and skipped.
6. Writes the XFDF to a temp file under `os.tmpdir()`.
7. Shells out to `pdftk <template> fill_form <xfdf> output <output>` via `execFile` (not `exec`).
8. Cleans up the temp file.
9. Writes the sidecar report next to the output PDF.

## Output

The filled PDF is written to `-o`. The sidecar is written to `--sidecar` (or `<output>.report.json` if not specified). The sidecar captures every success, warning, and error from the fill -- see [Sidecar Reports](../sidecar-reports.md).

Console output summary:

```text
Filled PDF written to ./filled/PO-2026-0001.pdf
Sidecar report written to ./filled/PO-2026-0001.pdf.report.json
Stats: 6 success, 0 warning, 0 error (6 total)
```

## Exit codes

- `0` -- Clean fill. `ErrorCount === 0` on the sidecar.
- `1` -- Usage error: missing flag, nonexistent input file, unreadable mapping or source JSON, `pdftk` not installed, template PDF missing.
- `2` -- Fill completed but the sidecar contains one or more errors.

## Examples

### Basic fill

```shell
mfconv fill-pdf \
  -m ./translations/AcquisitionOrder.pdf.mapping.json \
  -s ./sources/PO-2026-0001.json \
  -t ./templates/AcquisitionOrder.pdf \
  -o ./filled/PO-2026-0001.pdf
```

### Override the source root

If your source JSONs have their data nested under `ReportData.OrderData` instead of the default `ReportData.FormData`:

```shell
mfconv fill-pdf \
  -m ./translations/AcquisitionOrder.pdf.mapping.json \
  -s ./sources/PO-2026-0001.json \
  -t ./templates/AcquisitionOrder.pdf \
  -o ./filled/PO-2026-0001.pdf \
  --source-root "ReportData.OrderData"
```

### Custom sidecar location

Put the sidecar into a dedicated reports folder instead of next to the filled PDF:

```shell
mkdir -p ./reports
mfconv fill-pdf \
  -m ./translations/AcquisitionOrder.pdf.mapping.json \
  -s ./sources/PO-2026-0001.json \
  -t ./templates/AcquisitionOrder.pdf \
  -o ./filled/PO-2026-0001.pdf \
  --sidecar ./reports/PO-2026-0001.json
```

### Using the alias

```shell
mfconv fp -m mapping.json -s source.json -t template.pdf -o out.pdf
```

## Verifying the fill

After running the command you can confirm the field values landed by dumping the filled PDF's form data with `pdftk` directly:

```shell
pdftk ./filled/PO-2026-0001.pdf dump_data_fields
```

Look for the field name you expected to fill and its `FieldValue`:

```text
---
FieldType: Text
FieldName: po_number
FieldFlags: 8388608
FieldValue: PO-2026-0001
FieldJustification: Left
```

## Common issues

### `pdftk binary not found on PATH`

The PDF filler shells out to `pdftk` (or `pdftk-java`). Install one of them:

```shell
brew install pdftk-java          # macOS
apt  install pdftk               # Debian / Ubuntu
```

### `Template PDF does not exist`

The `-t` path could not be resolved relative to the current directory. Use an absolute path or cd into the directory containing the template before running.

### All fields have warnings saying "Source address did not resolve"

The mapping manyfest's `SourceRootAddress` is wrong for this source JSON. Override with `--source-root` to point at the actual data root. See the quickstart for a worked example.

### `Source address resolved to an object/array, not a scalar`

The descriptor's source address is pointing at an object or array, not a primitive. Check the source JSON shape against the descriptor's address and the full resolved path in the sidecar error message.

## See also

- [Mapping Manyfest Format](../mapping-manyfest-format.md)
- [Sidecar Reports](../sidecar-reports.md)
- [Architecture: PDF fill](../architecture.md#pdf-fill-xfdf--pdftk)
- [Implementation Reference: PDFFormFiller](../implementation-reference.md#pdfformfiller)
- [fill-xlsx](fill-xlsx.md) -- the XLSX counterpart
- [convert-batch](convert-batch.md) -- the batch counterpart
