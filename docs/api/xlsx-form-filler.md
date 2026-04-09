# XLSXFormFiller

**Service type:** `'XLSXFormFiller'`
**Source:** `source/services/Service-XLSXFormFiller.js`

Fills Excel workbooks from source JSON payloads using a mapping manyfest. Backed by `exceljs`, so fonts, borders, merged cells, and sheet themes on the template are preserved.

All methods are synchronous **except** `fillXLSX`, which returns a Promise (`exceljs` is async).

## Quick registration

```javascript
const libPict = require('pict');
const libMC = require('manyfest-conversion');

const tmpFable = new libPict();
tmpFable.addServiceType('XLSXFormFiller',   libMC.XLSXFormFiller);
tmpFable.addServiceType('ConversionReport', libMC.ConversionReport);

const tmpFiller   = tmpFable.instantiateServiceProvider('XLSXFormFiller');
const tmpReporter = tmpFable.instantiateServiceProvider('ConversionReport');
```

## Full reference

See [Implementation Reference: XLSXFormFiller](../implementation-reference.md#xlsxformfiller) for every public method with parameters, return shape, and code examples.

## Minimal example

```javascript
const tmpReport = tmpReporter.newReport(
    './sources/inventory-2026-04-08.json',
    'InventorySheet.xlsx',
    tmpMappingManyfest);

await tmpFiller.fillXLSX(
    tmpMappingManyfest,
    tmpSourceData,
    './templates/InventorySheet.xlsx',
    './filled/inventory-2026-04-08.xlsx',
    tmpReport,
    tmpReporter);

tmpReporter.writeSidecar(tmpReport, './filled/inventory-2026-04-08.xlsx.report.json');
```

## See also

- [Architecture: XLSX fill](../architecture.md#xlsx-fill-exceljs-not-sheetjs)
- [Target Cell and Range Syntax](../target-cell-syntax.md)
- [fill-xlsx CLI](../cli/fill-xlsx.md)
