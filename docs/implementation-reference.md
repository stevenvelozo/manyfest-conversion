# Implementation Reference

A complete reference for the four Fable services that ship with Manyfest Conversion. All four extend `fable-serviceproviderbase`, follow the Retold naming conventions (`pParameter`, `tmpVariable`, `libLibrary`), and can be used individually or together.

## Module entry point

```javascript
const libManyfestConversion = require('manyfest-conversion');

// The module exports all four service classes.
const MappingManyfestBuilder = libManyfestConversion.MappingManyfestBuilder;
const PDFFormFiller          = libManyfestConversion.PDFFormFiller;
const XLSXFormFiller         = libManyfestConversion.XLSXFormFiller;
const ConversionReport       = libManyfestConversion.ConversionReport;
```

## Wiring the services on a Fable

All services share the standard Fable registration pattern:

```javascript
const libPict = require('pict');
const libManyfestConversion = require('manyfest-conversion');

const tmpFable = new libPict();

// Register the service types
tmpFable.addServiceType('MappingManyfestBuilder', libManyfestConversion.MappingManyfestBuilder);
tmpFable.addServiceType('PDFFormFiller',          libManyfestConversion.PDFFormFiller);
tmpFable.addServiceType('XLSXFormFiller',         libManyfestConversion.XLSXFormFiller);
tmpFable.addServiceType('ConversionReport',       libManyfestConversion.ConversionReport);

// Instantiate shared Fable services that the builders need
tmpFable.instantiateServiceProvider('CSVParser');
tmpFable.instantiateServiceProvider('FilePersistence');

// Instantiate the manyfest-conversion services
const tmpBuilder  = tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
const tmpPDF      = tmpFable.instantiateServiceProvider('PDFFormFiller');
const tmpXLSX     = tmpFable.instantiateServiceProvider('XLSXFormFiller');
const tmpReporter = tmpFable.instantiateServiceProvider('ConversionReport');
```

After that, the instances are reachable as:

```javascript
tmpFable.MappingManyfestBuilder
tmpFable.PDFFormFiller
tmpFable.XLSXFormFiller
tmpFable.ConversionReport
```

---

## `MappingManyfestBuilder`

**Service type:** `'MappingManyfestBuilder'`
**Source:** `source/services/Service-MappingManyfestBuilder.js`
**Dependencies:** `manyfest`, `fable CSVParser` (for streaming), Node `fs`

Reads a CSV of field mappings and emits one mapping manyfest per distinct target form.

### Static constants

| Name | Value |
|------|-------|
| `DEFAULT_SOURCE_ROOT_ADDRESS` | `'ReportData.FormData'` |

### Methods

#### `classifyTargetFileType(pTargetFile)`

Returns `'PDF'`, `'XLSX'`, or `'Unknown'` based on the target filename extension. Tolerates the `.xslx` typo in sample CSVs.

```javascript
tmpBuilder.classifyTargetFileType('Invoice.pdf');            // 'PDF'
tmpBuilder.classifyTargetFileType('Inventory.xlsx');         // 'XLSX'
tmpBuilder.classifyTargetFileType('HMA - Data Sheet.xslx');  // 'XLSX' (typo tolerated)
tmpBuilder.classifyTargetFileType('notes.txt');              // 'Unknown'
```

#### `manyfestFileNameForTarget(pTargetFile)`

Returns a filesystem-safe filename for the mapping manyfest JSON. Replaces anything non-alphanumeric with `_` and appends `.mapping.json`.

```javascript
tmpBuilder.manyfestFileNameForTarget('Acquisition Order.pdf');
// => 'Acquisition_Order.pdf.mapping.json'
```

#### `hashForDescriptor(pTargetFile, pFieldName)`

Generates a stable Hash for a descriptor from the target form filename + target field name. Used by Manyfest as a lookup key.

```javascript
tmpBuilder.hashForDescriptor('AcquisitionOrder.pdf', 'po_number');
// => 'AcquisitionOrder__po_number'
```

#### `normalizeSourceAddress(pAddress)`

Rewrites the CSV convention `CAGTable[0]CAGB` (no dot between `]` and the next property) to `CAGTable[0].CAGB` so manyfest's address parser can resolve it. Leaves already-normalized addresses alone.

