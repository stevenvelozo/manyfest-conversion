# CLI Overview

`manyfest-conversion` ships a CLI named `mfconv`. It exposes four commands that mirror the four public Fable services and share the same configuration / logging conventions as the rest of the retold ecosystem.

## Invoking the CLI

```shell
# When installed as a dependency
npx mfconv <command> [options]

# When developing the module locally
node source/cli/Manyfest-Conversion-CLI-Run.js <command> [options]
```

## Global options

```text
-v, --version              Show the CLI version and exit.
-h, --help                 Show help for the top-level CLI or a single command.
```

```shell
mfconv --version
mfconv --help
mfconv fill-pdf --help
```

## Commands

| Command | Aliases | Purpose |
|---------|---------|---------|
| [`extract-fields`](extract-fields.md) | `ef`, `extract_fields` | Sniff every fillable field out of a PDF and emit a ready-to-edit mapping CSV. Typically the first step when wiring up a new form. |
| [`build-mappings`](build-mappings.md) | `bm`, `build_mappings` | Parse a mapping CSV and write one `.mapping.json` per target form. |
| [`fill-pdf`](fill-pdf.md) | `fp`, `fill_pdf` | Fill a single PDF template from a single source JSON using a single mapping manyfest. |
| [`fill-xlsx`](fill-xlsx.md) | `fx`, `fill_xlsx` | Fill a single XLSX template from a single source JSON using a single mapping manyfest. |
| [`convert-batch`](convert-batch.md) | `cb`, `convert_batch` | Route every source JSON in a directory to every matching mapping manyfest and fill every applicable form. |

Run `mfconv <command> --help` for a summary of any individual command.

## Configuration file

The CLI reads an optional configuration file named `.manyfest-conversion.config.json` from the current working directory or any ancestor directory. This is handled by `pict-service-commandlineutility`'s `AutoGatherProgramConfiguration` feature.

The default configuration is:

```json
{
  "SourceRootAddress": "ReportData.FormData",
  "Paths":
  {
    "MappingsDirectory": "./mappings",
    "SourceJSONDirectory": "./source",
    "TemplatesDirectory": "./templates",
    "OutputDirectory": "./output"
  }
}
```

None of the commands currently rely on the config file for their core behavior -- all paths are taken from command-line flags. The config file is reserved for future expansion (default source roots, logging verbosity, plugin lists).

Show the effective config at any time with:

```shell
mfconv explain-config
```

## Exit codes

The commands share a single exit-code contract:

| Code | Meaning |
|------|---------|
| `0` | Clean run. No errors on any sidecar. |
| `1` | Usage error or unrecoverable I/O problem (missing input file, bad flag, malformed JSON). |
| `2` | Fill completed but one or more sidecar reports contain errors (`ErrorCount > 0` on any sidecar). |

**Warnings alone never fail the exit.** The tool's goal is to produce a partial artifact plus a sidecar the operator can inspect, not to bail on the first data-quality gap.

## Logging

All commands log via the Fable logger inherited through `pict-service-commandlineutility`. Output goes to stdout in a structured form:

```text
2026-04-08T14:03:22.101Z [info] (Manyfest-Conversion-CLI): Building mapping manyfests from [./mappings.csv]...
2026-04-08T14:03:22.112Z [info] (Manyfest-Conversion-CLI): Parsed 120 CSV rows (118 accepted, 2 skipped).
2026-04-08T14:03:22.112Z [info] (Manyfest-Conversion-CLI): Discovered 4 distinct target forms:
2026-04-08T14:03:22.112Z [info] (Manyfest-Conversion-CLI):   -> [PDF] AcquisitionOrder.pdf (6 mapped, 0 unmapped)
```

Errors go to the same stream with `[error]` severity. There is currently no way to suppress console logging -- if you need quiet output, redirect stdout to a file and parse the sidecars for the structured results.

## Source root overrides

`fill-pdf`, `fill-xlsx`, and `convert-batch` all accept `--source-root <address>` to override the `SourceRootAddress` stored in the mapping manyfest(s) at fill time. This lets the same mapping manyfest work against different payload envelopes without rewriting the file.

```shell
mfconv fill-pdf -m mapping.json -s source.json -t template.pdf -o out.pdf \
  --source-root "AppData.DocumentData.ReportData.FormData"
```

When omitted, the mapping manyfest's stored `SourceRootAddress` is used (default `ReportData.FormData` for manyfests produced by `build-mappings`).

## Sidecar overrides

`fill-pdf` and `fill-xlsx` accept `--sidecar <path>` to override the sidecar report output path. The default is `<output>.report.json`.

```shell
mfconv fill-pdf -m mapping.json -s source.json -t template.pdf -o out.pdf \
  --sidecar ./reports/fill-outcome.json
```

`convert-batch` always writes sidecars into a `reports/` subdirectory of the output folder.

## Per-command documentation

Each command has its own page with full argument and option tables, output format, console output samples, and examples:

- [extract-fields](extract-fields.md)
- [build-mappings](build-mappings.md)
- [fill-pdf](fill-pdf.md)
- [fill-xlsx](fill-xlsx.md)
- [convert-batch](convert-batch.md)
