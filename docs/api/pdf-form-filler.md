# PDFFormFiller

**Service type:** `'PDFFormFiller'`
**Source:** `source/services/Service-PDFFormFiller.js`

Fills fillable PDF forms from source JSON payloads using a mapping manyfest. Delegates to the `pdftk` (or `pdftk-java`) binary via `child_process.execFile` with a generated XFDF document.

## External requirement

`pdftk` must be on the `PATH`. Install with:

```shell
brew install pdftk-java          # macOS
apt  install pdftk               # Debian / Ubuntu
```

## Quick registration

```javascript
const libPict = require('pict');
const libMC = require('manyfest-conversion');

const tmpFable = new libPict();
tmpFable.addServiceType('PDFFormFiller',    libMC.PDFFormFiller);
tmpFable.addServiceType('ConversionReport', libMC.ConversionReport);

const tmpFiller   = tmpFable.instantiateServiceProvider('PDFFormFiller');
const tmpReporter = tmpFable.instantiateServiceProvider('ConversionReport');
```

## Full reference

See [Implementation Reference: PDFFormFiller](../implementation-reference.md#pdfformfiller) for every public method with parameters, return shape, and code examples.

## Minimal example

```javascript
const tmpReport = tmpReporter.newReport(
    './sources/PO-2026-0001.json',
    'AcquisitionOrder.pdf',
    tmpMappingManyfest);

tmpFiller.fillPDF(
    tmpMappingManyfest,
    tmpSourceData,
    './templates/AcquisitionOrder.pdf',
    './filled/PO-2026-0001.pdf',
    tmpReport,
    tmpReporter);

tmpReporter.writeSidecar(tmpReport, './filled/PO-2026-0001.pdf.report.json');
```

## See also

- [Architecture: PDF fill](../architecture.md#pdf-fill-xfdf--pdftk)
- [fill-pdf CLI](../cli/fill-pdf.md)