```javascript
tmpBuilder.normalizeSourceAddress('CAGTable[0]CAGB');    // 'CAGTable[0].CAGB'
tmpBuilder.normalizeSourceAddress('CAGTable[0].CAGB');   // 'CAGTable[0].CAGB'
tmpBuilder.normalizeSourceAddress('H.CtrlSecID');        // 'H.CtrlSecID'
tmpBuilder.normalizeSourceAddress('Dogs[`key`].Value');  // 'Dogs[`key`].Value'
```

#### `newBuildReport()`

Returns a fresh BuildReport skeleton:

```javascript
{
    RowsParsed: 0,
    RowsSkipped: 0,
    RowsAccepted: 0,
    FormCount: 0,
    Forms: {},
    SkipReasons: [],
    Errors: []
}
```

#### `applyRowToConfigs(pRow, pMappingConfigs, pBuildReport, pOptions)`

Applies one parsed CSV row to the in-progress configs map. Mutates both `pMappingConfigs` and `pBuildReport`. Called internally by the build methods but exposed for use in custom parsers.

```javascript
const tmpConfigs = {};
const tmpReport = tmpBuilder.newBuildReport();
tmpBuilder.applyRowToConfigs(
    {
        'PDF File': 'AcquisitionOrder.pdf',
        'Field Type': 'Text',
        'Field Name': 'po_number',
        'Form': 'Bookstore-Acquisition',
        'Document Data Long Filler': 'OrderData.',
        'Form Input Address': 'Header.PONumber',
        'Form Input Address Long': 'OrderData.Header.PONumber'
    },
    tmpConfigs,
    tmpReport,
    {});
```

#### `buildFromCSVFile(pCSVFilePath, pOptions, fCallback)`

Streams a CSV file through the Fable `CSVParser` service and invokes `fCallback(err, { MappingConfigs, BuildReport })`. `pOptions` may contain `{ sourceRootAddress: '...' }`.

```javascript
tmpBuilder.buildFromCSVFile('./mappings.csv', {}, (pError, pResult) =>
{
    if (pError) { return console.error(pError); }
    console.log(`Built ${pResult.BuildReport.FormCount} mapping manyfests`);
    console.log(Object.keys(pResult.MappingConfigs));
});
```

#### `buildFromCSVFileSync(pCSVFilePath, pOptions)`

Synchronous counterpart to `buildFromCSVFile`. Reads the whole file into memory and parses line by line. Returns `{ MappingConfigs, BuildReport }`. Throws on I/O errors.

```javascript
const tmpResult = tmpBuilder.buildFromCSVFileSync('./mappings.csv');
console.log(tmpResult.MappingConfigs['AcquisitionOrder.pdf']);
```

#### `instantiateManyfests(pMappingConfigs)`

Materializes a map of config objects into live `Manyfest` instances, reattaching the top-level metadata (`SourceRootAddress`, `TargetFile`, `TargetFileType`, `SourceDocumentType`, `UnmappedTargetFields`) to each instance's `manifest` object.

```javascript
const tmpResult = tmpBuilder.buildFromCSVFileSync('./mappings.csv');
const tmpManyfests = tmpBuilder.instantiateManyfests(tmpResult.MappingConfigs);

const tmpLive = tmpManyfests['AcquisitionOrder.pdf'];
tmpLive.getValueAtAddress(sourceData, 'ReportData.FormData.Header.PONumber');
```

#### `writeManyfestsToDirectory(pMappingConfigs, pOutputDir)`

Writes one `<sanitized-target-file>.mapping.json` per config into `pOutputDir`. Creates the directory recursively if it does not exist. Returns an array of written file paths.

```javascript
const tmpPaths = tmpBuilder.writeManyfestsToDirectory(tmpResult.MappingConfigs, './translations');
// => [
//   './translations/AcquisitionOrder.pdf.mapping.json',
//   './translations/InventorySheet.xlsx.mapping.json'
// ]
```

#### `loadMappingManyfestFromFile(pMappingFilePath)`

Loads a previously-written mapping manyfest JSON back into memory as a live `Manyfest` instance. Reattaches the top-level metadata. Throws if the file does not exist.

