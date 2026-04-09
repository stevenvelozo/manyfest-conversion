# ConversionReport

**Service type:** `'ConversionReport'`
**Source:** `source/services/Service-ConversionReport.js`

Lightweight bookkeeping service that tracks per-fill outcomes (successes, warnings, errors) and serializes them as sidecar JSON alongside filled artifacts.

## Quick registration

```javascript
const libPict = require('pict');
const libConversionReport = require('manyfest-conversion').ConversionReport;

const tmpFable = new libPict();
tmpFable.addServiceType('ConversionReport', libConversionReport);

const tmpReporter = tmpFable.instantiateServiceProvider('ConversionReport');
```

## Full reference

See [Implementation Reference: ConversionReport](../implementation-reference.md#conversionreport) for every public method with parameters, return shape, and code examples.

## Minimal example

```javascript
const tmpReport = tmpReporter.newReport(
    './sources/PO-2026-0001.json',
    'AcquisitionOrder.pdf',
    tmpMappingManyfest);

tmpReporter.logSuccess(tmpReport, 'po_number',     'OrderData.Header.PONumber',    'PO-2026-0001');
tmpReporter.logWarning(tmpReport, 'ship_to_sig',   null,                            'Target field has no mapping.');
tmpReporter.logError  (tmpReport, 'broken_field', 'OrderData.Invalid[0].x',         'Source address resolved to an object/array, not a scalar.');

tmpReporter.finalize(tmpReport);
console.log(tmpReport.Stats);
// { TotalFields: 3, SuccessCount: 1, WarningCount: 1, ErrorCount: 1 }

tmpReporter.writeSidecar(tmpReport, './filled/PO-2026-0001.pdf.report.json');
```

## See also

- [Sidecar Reports](../sidecar-reports.md) -- the full report schema with field-by-field descriptions
