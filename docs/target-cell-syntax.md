# Target Cell and Range Syntax

The `TargetFieldName` on a mapping manyfest descriptor identifies the field in the target form that will receive the resolved source value. The syntax depends on whether the target form is a PDF or an XLSX.

## PDF target field names

PDF targets are **form field names** exactly as they appear in the fillable PDF's AcroForm definition. No special syntax: just the field name as a string.

```json
{
  "Header.PONumber":
  {
    "TargetFieldName": "po_number",
    "TargetFieldType": "Text"
  },
  "Header.VendorName":
  {
    "TargetFieldName": "vendor_name",
    "TargetFieldType": "Text"
  }
}
```

To discover the field names in an existing PDF, use `pdftk` directly:

```shell
pdftk path/to/form.pdf dump_data_fields | grep FieldName
```

Field names can contain spaces, dots, and numbers:

```json
"Text1"
"Check Box3"
"control sec id"
"Text11.2.0"
```

The filler XML-escapes the field name before emitting it into the XFDF, so you don't need to worry about special characters.

### Field types

`TargetFieldType` tells the filler how to handle the field:

| Type | Behavior |
|------|----------|
| `Text` | Resolve the source value and write it to the field. |
| `Button` | Warn and skip. PDF checkbox/radio handling is out of scope for v1. |

If `TargetFieldType` is missing or any other value, the filler treats the field as `Text`.

## XLSX target cell references

XLSX targets are cell references in A1 notation, optionally qualified by a sheet name. Four forms are supported.

### Bare cell address

```text
E5
```

Writes to cell `E5` on the workbook's **first worksheet**. Use this only when the workbook has one sheet or when the default sheet is the right target.

```json
{
  "Header.PONumber":
  {
    "TargetFieldName": "E5",
    "TargetFieldType": "Text"
  }
}
```

### Qualified cell address (quoted sheet name)

```text
'Line Items'!E5
```

The sheet name is wrapped in single quotes (Excel's convention for sheet names with spaces or special characters). Writes to cell `E5` on the `Line Items` worksheet.

### Qualified cell address (trailing-quote-only)

```text
FIELD DATA SHEET'!E5
```

Some CSVs (including the MDOT sample) carry an asymmetric trailing-only single quote. The parser tolerates this and treats it the same as `'FIELD DATA SHEET'!E5`.

### Qualified cell address (unquoted)

```text
Sheet1!A1
```

No quotes at all. Works for sheet names that don't need escaping.

## XLSX cell ranges

A `TargetFieldName` can describe a **range of cells** instead of a single cell. Three range forms are supported.

### Hyphen shorthand (single column)

```text
O14-25
'Line Items'!B3-14
```

Means column `O`, rows 14 through 25 inclusive (12 cells). This is the form the sample CSVs use.

Expansion:

```text
O14-25  ->  O14, O15, O16, O17, O18, O19, O20, O21, O22, O23, O24, O25
```

The hyphen shorthand is **single-column only**. Use a colon range for rectangular ranges.

### Colon range (single column)

```text
B2:B5
'Line Items'!B3:B14
```

Equivalent to the hyphen shorthand for single-column ranges:

```text
B2:B5  ->  B2, B3, B4, B5
```

### Colon range (rectangular, row-major)

```text
A1:C2
'Dashboard'!D10:F12
```

Expands row-major (left-to-right, then top-to-bottom):

```text
A1:C2  ->  A1, B1, C1, A2, B2, C2
D10:F12 -> D10, E10, F10, D11, E11, F11, D12, E12, F12
```

Rectangular ranges are rarely useful for form fills, but are supported for completeness.

## Pairing source and target

The XLSX filler pairs the resolved source value with the target cell addresses using four rules:

| Source | Target | Behavior |
|--------|--------|----------|
| scalar | single cell | Write the value to the cell. |
| scalar | range (>1 cell) | Warn: "scalar paired with range; refusing to broadcast". No cells written. |
| array  | single cell | Warn: "array paired with single cell". No cell written. |
| array  | range (>1 cell) | Pair element-by-element by index. |

### Size mismatch on array+range

When both source and target are multi-element, the filler pairs them up to `min(source.length, target.length)` and warns on the mismatch:

- **Source longer than target:** values beyond the target range are dropped; one truncation warning is logged.
- **Target longer than source:** cells beyond the source values are left untouched (their existing content is preserved); one under-fill warning is logged.

Example: `LineItems[].Price` resolves to 3 elements but the target range is `B3-14` (12 cells). The filler writes 3 cells (`B3`, `B4`, `B5`) and warns "Source array has 3 elements but target range has 12 cells; 9 cell(s) left untouched".

## Column letters and indices

Column letters follow Excel's convention. The filler handles the letter<->index conversion internally:

| Letters | Index |
|---------|-------|
| `A` | 1 |
| `Z` | 26 |
| `AA` | 27 |
| `AZ` | 52 |
| `BA` | 53 |
| `ZZ` | 702 |
| `AAA` | 703 |

Mapping manyfests can use any column up to Excel's limit (`XFD`, column 16384).

## Default sheet behavior

If `TargetFieldName` is a bare cell address (no sheet qualifier), the filler uses the workbook's **first worksheet** (`wb.worksheets[0]`). In a multi-sheet workbook this may not be the sheet you expect -- always qualify bare addresses with a sheet name unless you are certain the default is correct.

## Style preservation

The XLSX filler sets `cell.value` via exceljs's `Cell` API. This preserves the cell's existing style metadata (font, alignment, border, fill, number format) by design. You don't need to do anything special in the mapping manyfest to preserve formatting -- it's automatic.

If a cell in the template has a specific number format (say, `"$#,##0.00"`), the filler writes the value as a string but Excel will re-parse and re-format it on open according to the cell's format code. For most practical cases this is what you want.

## See also

- [Source Address Syntax](source-address-syntax.md) -- the source side of the mapping
- [Mapping Manyfest Format](mapping-manyfest-format.md) -- the overall file shape
- [Implementation Reference](implementation-reference.md#xlsxformfiller) -- the `parseTargetCellSpec` and `expandCellRange` helpers in detail