```javascript
const tmpManyfest = tmpBuilder.loadMappingManyfestFromFile('./translations/AcquisitionOrder.pdf.mapping.json');
console.log(tmpManyfest.manifest.SourceDocumentType);  // 'Bookstore-Acquisition'
console.log(tmpManyfest.manifest.TargetFile);          // 'AcquisitionOrder.pdf'
```

#### `joinAddress(pSourceRoot, pRelativeAddress)`

Joins a source root address with a descriptor's relative address. Handles bracket-first addresses correctly. Used internally by the fillers.

```javascript
tmpBuilder.joinAddress('ReportData.FormData', 'H.CtrlSec');        // 'ReportData.FormData.H.CtrlSec'
tmpBuilder.joinAddress('ReportData.FormData', 'CAGTable[0].CAGB'); // 'ReportData.FormData.CAGTable[0].CAGB'
tmpBuilder.joinAddress('', 'H.CtrlSec');                           // 'H.CtrlSec'
```

#### `normalizeDescriptorTargets(pDescriptor)`

Normalizes a descriptor (old 1:1 shape or new 1:N shape) to a flat array of target specs. This is the contract every filler consumes.

```javascript
// New 1:N shape -> returned verbatim
tmpBuilder.normalizeDescriptorTargets(
    {
        Targets:
        [
            { TargetFieldName: 'job_number', TargetFieldType: 'Text' },
            { TargetFieldName: 'header_job_no', TargetFieldType: 'Text' }
        ]
    });
// => [{TargetFieldName: 'job_number', ...}, {TargetFieldName: 'header_job_no', ...}]

// Legacy 1:1 shape -> wrapped in a single-element array
tmpBuilder.normalizeDescriptorTargets(
    {
        TargetFieldName: 'po_number',
        TargetFieldType: 'Text',
        SourceSortOrder: 1
    });
// => [{TargetFieldName: 'po_number', TargetFieldType: 'Text', SourceSortOrder: 1, Notes: null}]
```

Returns `[]` for null / non-object / no-target descriptors. The same helper is implemented (with identical semantics) on `PDFFormFiller.normalizeDescriptorTargets` and `XLSXFormFiller.normalizeDescriptorTargets` so each filler stays self-sufficient even when the builder is not registered on the fable.

#### `escapeCSVCell(pValue)`

Quotes a cell value for safe inclusion in a CSV row. Returns the value unchanged unless it contains a comma, double quote, or newline, in which case it wraps the value in double quotes and doubles any inner double quotes. Used internally by `generateMappingCSVFromFields`.

```javascript
tmpBuilder.escapeCSVCell('plain');            // 'plain'
tmpBuilder.escapeCSVCell('a,b');              // '"a,b"'
tmpBuilder.escapeCSVCell('say "hi"');         // '"say ""hi"""'
tmpBuilder.escapeCSVCell('line1\nline2');     // '"line1\nline2"'
tmpBuilder.escapeCSVCell(null);               // ''
```

#### `buildNotesForExtractedField(pField)`

Builds the freeform `Notes` cell for an extracted field descriptor (as returned by `PDFFormFiller.dumpFormFields`). Concatenates any interesting metadata (tooltip, non-default justification, non-zero flags, button state options) with `;` separators.

```javascript
tmpBuilder.buildNotesForExtractedField(
    {
        FieldType: 'Button',
        FieldNameAlt: 'Select payment method',
        FieldJustification: 'Center',
        FieldFlags: '65536',
        FieldStateOptions: ['Cash', 'Credit', 'Off']
    });
// => 'Tooltip: Select payment method; Justification: Center; Flags: 65536; States: Cash|Credit|Off'
```

#### `generateMappingCSVFromFields(pFields, pTargetFileName, pOptions)`

Builds a ready-to-edit mapping CSV string from an array of extracted PDF field descriptors. Every row is written with an **empty** `Form Input Address` column -- the human author fills that in before running `build-mappings`.

```javascript
const tmpFields = tmpFable.PDFFormFiller.dumpFormFields('./fw9.pdf');
const tmpCSV = tmpBuilder.generateMappingCSVFromFields(
    tmpFields,
    'fw9.pdf',
    { formName: 'IRS-W9' });

require('fs').writeFileSync('./fw9-ManyfestMapping.csv', tmpCSV);
```

The returned string contains a header row plus one row per field. It is LF-terminated and always ends with a trailing newline.

Accepted options:

