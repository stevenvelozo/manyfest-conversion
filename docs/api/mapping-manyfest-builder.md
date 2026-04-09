# MappingManyfestBuilder

**Service type:** `'MappingManyfestBuilder'`
**Source:** `source/services/Service-MappingManyfestBuilder.js`

Reads a CSV of field mappings and emits one mapping manyfest per distinct target form. Also loads previously-written mapping manyfest files back into memory as live Manyfest instances.

## Quick registration

```javascript
const libPict = require('pict');
const libMappingManyfestBuilder = require('manyfest-conversion').MappingManyfestBuilder;

const tmpFable = new libPict();
tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
tmpFable.instantiateServiceProvider('CSVParser');  // required

const tmpBuilder = tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
```

## Full reference

See [Implementation Reference: MappingManyfestBuilder](../implementation-reference.md#mappingmanyfestbuilder) for every public method with parameters, return shape, and code examples.

## Minimal example

```javascript
// Build all mapping manyfests from a CSV and write them to disk
const tmpResult = tmpBuilder.buildFromCSVFileSync('./mappings.csv');
const tmpPaths = tmpBuilder.writeManyfestsToDirectory(tmpResult.MappingConfigs, './translations');
console.log(`Wrote ${tmpPaths.length} mapping manyfests`);

// Load one back into memory later
const tmpManyfest = tmpBuilder.loadMappingManyfestFromFile('./translations/AcquisitionOrder.pdf.mapping.json');
console.log(tmpManyfest.manifest.SourceDocumentType);  // 'Bookstore-Acquisition'
```

## See also

- [Mapping Manyfest Format](../mapping-manyfest-format.md)
- [build-mappings CLI](../cli/build-mappings.md)
