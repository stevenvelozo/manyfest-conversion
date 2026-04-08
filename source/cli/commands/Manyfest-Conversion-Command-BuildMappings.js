const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

const libPath = require('path');

class ManyfestConversionCommandBuildMappings extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'build-mappings';
		this.options.Description = 'Parse a mapping CSV and write one mapping manyfest JSON per target form.';
		this.options.Aliases.push('bm');
		this.options.Aliases.push('build_mappings');

		this.options.CommandArguments.push({ Name: '[file]', Description: 'The mapping CSV to parse.  May also be passed via -i.' });

		this.options.CommandOptions.push({ Name: '-i, --input [filepath]', Description: 'The mapping CSV to parse.' });
		this.options.CommandOptions.push({ Name: '-o, --output [dirpath]', Description: 'Directory to write .mapping.json files into.  Defaults to ./mfconv-mappings.' });
		this.options.CommandOptions.push({ Name: '-r, --source-root [address]', Description: 'Source root address prepended to every descriptor at resolution time.  Defaults to ReportData.FormData.' });

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		const tmpOperationState = (
			{
				RawInputFile: this.CommandOptions.input || this.ArgumentString,
				RawOutputDirectory: this.CommandOptions.output,
				SourceRootAddress: this.CommandOptions.sourceRoot
			});

		if ((!tmpOperationState.RawInputFile) || (typeof(tmpOperationState.RawInputFile) !== 'string') || (tmpOperationState.RawInputFile.length === 0))
		{
			this.fable.log.error(`No valid input CSV filename provided.`);
			return fCallback();
		}

		if ((!tmpOperationState.RawOutputDirectory) || (typeof(tmpOperationState.RawOutputDirectory) !== 'string') || (tmpOperationState.RawOutputDirectory.length === 0))
		{
			tmpOperationState.RawOutputDirectory = libPath.join(process.cwd(), 'mfconv-mappings');
			this.fable.log.info(`No output directory provided.  Defaulting to ${tmpOperationState.RawOutputDirectory}`);
		}

		this.fable.instantiateServiceProvider('CSVParser');
		this.fable.instantiateServiceProvider('FilePersistence');
		this.fable.addAndInstantiateServiceTypeIfNotExists('MappingManyfestBuilder', require('../../services/Service-MappingManyfestBuilder.js'));

		tmpOperationState.InputFilePath = this.fable.FilePersistence.resolvePath(tmpOperationState.RawInputFile);
		tmpOperationState.OutputDirectoryPath = this.fable.FilePersistence.resolvePath(tmpOperationState.RawOutputDirectory);

		if (!this.fable.FilePersistence.existsSync(tmpOperationState.InputFilePath))
		{
			this.fable.log.error(`CSV file [${tmpOperationState.InputFilePath}] does not exist.`);
			return fCallback();
		}

		const tmpBuildOptions = {};
		if (tmpOperationState.SourceRootAddress)
		{
			tmpBuildOptions.sourceRootAddress = tmpOperationState.SourceRootAddress;
		}

		this.fable.log.info(`Building mapping manyfests from [${tmpOperationState.InputFilePath}]...`);

		this.fable.MappingManyfestBuilder.buildFromCSVFile(
			tmpOperationState.InputFilePath,
			tmpBuildOptions,
			(pError, pResult) =>
			{
				if (pError)
				{
					this.fable.log.error(`Error building mappings: ${pError.message}`);
					return fCallback();
				}

				const tmpBuildReport = pResult.BuildReport;
				const tmpMappingConfigs = pResult.MappingConfigs;

				this.fable.log.info(`Parsed ${tmpBuildReport.RowsParsed} CSV rows (${tmpBuildReport.RowsAccepted} accepted, ${tmpBuildReport.RowsSkipped} skipped).`);
				this.fable.log.info(`Discovered ${tmpBuildReport.FormCount} distinct target forms:`);

				const tmpFormKeys = Object.keys(tmpBuildReport.Forms);
				for (let i = 0; i < tmpFormKeys.length; i++)
				{
					const tmpKey = tmpFormKeys[i];
					const tmpFormInfo = tmpBuildReport.Forms[tmpKey];
					const tmpUnmapped = tmpFormInfo.UnmappedCount || 0;
					this.fable.log.info(`  -> [${tmpFormInfo.TargetFileType}] ${tmpKey} (${tmpFormInfo.DescriptorCount} mapped, ${tmpUnmapped} unmapped)`);
				}

				const tmpPathsWritten = this.fable.MappingManyfestBuilder.writeManyfestsToDirectory(
					tmpMappingConfigs, tmpOperationState.OutputDirectoryPath);

				this.fable.log.info(`Wrote ${tmpPathsWritten.length} mapping manyfest file(s) to ${tmpOperationState.OutputDirectoryPath}`);

				if (tmpBuildReport.RowsSkipped > 0)
				{
					const tmpReportPath = libPath.join(tmpOperationState.OutputDirectoryPath, 'build-report.json');
					this.fable.FilePersistence.writeFileSyncFromObject(tmpReportPath, tmpBuildReport);
					this.fable.log.warn(`${tmpBuildReport.RowsSkipped} row(s) were skipped.  Details in ${tmpReportPath}`);
				}

				return fCallback();
			});
	}
}

module.exports = ManyfestConversionCommandBuildMappings;