| Key | Type | Description |
|-----|------|-------------|
| `formName` | string | Value to bake into every row's `Form` column (the `ReportData.DocumentType` routing key). |
| `documentDataLongFiller` | string | Value to bake into every row's `Document Data Long Filler` column. |

#### `defaultMappingCSVPathForPDF(pPDFPath)`

Returns the conventional default output path for `generateMappingCSVFromPDF`: same directory as the input PDF, same basename, with `-ManyfestMapping.csv` appended.

```javascript
tmpBuilder.defaultMappingCSVPathForPDF('/path/to/Washington-Drivers-Form.pdf');
// => '/path/to/Washington-Drivers-Form-ManyfestMapping.csv'
```

#### `generateMappingCSVFromPDF(pPDFPath, pOutputCSVPath, pOptions)`

End-to-end helper that shells out to pdftk (via `PDFFormFiller.dumpFormFields`), runs the result through `generateMappingCSVFromFields`, and writes the CSV to disk.

```javascript
const tmpResult = tmpBuilder.generateMappingCSVFromPDF(
    './forms/fw9.pdf',
    null,                            // null -> default output path
    { formName: 'IRS-W9' });

// => {
//   csv: '...header and rows...',
//   fields: [ { FieldType: 'Text', FieldName: '...' }, ... ],
//   targetFileName: 'fw9.pdf',
//   outputPath: './forms/fw9-ManyfestMapping.csv'
// }
```

If `pOutputCSVPath` is omitted or falsy, the default path from `defaultMappingCSVPathForPDF` is used. The function automatically instantiates a `PDFFormFiller` service on the fable if one is not already registered.

---

## `PDFFormFiller`

**Service type:** `'PDFFormFiller'`
**Source:** `source/services/Service-PDFFormFiller.js`
**Dependencies:** `manyfest`, Node `fs`, `os`, `path`, `child_process`, external `pdftk` binary

Fills fillable PDF forms via XFDF and `pdftk`.

### Methods

#### `resolvePDFTKBinary()`

Walks `PDFTK_BINARY_CANDIDATES` (`pdftk`, `pdftk-java`) and returns the first one found on `PATH`, or `null` if neither is installed.

```javascript
const tmpBinary = tmpPDF.resolvePDFTKBinary();
if (!tmpBinary)
{
    console.error('pdftk is not installed');
}
```

#### `normalizeDescriptorTargets(pDescriptor)`

Same contract as `MappingManyfestBuilder.normalizeDescriptorTargets` -- carried locally so the PDF filler can resolve descriptors without depending on the builder being registered on the fable. Used by `buildXFDF` to iterate one or many target fields per descriptor.

#### `dumpFormFields(pPDFPath)`

Shells out to `pdftk <pdf> dump_data_fields`, parses the output, and returns an array of field descriptor objects -- one per form field in the PDF. This is the backend for the `extract-fields` CLI command and for `MappingManyfestBuilder.generateMappingCSVFromPDF`.

Each returned object has the shape:

```javascript
{
    FieldType: 'Text' | 'Button' | 'Choice' | ...,
    FieldName: '<AcroForm field name>',
    FieldNameAlt: '<tooltip>' | null,
    FieldFlags: '<numeric flags>' | null,
    FieldJustification: 'Left' | 'Center' | 'Right' | null,
    FieldValue: '<current value>' | null,
    FieldStateOptions: [ '<state>', '<state>', ... ]   // empty array for non-button fields
}
```

Example:

```javascript
const tmpFields = tmpPDF.dumpFormFields('./forms/fw9.pdf');
console.log(tmpFields.length);                         // 22 (or whatever the form has)
console.log(tmpFields[0].FieldName);                   // 'topmostSubform[0].Page1[0].f1_01[0]'
console.log(tmpFields[0].FieldType);                   // 'Text'
```

Throws if the PDF does not exist, `pdftk` is not on the PATH, or `pdftk dump_data_fields` exits with a non-zero status.

#### `parseDumpDataFields(pRawOutput)`

Pure function: parses the raw stdout of `pdftk <pdf> dump_data_fields` into the same array of field descriptor objects that `dumpFormFields` returns. Safe to call in tests with a hand-crafted input string, no `pdftk` binary required.

