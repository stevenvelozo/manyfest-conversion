# extract-fields

Extract fillable form fields from a PDF and emit a ready-to-fill mapping CSV. Under the hood this shells out to `pdftk <pdf> dump_data_fields` (the same binary `fill-pdf` uses) and parses the output into one CSV row per form field.

This is typically the **very first** command you run when wiring up a new PDF form -- before you even have a mapping CSV. Run `extract-fields`, hand-edit the `Form Input Address` and `Form` columns of the produced CSV, then run [`build-mappings`](build-mappings.md) on it to get a mapping manyfest JSON.

**Aliases:** `ef`, `extract_fields`

## Usage

```shell
mfconv extract-fields -i <pdf> [-o <csv>] [-f <form-name>]
mfconv extract-fields <pdf>                                # positional input
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[file]` | No | Path to the PDF (alternative to `-i`). If both are supplied, `-i` wins. |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <filepath>` | The PDF file to extract fields from. | -- |
| `-o, --output <filepath>` | The CSV file to write. | `<pdf-dir>/<pdf-basename>-ManyfestMapping.csv` |
| `-f, --form <name>` | Value to bake into every row's `Form` column (the `ReportData.DocumentType` routing key). | empty |
| `-d, --document-data-long-filler <prefix>` | Value to bake into every row's `Document Data Long Filler` column. | empty |

## Default output filename

Given `/path/to/Washington-Drivers-Form.pdf` the default output path is:

```text
/path/to/Washington-Drivers-Form-ManyfestMapping.csv
```

The directory is the same as the input PDF; the filename strips `.pdf` and appends `-ManyfestMapping.csv`.

## CSV output shape

The produced CSV uses the **exact same column layout** that [`build-mappings`](build-mappings.md) consumes, so the output can be hand-edited and then fed straight back through `mfconv build-mappings`:

```csv
Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes
1,Washington-Drivers-Form.pdf,Text,first_name,WA-DriversLicense,,,,Flags: 8388608
2,Washington-Drivers-Form.pdf,Text,last_name,WA-DriversLicense,,,,Flags: 8388608
3,Washington-Drivers-Form.pdf,Text,dob,WA-DriversLicense,,,,Flags: 8388608; Justification: Center
4,Washington-Drivers-Form.pdf,Button,is_organ_donor,WA-DriversLicense,,,,Flags: 0; States: Off|Yes
...
```

Per column:

- **`Sort`** -- sequential 1, 2, 3 ... matching the order pdftk emits fields.
- **`PDF File`** -- the PDF filename (basename of the input path).
- **`Field Type`** -- `Text`, `Button`, `Choice`, or whatever pdftk reports.
- **`Field Name`** -- the AcroForm field name exactly as pdftk emits it. Works unchanged for hierarchical names like `topmostSubform[0].Page1[0].f1_01[0]`.
- **`Form`** -- the `-f` value if supplied, otherwise empty. The CSV author fills this in if they didn't pass `-f`.
- **`Document Data Long Filler`** -- the `-d` value if supplied, otherwise empty.
- **`Form Input Address`** -- **always empty**. This is what the human author needs to fill in: which JSON source address (relative to `SourceRootAddress`) feeds this field.
- **`Form Input Address Long`** -- always empty. Optional; most authors leave it blank.
- **`Notes`** -- auto-populated with any interesting metadata pdftk surfaced about the field: tooltip (`FieldNameAlt`), non-Left justification, non-zero flags, and button state options.

Because every `Form Input Address` cell is empty in a freshly-extracted CSV, running it unchanged through [`build-mappings`](build-mappings.md) will produce a mapping manyfest whose `Descriptors` is empty and whose `UnmappedTargetFields` contains every field in the form. That is a completely valid intermediate state -- the manyfest is a "skeleton" awaiting source addresses.

## Typical workflow

```shell
# 1. Pull every field out of the PDF into a ready-to-edit CSV
mfconv extract-fields -i path/to/Washington-Drivers-Form.pdf -f WA-DriversLicense

