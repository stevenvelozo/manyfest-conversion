# Source Address Syntax

A source address is a Manyfest address that locates a value inside a source JSON payload. Mapping manyfest descriptor keys are source addresses, and the fillers resolve them through Manyfest's standard `getValueAtAddress` with one small extension (the array-broadcast `[]` convention).

## Basic dot notation

```text
Header.PONumber
OrderData.Customer.Name
```

Resolves by walking object properties. Missing intermediate properties return `undefined` without throwing.

```javascript
const data = { Header: { PONumber: 'PO-2026-0001' } };
manifest.getValueAtAddress(data, 'Header.PONumber');  // 'PO-2026-0001'
manifest.getValueAtAddress(data, 'Header.Missing');   // undefined
```

## Array index access

```text
LineItems[0].Title
LineItems[2].Price
Pages[0].Sections[1].Title
```

Indices are zero-based. Out-of-range indices return `undefined`.

```javascript
const data = {
    LineItems: [
        { Title: 'Sapiens' },
        { Title: 'Dune' }
    ]
};
manifest.getValueAtAddress(data, 'LineItems[0].Title');   // 'Sapiens'
manifest.getValueAtAddress(data, 'LineItems[1].Title');   // 'Dune'
manifest.getValueAtAddress(data, 'LineItems[99].Title');  // undefined
```

## Boxed property access (quoted keys)

```text
Metadata["special-key"]
Catalog[`isbn-13`]
```

Use when the property name contains characters that can't appear in dot notation (hyphens, spaces, special chars). Both double quotes and backticks work.

```javascript
const data = { Metadata: { 'special-key': 42 } };
manifest.getValueAtAddress(data, 'Metadata["special-key"]');  // 42
```

## Mixed chains

```text
Users[0]["email-primary"]
Reports[2].Sections[0].Title
Books["9780143127796"].Title
```

All three address forms can be freely mixed:

```javascript
const data = {
    Users: [
        { 'email-primary': 'alice@example.com' }
    ]
};
manifest.getValueAtAddress(data, 'Users[0]["email-primary"]');  // 'alice@example.com'
```

## CSV shorthand: bracket-without-dot

The sample mapping CSVs sometimes omit the dot between a closing bracket and the next property:

```text
CAGTable[0]CAGB
```

This is **rewritten** by `MappingManyfestBuilder.normalizeSourceAddress` to the canonical form:

```text
CAGTable[0].CAGB
```

The normalization is applied once, at build time, before the descriptor is stored. The pre-normalization form is kept on the descriptor as `SourceAddressRaw` for round-trip fidelity.

If you hand-author a mapping manyfest, use the canonical dotted form. The shorthand only exists as a CSV import convenience.

## Array broadcast (`[]` empty brackets)

The XLSX filler recognizes a special convention: empty brackets in a source address mean "every element of this array".

```text
LineItems[].Price
ExtractionGradationTable[].JMF
```

The filler:

1. Detects the `[]` in the address
2. Splits the address into a prefix (everything before `[]`) and a suffix (everything after `[]`, without the leading `.`)
3. Resolves the prefix as an array
4. For each element index `i`, resolves `<prefix>[i].<suffix>` and collects the value

```javascript
const data = {
    LineItems: [
        { Price: '14.99' },
        { Price: '22.50' },
        { Price: '9.25' }
    ]
};
// The XLSX filler's resolveSourceValue helper returns:
// {
//   kind: 'array',
//   values: [
//     { ok: true, value: '14.99' },
//     { ok: true, value: '22.50' },
//     { ok: true, value: '9.25' }
//   ]
// }
```

Array broadcast is **only meaningful when the target is a cell range** on an XLSX mapping. If a scalar source is paired with a range target, or an array source is paired with a single cell target, the filler warns and continues without writing.

### Missing or non-scalar elements

Inside an array, each element is checked independently. Elements that are `null`, `undefined`, or non-scalar produce per-element warnings on the sidecar but do not stop the fill:

```javascript
const data = {
    T: [
        { v: '1' },       // ok
        { v: null },      // warning
        { v: { bad: 1 } }, // error: not a scalar
        { v: '4' }        // ok
    ]
};
// resolveSourceValue returns:
// {
//   kind: 'array',
//   values: [
//     { ok: true,  value: '1' },
//     { ok: false, message: 'Element at index 1 is missing or null.' },
//     { ok: false, message: 'Element at index 2 is an object/array, not a scalar.' },
//     { ok: true,  value: '4' }
//   ]
// }
```

## Resolution outcomes

Every source address resolves to exactly one of four outcomes:

| Outcome | When | Filler response |
|---------|------|-----------------|
| **scalar** | non-null primitive value | Write it; log a success |
| **missing** | `null` or `undefined` | Log a warning; do not write |
| **array** | address contained `[]` and the prefix resolved to a JS array | Pair element-by-element with the target range |
| **error** | address could not be resolved, or resolved to a non-scalar non-array (for non-`[]` addresses) | Log an error; do not write |

The fillers never throw on a single-field resolution failure. Every outcome is captured on the sidecar report and the loop continues to the next descriptor.

## Edge cases

### Empty string vs missing

An address that resolves to `''` (empty string) is treated as a scalar and written. Only `null` and `undefined` are treated as "missing".

### Stringified values

Platform payloads stringify everything: numeric values are `"14.99"`, dates are `"2026-04-08"`, booleans are `"true"`. The fillers do not coerce types -- they write whatever string the source provides. If you need parsed numbers in the output Excel, do the parsing upstream or rely on Excel to re-parse on open.

### Deep nesting

There is no depth limit on dot or bracket notation. `a.b.c.d.e.f[0].g[1].h` works just as well as `a.b`.

### Array of arrays

`Matrix[0][1]` works:

```javascript
const data = { Matrix: [ [ 'a', 'b' ], [ 'c', 'd' ] ] };
manifest.getValueAtAddress(data, 'Matrix[0][1]');  // 'b'
```

But `Matrix[].` (broadcast on an outer array of arrays) is not currently supported -- `resolveSourceValue` only handles a single `[]` in the address. For a nested broadcast, use explicit indices.

## See also

- [Target Cell and Range Syntax](target-cell-syntax.md) -- the target side of the mapping
- [Mapping Manyfest Format](mapping-manyfest-format.md) -- how addresses fit into the full file format
- [Implementation Reference](implementation-reference.md#xlsxformfiller) -- the `resolveSourceValue` helper in detail