```javascript
const tmpFields = tmpPDF.parseDumpDataFields([
    '---',
    'FieldType: Text',
    'FieldName: first_name',
    'FieldFlags: 8388608',
    'FieldJustification: Left'
].join('\n'));
// => [ { FieldType: 'Text', FieldName: 'first_name', FieldFlags: '8388608', FieldJustification: 'Left', ... } ]
```

Unknown keys in the input are silently ignored so new pdftk versions don't break the parser. Blocks with no `FieldName` (incomplete records) are dropped.

#### `escapeXML(pValue)`

XML-escapes a scalar value for safe inclusion inside an XFDF `<value>` element. Handles `&`, `<`, `>`, `"`, `'`, `null`, and `undefined`.

```javascript
tmpPDF.escapeXML('a & b');          // 'a &amp; b'
tmpPDF.escapeXML('<tag>');          // '&lt;tag&gt;'
tmpPDF.escapeXML(`quotes: " '`);    // 'quotes: &quot; &apos;'
tmpPDF.escapeXML(null);             // ''
```

#### `buildXFDF(pMappingManyfest, pSourceData, pReport, pConversionReportService)`

Pure function: builds the XFDF document string for a fill without touching the filesystem or `pdftk`. Iterates the mapping manyfest's descriptors, resolves each source value, and emits a `<field>` entry for every scalar Text field. Skips Button fields with a warning.

Returns `{ xfdf, fieldCount }` where `fieldCount` is the number of actual `<field>` elements emitted (not counting skipped buttons or missing values).

```javascript
const tmpReport = tmpReporter.newReport('source.json', 'target.pdf');
const tmpBuild = tmpPDF.buildXFDF(tmpManyfest, tmpSourceData, tmpReport, tmpReporter);
console.log(tmpBuild.xfdf);           // full XFDF document
console.log(tmpBuild.fieldCount);     // 12
```

#### `runPDFTK(pTemplatePDFPath, pXFDFPath, pOutputPDFPath)`

Shells out to `pdftk` via `execFile` (not `exec`) so filenames cannot be interpreted as shell arguments. Throws if the binary is missing, the spawn fails, or `pdftk` exits with a non-zero status.

```javascript
tmpPDF.runPDFTK(
    './templates/AcquisitionOrder.pdf',
    '/tmp/fill.xfdf',
    './filled/PO-2026-0001.pdf');
```

#### `fillPDF(pMappingManyfest, pSourceData, pTemplatePDFPath, pOutputPDFPath, pReport, pConversionReportService)`

End-to-end fill. Builds the XFDF, writes it to a temp file under `os.tmpdir()`, runs pdftk, cleans up the temp file. Annotates `pReport` with per-descriptor outcomes and finalizes it.

```javascript
const tmpReport = tmpReporter.newReport(
    'sources/PO-2026-0001.json',
    'AcquisitionOrder.pdf',
    tmpMappingManyfest);

tmpPDF.fillPDF(
    tmpMappingManyfest,
    tmpSourceData,
    './templates/AcquisitionOrder.pdf',
    './filled/PO-2026-0001.pdf',
    tmpReport,
    tmpReporter);

tmpReporter.writeSidecar(tmpReport, './filled/PO-2026-0001.pdf.report.json');
```

#### `joinAddress(pSourceRoot, pRelativeAddress)`

Same contract as `MappingManyfestBuilder.joinAddress`. Used internally by `buildXFDF`.

---

## `XLSXFormFiller`

**Service type:** `'XLSXFormFiller'`
**Source:** `source/services/Service-XLSXFormFiller.js`
**Dependencies:** `manyfest`, `exceljs`, Node `fs`

Fills Excel workbooks via `exceljs`. All methods are sync except `fillXLSX`, which returns a Promise because `exceljs` is async.

### Methods

#### `normalizeDescriptorTargets(pDescriptor)`

Same contract as `MappingManyfestBuilder.normalizeDescriptorTargets` -- carried locally so the XLSX filler can resolve descriptors without depending on the builder being registered on the fable. Used by `fillXLSX` to iterate one or many target cell references per descriptor (the source value is resolved once per descriptor, then each target receives it via the existing scalar/array/missing/error decision tree).

#### `parseTargetCellSpec(pRawRef)`

Parses a target cell reference into `{ sheetName, cellAddresses[] }`. Handles quoted sheet names, asymmetric single quotes, single cells, hyphen-shorthand ranges, and colon ranges.

```javascript
tmpXLSX.parseTargetCellSpec("'FIELD DATA SHEET'!E5");
// => { sheetName: 'FIELD DATA SHEET', cellAddresses: ['E5'] }