# 2. Hand-edit the produced CSV in your favorite spreadsheet tool.  Fill in
#    the "Form Input Address" column for every row that has a source address;
#    leave rows empty for fields that will be filled by hand on the printed
#    form (signature lines, date lines).

# 3. Build the mapping manyfest from the completed CSV
mfconv build-mappings \
  -i path/to/Washington-Drivers-Form-ManyfestMapping.csv \
  -o ./translations

# 4. Fill the form from a source JSON payload
mfconv fill-pdf \
  -m ./translations/Washington-Drivers-Form.pdf.mapping.json \
  -s ./sources/applicant-1234.json \
  -t ./templates/Washington-Drivers-Form.pdf \
  -o ./filled/applicant-1234.pdf
```

## Exit codes

- `0` -- PDF was read, fields extracted, CSV written
- `1` -- Usage error, missing PDF, pdftk not installed, or pdftk returned a non-zero status

## Examples

### Basic extraction (default output filename)

```shell
mfconv extract-fields -i ./forms/Washington-Drivers-Form.pdf
```

Writes `./forms/Washington-Drivers-Form-ManyfestMapping.csv`.

Console output:

```text
Extracting fields from [./forms/Washington-Drivers-Form.pdf]...
Extracted 30 field(s) from Washington-Drivers-Form.pdf
  -> Button: 4
  -> Text: 26
Wrote mapping CSV to ./forms/Washington-Drivers-Form-ManyfestMapping.csv
Next step: hand-edit the "Form Input Address" and "Form" columns, then run: mfconv build-mappings -i Washington-Drivers-Form-ManyfestMapping.csv -o ./translations
```

### Bake a Form name into every row

```shell
mfconv extract-fields \
  -i ./forms/Washington-Drivers-Form.pdf \
  -f WA-DriversLicense
```

Every row now has `WA-DriversLicense` in the `Form` column, ready to be routed by `convert-batch`.

### Custom output path

```shell
mfconv extract-fields \
  -i ./forms/fw9.pdf \
  -o ./mappings-inbox/fw9-to-be-mapped.csv \
  -f IRS-W9
```

### Positional input

```shell
mfconv extract-fields ./forms/fw9.pdf
```

### Using an alias

```shell
mfconv ef -i ./forms/fw9.pdf -f IRS-W9
```

## Notes metadata

The `Notes` column carries any extra metadata pdftk emits that might help the CSV author. Format:

```text
Tooltip: <FieldNameAlt>; Justification: <not-Left>; Flags: <non-zero>; States: <s1>|<s2>|<s3>
```

Each piece is optional -- only non-default values are included. A completely vanilla left-justified text field with no flags produces `Notes: ` (empty), same as the CSVs `build-mappings` consumes today.

## Common issues

### `pdftk binary not found on PATH`

Install `pdftk-java`:

```shell
brew install pdftk-java          # macOS
apt  install pdftk               # Debian / Ubuntu
```

### `PDF does not exist: ...`

The `-i` path could not be resolved relative to the current directory. Use an absolute path.

### Fewer or more fields than I expected

pdftk reports one block per AcroForm field, which may include hidden fields, internal helper fields, or children of button groups. If the count surprises you, run `pdftk <pdf> dump_data_fields` directly and diff against the emitted CSV -- the `extract-fields` output has exactly one CSV row per pdftk block.

### Hierarchical field names

Public forms like the IRS W-9 use field names like `topmostSubform[0].Page1[0].f1_01[0]`. These are passed through verbatim into the CSV's `Field Name` column -- paste them into the `Field Name` column of your mapping CSV without modification and `build-mappings` will use them correctly.

## See also

- [build-mappings](build-mappings.md) -- the next step in the workflow
- [fill-pdf](fill-pdf.md) -- runs after `build-mappings` produces the mapping manyfest
- [Implementation Reference: PDFFormFiller.dumpFormFields](../implementation-reference.md#pdfformfiller) -- the service-level API
- [Implementation Reference: MappingManyfestBuilder.generateMappingCSVFromPDF](../implementation-reference.md#mappingmanyfestbuilder) -- the service-level API for the CSV-generating side
