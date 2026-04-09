const libCommandLineCommand = require('pict-service-commandlineutility').ServiceCommandLineCommand;

const libFS = require('fs');
const libPath = require('path');

class ManyfestConversionCommandExtractFields extends libCommandLineCommand
{
	constructor(pFable, pManifest, pServiceHash)
	{
		super(pFable, pManifest, pServiceHash);

		this.options.CommandKeyword = 'extract-fields';
		this.options.Description = 'Extract fillable form fields from a PDF and emit a ready-to-fill mapping CSV.';
		this.options.Aliases.push('ef');
		this.options.Aliases.push('extract_fields');

		this.options.CommandArguments.push({ Name: '[file]', Description: 'The PDF file to extract fields from (alternative to -i).' });

		this.options.CommandOptions.push({ Name: '-i, --input [filepath]', Description: 'The PDF file to extract fields from.' });
		this.options.CommandOptions.push({ Name: '-o, --output [filepath]', Description: 'The CSV file to write.  Defaults to <pdf-basename>-ManyfestMapping.csv next to the PDF.' });
		this.options.CommandOptions.push({ Name: '-f, --form [name]', Description: 'Optional Form (DocumentType) value to bake into every row.' });
		this.options.CommandOptions.push({ Name: '-d, --document-data-long-filler [prefix]', Description: 'Optional "Document Data Long Filler" prefix to bake into every row.' });

		this.addCommand();
	}

	onRunAsync(fCallback)
	{
		const tmpOperationState = (
			{
				RawInputFile: this.CommandOptions.input || this.ArgumentString,
				RawOutputFile: this.CommandOptions.output,
				FormName: this.CommandOptions.form,
				DocumentDataLongFiller: this.CommandOptions.documentDataLongFiller
			});

		if ((!tmpOperationState.RawInputFile) || (typeof(tmpOperationState.RawInputFile) !== 'string') || (tmpOperationState.RawInputFile.length === 0))
		{
			this.fable.log.error(`No input PDF filename provided.`);
			return fCallback();
		}

		this.fable.instantiateServiceProvider('FilePersistence');
		this.fable.addAndInstantiateServiceTypeIfNotExists('PDFFormFiller', require('../../services/Service-PDFFormFiller.js'));
		this.fable.addAndInstantiateServiceTypeIfNotExists('MappingManyfestBuilder', require('../../services/Service-MappingManyfestBuilder.js'));

		tmpOperationState.InputFilePath = this.fable.FilePersistence.resolvePath(tmpOperationState.RawInputFile);

		if (!libFS.existsSync(tmpOperationState.InputFilePath))
		{
			this.fable.log.error(`PDF file [${tmpOperationState.InputFilePath}] does not exist.`);
			return fCallback();
		}

		if (tmpOperationState.RawOutputFile && typeof(tmpOperationState.RawOutputFile) === 'string' && tmpOperationState.RawOutputFile.length > 0)
		{
			tmpOperationState.OutputFilePath = this.fable.FilePersistence.resolvePath(tmpOperationState.RawOutputFile);
		}
		else
		{
			tmpOperationState.OutputFilePath = this.fable.MappingManyfestBuilder.defaultMappingCSVPathForPDF(tmpOperationState.InputFilePath);
		}

		const tmpBuildOptions = {};
		if (tmpOperationState.FormName)
		{
			tmpBuildOptions.formName = tmpOperationState.FormName;
		}
		if (tmpOperationState.DocumentDataLongFiller)
		{
			tmpBuildOptions.documentDataLongFiller = tmpOperationState.DocumentDataLongFiller;
		}

		this.fable.log.info(`Extracting fields from [${tmpOperationState.InputFilePath}]...`);

		let tmpResult;
		try
		{
			tmpResult = this.fable.MappingManyfestBuilder.generateMappingCSVFromPDF(
				tmpOperationState.InputFilePath,
				tmpOperationState.OutputFilePath,
				tmpBuildOptions);
		}
		catch (pError)
		{
			this.fable.log.error(`Field extraction failed: ${pError.message}`);
			return fCallback();
		}

		// Summarize the extraction result.
		const tmpTypeCounts = {};
		for (const tmpField of tmpResult.fields)
		{
			const tmpType = tmpField.FieldType || 'Unknown';
			tmpTypeCounts[tmpType] = (tmpTypeCounts[tmpType] || 0) + 1;
		}

		this.fable.log.info(`Extracted ${tmpResult.fields.length} field(s) from ${tmpResult.targetFileName}`);
		for (const tmpType of Object.keys(tmpTypeCounts).sort())
		{
			this.fable.log.info(`  -> ${tmpType}: ${tmpTypeCounts[tmpType]}`);
		}
		this.fable.log.info(`Wrote mapping CSV to ${tmpResult.outputPath}`);
		this.fable.log.info(`Next step: hand-edit the "Form Input Address" and "Form" columns, then run: mfconv build-mappings -i ${libPath.basename(tmpResult.outputPath)} -o ./translations`);

		return fCallback();
	}
}

module.exports = ManyfestConversionCommandExtractFields;