tmpXLSX.parseTargetCellSpec("FIELD DATA SHEET'!E5");  // trailing-only quote
// => { sheetName: 'FIELD DATA SHEET', cellAddresses: ['E5'] }

tmpXLSX.parseTargetCellSpec("'Line Items'!B3-14");
// => { sheetName: 'Line Items', cellAddresses: ['B3','B4',...,'B14'] }

tmpXLSX.parseTargetCellSpec('E5');
// => { sheetName: null, cellAddresses: ['E5'] }
```

#### `expandCellRange(pRangeString)`

Expands a cell-or-range string into a flat A1-style address list.

```javascript
tmpXLSX.expandCellRange('E5');      // ['E5']
tmpXLSX.expandCellRange('O14-25');  // ['O14','O15',...,'O25']     (12 entries)
tmpXLSX.expandCellRange('B2:B5');   // ['B2','B3','B4','B5']
tmpXLSX.expandCellRange('A1:C2');   // ['A1','B1','C1','A2','B2','C2']  (row-major)
```

#### `columnLettersToNumber(pLetters)` / `columnNumberToLetters(pNumber)`

Column letter <-> column index conversions for rectangular range expansion. 1-indexed.

```javascript
tmpXLSX.columnLettersToNumber('A');  // 1
tmpXLSX.columnLettersToNumber('Z');  // 26
tmpXLSX.columnLettersToNumber('AA'); // 27
tmpXLSX.columnNumberToLetters(1);    // 'A'
tmpXLSX.columnNumberToLetters(27);   // 'AA'
```

#### `resolveSourceValue(pMappingManyfest, pSourceData, pFullAddress)`

Resolves a source address against source data, handling the array-broadcast `[]` convention. Returns one of four shapes:

```javascript
{ kind: 'scalar', value }        // non-null primitive value
{ kind: 'array',  values: [...] } // array-broadcast, one entry per element
{ kind: 'missing' }              // resolved to null/undefined
{ kind: 'error', message }       // could not resolve or non-scalar
```

Array element entries are shaped `{ ok: true, value }` or `{ ok: false, message }`:

```javascript
const tmpResult = tmpXLSX.resolveSourceValue(
    tmpManyfest,
    { LineItems: [ { Title: 'Sapiens' }, { Title: 'Dune' } ] },
    'LineItems[].Title');

// => {
//   kind: 'array',
//   values: [
//     { ok: true, value: 'Sapiens' },
//     { ok: true, value: 'Dune' }
//   ]
// }
```

#### `writeCellValue(pWorksheet, pCellAddress, pValue)`

Writes a single value into a cell on an exceljs worksheet. Setting `cell.value` on an exceljs `Cell` preserves the cell's existing style metadata by design -- this is the whole reason the filler uses exceljs over SheetJS.

```javascript
tmpXLSX.writeCellValue(tmpWorksheet, 'E5', 'PO-2026-0001');
```

Values are always coerced to strings because platform payloads stringify everything.

#### `fillXLSX(pMappingManyfest, pSourceData, pTemplateXLSXPath, pOutputXLSXPath, pReport, pConversionReportService)`

End-to-end fill. **Async** -- returns a Promise that resolves to the finalized report.

```javascript
const tmpReport = tmpReporter.newReport(
    'sources/PO-2026-0001.json',
    'InventorySheet.xlsx',
    tmpMappingManyfest);

await tmpXLSX.fillXLSX(
    tmpMappingManyfest,
    tmpSourceData,
    './templates/InventorySheet.xlsx',
    './filled/PO-2026-0001.xlsx',
    tmpReport,
    tmpReporter);

