# fill-xlsx

Fill a single Excel workbook from a single source JSON payload using a single mapping manyfest. Uses `exceljs`, so fonts, borders, merged cells, and sheet themes on the template are preserved exactly.

**Aliases:** `fx`, `fill_xlsx`

## Usage

```shell
mfconv fill-xlsx -m <mapping.json> -s <source.json> -t <template.xlsx> -o <output.xlsx> [options]
```

## Options

| Option | Required | Description | Default |
|--------|----------|-------------|---------|
| `-m, --mapping <filepath>` | Yes | Path to the mapping manyfest JSON file. | -- |
| `-s, --source <filepath>` | Yes | Path to the source JSON payload. | -- |
| `-t, --template <filepath>` | Yes | Path to the XLSX template. | -- |
| `-o, --output <filepath>` | Yes | Path to write the filled XLSX to. | -- |
| `-r, --source-root <address>` | No | Override the `SourceRootAddress` stored in the mapping manyfest. | (use mapping's stored value) |
| `--sidecar <filepath>` | No | Override the sidecar report output path. | `<output>.report.json` |

## How it works

1. Loads the mapping manyfest from disk as a live Manyfest instance.
2. Reads and `JSON.parse`s the source file.
3. Loads the template with `new ExcelJS.Workbook().xlsx.readFile()`.
4. Iterates every descriptor on the mapping manyfest. For each descriptor:
   - Parses the target cell spec to get a sheet name and a list of cell addresses (1 for a single cell, N for a range).
   - Resolves the source value through `resolveSourceValue` (scalar, array, missing, or error).
   - Pairs the resolved value with the target cell(s):
     - scalar + single cell -> write
     - array + range -> pair element-by-element
     - scalar + range -> warn (refuses to broadcast)
     - array + single cell -> warn
   - Writes each value via `worksheet.getCell(address).value = String(value)` (which preserves the cell's existing style metadata).
5. Saves the workbook with `wb.xlsx.writeFile()`.
6. Writes the sidecar report.

## Formatting preservation

exceljs reads and writes the entire workbook including:

- All worksheets and their contents
- Fonts, sizes, colors, bold/italic
- Cell borders, fills, number formats
- Alignment, text rotation, wrap text
- Merged cells
- Defined names
- Column widths and row heights
- Sheet visibility
- Most workbook themes

Setting `cell.value = newValue` on an exceljs `Cell` replaces only the value. All the style metadata is untouched.

## Output

The filled XLSX is written to `-o`. The sidecar is written to `--sidecar` (or `<output>.report.json` if not specified).

Console output summary:

```text
Filled XLSX written to ./filled/inventory-2026-04-08.xlsx
Sidecar report written to ./filled/inventory-2026-04-08.xlsx.report.json
Stats: 143 success, 1 warning, 0 error (144 total)
```

## Exit codes

- `0` -- Clean fill.
- `1` -- Usage error or input file missing.
- `2` -- Fill completed but the sidecar contains errors.

## Examples

### Basic fill

```shell
mfconv fill-xlsx \
  -m ./translations/InventorySheet.xlsx.mapping.json \
  -s ./sources/inventory-2026-04-08.json \
  -t ./templates/InventorySheet.xlsx \
  -o ./filled/inventory-2026-04-08.xlsx
```

### Array broadcast over a cell range

Given a mapping manyfest descriptor like this:

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
  }
}
```

And a source JSON like this:

```json
{
  "ReportData":
  {
    "DocumentType": "Bookstore-Acquisition",
    "OrderData":
    {
      "LineItems":
      [
        { "ISBN": "9780143127796", "Title": "Sapiens", "QtyOrdered": 12 },
        { "ISBN": "9780451524935", "Title": "1984",    "QtyOrdered": 8 },
        { "ISBN": "9780316769488", "Title": "Catcher in the Rye", "QtyOrdered": 5 }
      ]
    }
  }
}
```

Run:

```shell
mfconv fill-xlsx \
  -m ./translations/InventorySheet.xlsx.mapping.json \
  -s ./sources/PO-2026-0001.json \
  -t ./templates/InventorySheet.xlsx \
  -o ./filled/PO-2026-0001.xlsx \
  --source-root "ReportData.OrderData"
```

The three LineItems pair up with rows 3-5 of each column. Rows 6-14 are left untouched (their template content is preserved) and one warning per column is logged explaining the under-fill.

### Custom sidecar location

```shell
mfconv fill-xlsx \
  -m mapping.json -s source.json -t template.xlsx -o filled.xlsx \
  --sidecar /tmp/outcome.json
```

### Using the alias

```shell
mfconv fx -m mapping.json -s source.json -t template.xlsx -o filled.xlsx
```

## Verifying the fill

Open the filled workbook in Excel, Numbers, or LibreOffice -- you should see the values in the expected cells with all original formatting intact.

For programmatic verification, load the filled workbook with `exceljs` yourself:

```javascript
const libExcelJS = require('exceljs');
const wb = new libExcelJS.Workbook();
await wb.xlsx.readFile('./filled/PO-2026-0001.xlsx');
const sheet = wb.getWorksheet('Line Items');
console.log(sheet.getCell('A3').value);  // '9780143127796'
console.log(sheet.getCell('B3').value);  // 'Sapiens'
```

## Common issues

### `Sheet [<name>] not found in workbook`

The descriptor's target field references a sheet name that doesn't exist in the template. Check the exact sheet name in Excel -- `'FIELD DATA SHEET'` and `'Field Data Sheet'` are different to exceljs.

### All cells have warnings saying "Source address did not resolve"

Same cause as `fill-pdf`: the `SourceRootAddress` on the mapping manyfest doesn't match the actual source JSON nesting. Override with `--source-root`.

### `Source array has N elements but target range has M cells; ... cell(s) left untouched`

Expected behavior when your source array is shorter than the target range. Not an error -- the partial fill still happens, the report just tells you some cells were skipped.

### Numbers become strings in Excel

The filler writes everything as strings because platform payloads already stringify their numeric values. If the target cell has a number format code (say, `"$#,##0.00"`), Excel will typically re-parse the string on open and render it correctly. If not, cast upstream in your source JSON generator.

## See also

- [Target Cell and Range Syntax](../target-cell-syntax.md) -- the complete cell/range grammar
- [Source Address Syntax](../source-address-syntax.md#array-broadcast--empty-brackets) -- the array broadcast convention
- [Sidecar Reports](../sidecar-reports.md)
- [Architecture: XLSX fill](../architecture.md#xlsx-fill-exceljs-not-sheetjs)
- [Implementation Reference: XLSXFormFiller](../implementation-reference.md#xlsxformfiller)
- [fill-pdf](fill-pdf.md) -- the PDF counterpart
- [convert-batch](convert-batch.md) -- the batch counterpart
