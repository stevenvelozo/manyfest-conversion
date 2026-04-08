const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

const libFS = require('fs');
const libPath = require('path');

class ManyfestConversionCommandConvertBatch extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'convert-batch';
		this.options.Description = 'Fill every applicable PDF/XLSX for every source JSON by routing on DocumentType.';
		this.options.Aliases.push('cb');
		this.options.Aliases.push('convert_batch');

		this.options.CommandOptions.push({ Name: '-m, --mappings [dirpath]', Description: 'Directory containing .mapping.json files.' });
		this.options.CommandOptions.push({ Name: '-s, --source [dirpath]', Description: 'Directory containing source JSON payloads.' });
		this.options.CommandOptions.push({ Name: '-t, --templates [dirpath]', Description: 'Directory containing template PDF / XLSX files.' });
		this.options.CommandOptions.push({ Name: '-o, --output [dirpath]', Description: 'Directory to write filled artifacts and reports into.' });
		this.options.CommandOptions.push({ Name: '-r, --source-root [address]', Description: 'Override the SourceRootAddress on every mapping manyfest.' });

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		const tmpOperationState = (
			{
				RawMappingsDir: this.CommandOptions.mappings,
				RawSourceDir: this.CommandOptions.source,
				RawTemplatesDir: this.CommandOptions.templates,
				RawOutputDir: this.CommandOptions.output,
				SourceRootOverride: this.CommandOptions.sourceRoot
			});

		const tmpRequiredKeys = ['RawMappingsDir', 'RawSourceDir', 'RawTemplatesDir', 'RawOutputDir'];
		for (let i = 0; i < tmpRequiredKeys.length; i++)
		{
			const tmpKey = tmpRequiredKeys[i];
			if (!tmpOperationState[tmpKey] || typeof(tmpOperationState[tmpKey]) !== 'string')
			{
				this.fable.log.error(`Missing required option for convert-batch: ${tmpKey}`);
				return fCallback();
			}
		}

		this.fable.instantiateServiceProvider('FilePersistence');
		this.fable.addAndInstantiateServiceTypeIfNotExists('MappingManyfestBuilder', require('../../services/Service-MappingManyfestBuilder.js'));
		this.fable.addAndInstantiateServiceTypeIfNotExists('PDFFormFiller', require('../../services/Service-PDFFormFiller.js'));
		this.fable.addAndInstantiateServiceTypeIfNotExists('XLSXFormFiller', require('../../services/Service-XLSXFormFiller.js'));
		this.fable.addAndInstantiateServiceTypeIfNotExists('ConversionReport', require('../../services/Service-ConversionReport.js'));

		tmpOperationState.MappingsDir = this.fable.FilePersistence.resolvePath(tmpOperationState.RawMappingsDir);
		tmpOperationState.SourceDir = this.fable.FilePersistence.resolvePath(tmpOperationState.RawSourceDir);
		tmpOperationState.TemplatesDir = this.fable.FilePersistence.resolvePath(tmpOperationState.RawTemplatesDir);
		tmpOperationState.OutputDir = this.fable.FilePersistence.resolvePath(tmpOperationState.RawOutputDir);

		if (!libFS.existsSync(tmpOperationState.OutputDir))
		{
			libFS.mkdirSync(tmpOperationState.OutputDir, { recursive: true });
		}
		const tmpReportsDir = libPath.join(tmpOperationState.OutputDir, 'reports');
		if (!libFS.existsSync(tmpReportsDir))
		{
			libFS.mkdirSync(tmpReportsDir, { recursive: true });
		}

		// Load every mapping manyfest under MappingsDir.
		const tmpMappingFiles = libFS.readdirSync(tmpOperationState.MappingsDir)
			.filter((pName) => pName.toLowerCase().endsWith('.mapping.json'));
		const tmpMappingsByDocType = {};
		for (let i = 0; i < tmpMappingFiles.length; i++)
		{
			const tmpFullPath = libPath.join(tmpOperationState.MappingsDir, tmpMappingFiles[i]);
			let tmpManyfest;
			try
			{
				tmpManyfest = this.fable.MappingManyfestBuilder.loadMappingManyfestFromFile(tmpFullPath);
			}
			catch (pError)
			{
				this.fable.log.error(`Failed to load mapping [${tmpFullPath}]: ${pError.message}`);
				continue;
			}
			if (tmpOperationState.SourceRootOverride)
			{
				tmpManyfest.manifest.SourceRootAddress = tmpOperationState.SourceRootOverride;
			}
			const tmpDocType = tmpManyfest.manifest.SourceDocumentType || '__UNROUTED__';
			if (!tmpMappingsByDocType[tmpDocType])
			{
				tmpMappingsByDocType[tmpDocType] = [];
			}
			tmpMappingsByDocType[tmpDocType].push({ path: tmpFullPath, manyfest: tmpManyfest });
		}

		this.fable.log.info(`Loaded ${tmpMappingFiles.length} mapping manyfest(s) across ${Object.keys(tmpMappingsByDocType).length} document type(s).`);

		// Iterate source JSON files.
		const tmpSourceFiles = libFS.readdirSync(tmpOperationState.SourceDir)
			.filter((pName) => pName.toLowerCase().endsWith('.json'));

		let tmpTotalArtifacts = 0;
		let tmpTotalErrors = 0;
		let tmpTotalWarnings = 0;

		for (let i = 0; i < tmpSourceFiles.length; i++)
		{
			const tmpSourceFileName = tmpSourceFiles[i];
			const tmpSourceFilePath = libPath.join(tmpOperationState.SourceDir, tmpSourceFileName);

			let tmpSourceData;
			try
			{
				tmpSourceData = JSON.parse(libFS.readFileSync(tmpSourceFilePath, 'utf8'));
			}
			catch (pError)
			{
				this.fable.log.error(`Failed to parse ${tmpSourceFileName}: ${pError.message}`);
				continue;
			}

			// Document type is at ReportData.DocumentType in the exported payloads.
			let tmpDocType = null;
			if (tmpSourceData && tmpSourceData.ReportData && tmpSourceData.ReportData.DocumentType)
			{
				tmpDocType = tmpSourceData.ReportData.DocumentType;
			}

			if (!tmpDocType)
			{
				this.fable.log.warn(`[${tmpSourceFileName}] has no ReportData.DocumentType; skipping.`);
				continue;
			}

			const tmpMatchingMappings = tmpMappingsByDocType[tmpDocType] || [];
			if (tmpMatchingMappings.length === 0)
			{
				this.fable.log.warn(`[${tmpSourceFileName}] has DocumentType [${tmpDocType}] but no mapping manyfest targets it; skipping.`);
				continue;
			}

			for (let j = 0; j < tmpMatchingMappings.length; j++)
			{
				const tmpEntry = tmpMatchingMappings[j];
				const tmpTargetFileName = tmpEntry.manyfest.manifest.TargetFile;
				const tmpTargetFileType = tmpEntry.manyfest.manifest.TargetFileType;
				let tmpTemplatePath = libPath.join(tmpOperationState.TemplatesDir, tmpTargetFileName);

				// Tolerate the ".xslx" typo that appears in the sample CSV by
				// falling back to the correct ".xlsx" extension on disk.
				if (!libFS.existsSync(tmpTemplatePath) && /\.xslx$/i.test(tmpTargetFileName))
				{
					const tmpAltName = tmpTargetFileName.replace(/\.xslx$/i, '.xlsx');
					const tmpAltPath = libPath.join(tmpOperationState.TemplatesDir, tmpAltName);
					if (libFS.existsSync(tmpAltPath))
					{
						tmpTemplatePath = tmpAltPath;
					}
				}

				if (!libFS.existsSync(tmpTemplatePath))
				{
					this.fable.log.warn(`Template file [${tmpTemplatePath}] not found; skipping this output.`);
					continue;
				}

				const tmpSourceBase = libPath.basename(tmpSourceFileName, '.json');
				// Normalize the ".xslx" typo from the sample CSV when it shows
				// up as a target filename so the output extension is one that
				// SheetJS can serialize.
				const tmpNormalizedTargetName = tmpTargetFileType === 'XLSX'
					? tmpTargetFileName.replace(/\.xslx$/i, '.xlsx')
					: tmpTargetFileName;
				const tmpSafeTargetName = tmpNormalizedTargetName.replace(/[^A-Za-z0-9._-]/g, '_');
				const tmpOutputFileName = `${tmpSourceBase}__${tmpSafeTargetName}`;
				const tmpOutputPath = libPath.join(tmpOperationState.OutputDir, tmpOutputFileName);
				const tmpSidecarPath = libPath.join(tmpReportsDir, `${tmpOutputFileName}.report.json`);

				const tmpReport = this.fable.ConversionReport.newReport(tmpSourceFilePath, tmpTargetFileName, tmpEntry.manyfest);

				try
				{
					if (tmpTargetFileType === 'PDF')
					{
						this.fable.PDFFormFiller.fillPDF(tmpEntry.manyfest, tmpSourceData, tmpTemplatePath, tmpOutputPath, tmpReport, this.fable.ConversionReport);
					}
					else if (tmpTargetFileType === 'XLSX')
					{
						this.fable.XLSXFormFiller.fillXLSX(tmpEntry.manyfest, tmpSourceData, tmpTemplatePath, tmpOutputPath, tmpReport, this.fable.ConversionReport);
					}
					else
					{
						this.fable.log.warn(`Unknown target file type [${tmpTargetFileType}] for ${tmpTargetFileName}; skipping.`);
						continue;
					}
				}
				catch (pError)
				{
					this.fable.log.error(`Fill failed for [${tmpTargetFileName}] <- [${tmpSourceFileName}]: ${pError.message}`);
					this.fable.ConversionReport.writeSidecar(tmpReport, tmpSidecarPath);
					tmpTotalErrors++;
					continue;
				}

				this.fable.ConversionReport.writeSidecar(tmpReport, tmpSidecarPath);
				tmpTotalArtifacts++;
				tmpTotalErrors += tmpReport.Stats.ErrorCount;
				tmpTotalWarnings += tmpReport.Stats.WarningCount;

				this.fable.log.info(`[ok] ${tmpSourceFileName} -> ${tmpTargetFileName} (${tmpReport.Stats.SuccessCount} success / ${tmpReport.Stats.WarningCount} warn / ${tmpReport.Stats.ErrorCount} error)`);
			}
		}

		this.fable.log.info(`Batch complete.  Artifacts: ${tmpTotalArtifacts}; total warnings: ${tmpTotalWarnings}; total errors: ${tmpTotalErrors}.`);

		if (tmpTotalErrors > 0)
		{
			process.exitCode = 2;
		}

		return fCallback();
	}
}

module.exports = ManyfestConversionCommandConvertBatch;