tmpReporter.writeSidecar(tmpReport, './filled/PO-2026-0001.xlsx.report.json');
```

The procedure:

1. Load the template with `new ExcelJS.Workbook().xlsx.readFile()`
2. Iterate every descriptor on the mapping manyfest
3. For each descriptor, parse the target cell spec, resolve the source value, and pair them (scalar+single cell, array+range, scalar+range warns, array+single cell warns)
4. Write each `(cellAddress, value)` pair via `writeCellValue`, logging per-cell success/warning/error on the report
5. Save the workbook with `wb.xlsx.writeFile()`
6. Finalize the report and return it

#### `joinAddress(pSourceRoot, pRelativeAddress)`

Same contract as `MappingManyfestBuilder.joinAddress`.

---

## `ConversionReport`

**Service type:** `'ConversionReport'`
**Source:** `source/services/Service-ConversionReport.js`
**Dependencies:** none (uses `FilePersistence` if present, else falls back to raw `fs`)

Tracks per-fill outcomes and serializes them as sidecar JSON next to filled artifacts.

### Methods

#### `newReport(pSourceFile, pTargetFile, pMappingManyfest)`

Returns a fresh report skeleton. `pMappingManyfest` is optional; if supplied, its scope and `SourceDocumentType` metadata are copied into the report header.

```javascript
const tmpReport = tmpReporter.newReport(
    'sources/PO-2026-0001.json',
    'AcquisitionOrder.pdf',
    tmpMappingManyfest);

// => {
//   SourceFile: 'sources/PO-2026-0001.json',
//   SourceDocumentType: 'Bookstore-Acquisition',
//   TargetFile: 'AcquisitionOrder.pdf',
//   MappingManyfestScope: 'Bookstore-Acquisition::AcquisitionOrder.pdf',
//   Timestamp: '2026-04-08T14:03:22.101Z',
//   Successes: [],
//   Warnings: [],
//   Errors: [],
//   Stats: { TotalFields: 0, SuccessCount: 0, WarningCount: 0, ErrorCount: 0 }
// }
```

#### `logSuccess(pReport, pFieldName, pSourceAddress, pValue)`

Records a successful field write.

```javascript
tmpReporter.logSuccess(tmpReport, 'po_number', 'OrderData.Header.PONumber', 'PO-2026-0001');
```

#### `logWarning(pReport, pFieldName, pSourceAddress, pMessage)`

Records a non-fatal warning (missing value, skipped checkbox, truncated array).

```javascript
tmpReporter.logWarning(tmpReport, 'ship_to_signature', null, 'Target field has no mapping.');
```

#### `logError(pReport, pFieldName, pSourceAddress, pMessage)`

Records a hard error (field resolution failure, target sheet missing, pdftk failure).

```javascript
tmpReporter.logError(tmpReport, 'po_number', 'OrderData.Header.PONumber', 'Source address resolved to an object, not a scalar.');
```

#### `finalize(pReport)`

Recomputes the `Stats` block from the current array lengths. Called automatically by `writeSidecar`, but exposed so callers can inspect the totals before writing.

```javascript
tmpReporter.finalize(tmpReport);
console.log(tmpReport.Stats);
// { TotalFields: 6, SuccessCount: 5, WarningCount: 1, ErrorCount: 0 }
```

#### `writeSidecar(pReport, pSidecarPath)`

Finalizes the report and writes it to disk. Uses `FilePersistence.writeFileSyncFromObject` if available; otherwise falls back to raw `fs.writeFileSync` with a pretty-printed JSON string.

```javascript
tmpReporter.writeSidecar(tmpReport, './filled/PO-2026-0001.pdf.report.json');
```

---

## Using the services standalone (no Fable)

Every service works without a Fable instance for testing. Pass `undefined` or an empty object to the constructor:

```javascript
const libMappingManyfestBuilder = require('manyfest-conversion').MappingManyfestBuilder;

// Create a stub fable-like object with the services the builder depends on
const tmpStubFable = {
    CSVParser: require('fable/source/services/Fable-Service-CSVParser.js')
};
const tmpBuilder = new libMappingManyfestBuilder(tmpStubFable, {}, 'test');
```

In practice this is only useful for unit tests. For real code, use a Pict or Fable instance.

## See also

- [Mapping Manyfest Format](mapping-manyfest-format.md) -- the on-disk file shape
- [Source Address Syntax](source-address-syntax.md) -- the full address grammar
- [Target Cell and Range Syntax](target-cell-syntax.md) -- PDF field names and Excel cell/range references
- [Sidecar Reports](sidecar-reports.md) -- the full report schema
- [CLI Reference](cli/overview.md) -- how the CLI commands wire the services together
