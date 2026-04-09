const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libManyfest = require('manyfest');

const libFS = require('fs');
const libPath = require('path');
const libReadline = require('readline');

/**
 * CSV column names (exact case) expected in the mappings CSV.
 */
const CSV_COLUMN_SORT = 'Sort';
const CSV_COLUMN_PDF_FILE = 'PDF File';
const CSV_COLUMN_FIELD_TYPE = 'Field Type';
const CSV_COLUMN_FIELD_NAME = 'Field Name';
const CSV_COLUMN_FORM = 'Form';
const CSV_COLUMN_DATA_LONG_FILLER = 'Document Data Long Filler';
const CSV_COLUMN_INPUT_ADDRESS = 'Form Input Address';
const CSV_COLUMN_INPUT_ADDRESS_LONG = 'Form Input Address Long';
const CSV_COLUMN_NOTES = 'Notes';

/**
 * Default source root used when a mapping manyfest is applied to the
 * on-disk sample JSONs (which have data nested under ReportData.FormData).
 * The platform envelope is usually AppData.DocumentData.ReportData.FormData,
 * so callers can override via options.
 * 
 * TODO: In the future, we may want to support per-row source root overrides via a 
 * CSV column, but for now this is sufficient for the sample data and keeps the CSV simpler.
 * 
 * TODO: This should change to just an empty string once we know it's safe to do.
 */
const DEFAULT_SOURCE_ROOT_ADDRESS = 'ReportData.FormData';

/**
 * MappingManyfestBuilder
 *
 * Reads a CSV of field mappings and emits one mapping manyfest per target
 * form (PDF or XLSX).  Each mapping manyfest is a standard Manyfest config
 * object whose descriptors are keyed by their source JSON address (relative
 * to SourceRootAddress) and carry target metadata as custom descriptor keys.
 */
class MappingManyfestBuilder extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'MappingManyfestBuilder';
	}

	/**
	 * Classify a target filename by extension.  Tolerates the ".xslx" typo
	 * that appears in the Walbec-MDOT sample CSV.
	 *
	 * @param {string} pTargetFile
	 * @returns {string} 'PDF' | 'XLSX' | 'Unknown'
	 */
	classifyTargetFileType(pTargetFile)
	{
		if (!pTargetFile || typeof(pTargetFile) !== 'string')
		{
			return 'Unknown';
		}
		const tmpLower = pTargetFile.toLowerCase();
		if (tmpLower.endsWith('.pdf'))
		{
			return 'PDF';
		}
		if (tmpLower.endsWith('.xlsx') || tmpLower.endsWith('.xslx') || tmpLower.endsWith('.xlsm'))
		{
			return 'XLSX';
		}
		return 'Unknown';
	}

	/**
	 * Produce a filesystem-safe filename from a target form filename.
	 * Replaces anything non-alphanumeric with underscores and appends
	 * ".mapping.json".
	 */
	manyfestFileNameForTarget(pTargetFile)
	{
		const tmpBase = (pTargetFile || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
		return `${tmpBase}.mapping.json`;
	}

	/**
	 * Generate a short, stable Hash for a descriptor from the target form
	 * filename and target field name.  Used by Manyfest as a lookup key.
	 */
	hashForDescriptor(pTargetFile, pFieldName)
	{
		const tmpForm = (pTargetFile || 'unknown').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]/g, '_');
		const tmpField = (pFieldName || 'unknown').replace(/[^A-Za-z0-9]/g, '_');
		return `${tmpForm}__${tmpField}`;
	}

	/**
	 * Normalize a source address taken from the mapping CSV so that it
	 * parses correctly through Manyfest.getValueAtAddress().
	 *
	 * The Walbec-MDOT CSV uses addresses like "CAGTable[0]CAGB" (no dot
	 * between the closing bracket and the next property).  Manyfest's
	 * address parser only splits on "." separators and would return the
	 * whole array element instead of the "CAGB" field.  We insert a dot
	 * after every "]" that is directly followed by a letter or underscore.
	 */
	normalizeSourceAddress(pAddress)
	{
		if (!pAddress || typeof(pAddress) !== 'string')
		{
			return pAddress;
		}
		return pAddress.replace(/\](?=[A-Za-z_])/g, '].');
	}

	/**
	 * Build a BuildReport object that tracks the outcome of a CSV build.
	 */
	newBuildReport()
	{
		return (
			{
				RowsParsed: 0,
				RowsSkipped: 0,
				RowsAccepted: 0,
				FormCount: 0,
				Forms: {},
				SkipReasons: [],
				Errors: []
			});
	}

	/**
	 * Apply one parsed CSV row to the in-progress mapping manyfest config
	 * map.  Mutates both pMappingConfigs and pBuildReport.
	 *
	 * @param {object} pRow - A row as marshalled by Fable CSVParser (header-keyed object)
	 * @param {object} pMappingConfigs - Accumulator map { [targetFile]: manifestConfig }
	 * @param {object} pBuildReport - Accumulator BuildReport
	 * @param {object} pOptions - Build options
	 */
	applyRowToConfigs(pRow, pMappingConfigs, pBuildReport, pOptions)
	{
		pBuildReport.RowsParsed++;

		if (!pRow || typeof(pRow) !== 'object')
		{
			pBuildReport.RowsSkipped++;
			pBuildReport.SkipReasons.push({ Row: pBuildReport.RowsParsed, Reason: 'Row is not an object' });
			return;
		}

		const tmpTargetFile = (pRow[CSV_COLUMN_PDF_FILE] || '').trim();
		const tmpFieldName = (pRow[CSV_COLUMN_FIELD_NAME] || '').trim();
		const tmpFieldType = (pRow[CSV_COLUMN_FIELD_TYPE] || 'Text').trim();
		const tmpInputAddressRaw = (pRow[CSV_COLUMN_INPUT_ADDRESS] || '').trim();
		const tmpInputAddress = this.normalizeSourceAddress(tmpInputAddressRaw);
		const tmpSourceDocType = (pRow[CSV_COLUMN_FORM] || '').trim();
		const tmpLongFiller = (pRow[CSV_COLUMN_DATA_LONG_FILLER] || '').trim();
		const tmpLongAddress = (pRow[CSV_COLUMN_INPUT_ADDRESS_LONG] || '').trim();
		const tmpNotes = (pRow[CSV_COLUMN_NOTES] || '').trim();
		const tmpSortRaw = pRow[CSV_COLUMN_SORT];

		if (!tmpTargetFile)
		{
			pBuildReport.RowsSkipped++;
			pBuildReport.SkipReasons.push({ Row: pBuildReport.RowsParsed, Reason: 'Missing pdf_file' });
			return;
		}

		// Materialize the manifest config for this target form on first sight,
		// even if this particular row has an empty source address.  Some forms
		// in the sample CSV have all rows unmapped; we still want to emit a
		// mapping manyfest skeleton for them so users can fill in later.
		let tmpConfig = pMappingConfigs[tmpTargetFile];
		if (!tmpConfig)
		{
			const tmpTargetFileType = this.classifyTargetFileType(tmpTargetFile);
			tmpConfig = (
				{
					Scope: `${tmpSourceDocType || 'Unknown'}::${tmpTargetFile}`,
					SourceRootAddress: pOptions.sourceRootAddress || DEFAULT_SOURCE_ROOT_ADDRESS,
					TargetFile: tmpTargetFile,
					TargetFileType: tmpTargetFileType,
					SourceDocumentType: tmpSourceDocType || null,
					SourceRootFullPath: tmpLongFiller || null,
					Descriptors: {},
					HashTranslations: {},
					UnmappedTargetFields: []
				});
			pMappingConfigs[tmpTargetFile] = tmpConfig;
			pBuildReport.FormCount++;
			pBuildReport.Forms[tmpTargetFile] = { DescriptorCount: 0, UnmappedCount: 0, TargetFileType: tmpTargetFileType };
		}

		if (!tmpInputAddress)
		{
			// The row names a target field but has no source address yet.
			// Track it as an unmapped field on the manyfest so downstream
			// tools can see what still needs mapping.
			tmpConfig.UnmappedTargetFields.push(
				{
					FieldName: tmpFieldName,
					FieldType: tmpFieldType || 'Text',
					Notes: tmpNotes || null
				});
			pBuildReport.Forms[tmpTargetFile].UnmappedCount++;
			pBuildReport.RowsSkipped++;
			pBuildReport.SkipReasons.push({ Row: pBuildReport.RowsParsed, TargetFile: tmpTargetFile, FieldName: tmpFieldName, Reason: 'Missing Form Input Address' });
			return;
		}

		if (!tmpFieldName)
		{
			pBuildReport.RowsSkipped++;
			pBuildReport.SkipReasons.push({ Row: pBuildReport.RowsParsed, TargetFile: tmpTargetFile, Reason: 'Missing field_name' });
			return;
		}

		// If the same source address appears twice in the CSV, keep the first
		// and record a warning.  We cannot have two descriptors at the same
		// Manyfest address.
		if (Object.prototype.hasOwnProperty.call(tmpConfig.Descriptors, tmpInputAddress))
		{
			pBuildReport.RowsSkipped++;
			pBuildReport.SkipReasons.push(
				{
					Row: pBuildReport.RowsParsed,
					TargetFile: tmpTargetFile,
					FieldName: tmpFieldName,
					Reason: `Duplicate source address "${tmpInputAddress}" on form "${tmpTargetFile}"; keeping first occurrence`
				});
			return;
		}

		const tmpDescriptor = (
			{
				Name: `${tmpTargetFile}/${tmpFieldName}`,
				Hash: this.hashForDescriptor(tmpTargetFile, tmpFieldName),
				DataType: 'String',
				TargetFieldName: tmpFieldName,
				TargetFieldType: tmpFieldType || 'Text',
				SourceSortOrder: (tmpSortRaw === '' || tmpSortRaw == null) ? null : Number(tmpSortRaw),
				SourceAddressRaw: tmpInputAddressRaw,
				SourceAddressLong: tmpLongAddress || null
			});

		if (tmpNotes)
		{
			tmpDescriptor.Notes = tmpNotes;
		}

		tmpConfig.Descriptors[tmpInputAddress] = tmpDescriptor;
		pBuildReport.RowsAccepted++;
		pBuildReport.Forms[tmpTargetFile].DescriptorCount++;
	}

	/**
	 * Stream a CSV file through Fable CSVParser, accumulate mapping
	 * manyfest configs, and invoke the callback.
	 *
	 * @param {string} pCSVFilePath
	 * @param {object} [pOptions]
	 * @param {string} [pOptions.sourceRootAddress]
	 * @param {Function} fCallback - (err, { MappingConfigs, BuildReport }) => void
	 */
	buildFromCSVFile(pCSVFilePath, pOptions, fCallback)
	{
		if (typeof(pOptions) === 'function')
		{
			fCallback = pOptions;
			pOptions = {};
		}
		pOptions = pOptions || {};

		if (!pCSVFilePath || !libFS.existsSync(pCSVFilePath))
		{
			return fCallback(new Error(`CSV file [${pCSVFilePath}] does not exist.`));
		}

		// Ensure the fable CSV parser is available.
		if (!this.fable.CSVParser)
		{
			if (typeof(this.fable.instantiateServiceProvider) === 'function')
			{
				this.fable.instantiateServiceProvider('CSVParser');
			}
		}
		const tmpCSVParser = this.fable.CSVParser;
		if (!tmpCSVParser)
		{
			return fCallback(new Error('Fable CSVParser service is not available.'));
		}

		// Reset parser state.  CSVParser is stateful across lines (by
		// design, for multi-line quoted values) so we need a clean slate.
		tmpCSVParser.Header = [];
		tmpCSVParser.HeaderFieldNames = [];
		tmpCSVParser.HasSetHeader = false;
		tmpCSVParser.CurrentLine = '';
		tmpCSVParser.CurrentRecord = [];
		tmpCSVParser.InQuote = false;
		tmpCSVParser.InEscapedQuote = false;
		tmpCSVParser.LinesParsed = 0;
		tmpCSVParser.RowsEmitted = 0;

		const tmpMappingConfigs = {};
		const tmpBuildReport = this.newBuildReport();

		const tmpReadline = libReadline.createInterface(
			{
				input: libFS.createReadStream(pCSVFilePath),
				crlfDelay: Infinity
			});

		tmpReadline.on('line',
			(pLine) =>
			{
				const tmpRecord = tmpCSVParser.parseCSVLine(pLine);
				if (tmpRecord && typeof(tmpRecord) === 'object' && !Array.isArray(tmpRecord))
				{
					this.applyRowToConfigs(tmpRecord, tmpMappingConfigs, tmpBuildReport, pOptions);
				}
			});

		tmpReadline.on('error',
			(pError) =>
			{
				return fCallback(pError);
			});

		tmpReadline.on('close',
			() =>
			{
				return fCallback(null, { MappingConfigs: tmpMappingConfigs, BuildReport: tmpBuildReport });
			});
	}

	/**
	 * Synchronous counterpart to buildFromCSVFile.  Reads the whole file
	 * into memory and parses line by line.  Useful in tests and small CLI
	 * runs where streaming gives no benefit.
	 */
	buildFromCSVFileSync(pCSVFilePath, pOptions)
	{
		pOptions = pOptions || {};

		if (!pCSVFilePath || !libFS.existsSync(pCSVFilePath))
		{
			throw new Error(`CSV file [${pCSVFilePath}] does not exist.`);
		}

		if (!this.fable.CSVParser && typeof(this.fable.instantiateServiceProvider) === 'function')
		{
			this.fable.instantiateServiceProvider('CSVParser');
		}
		const tmpCSVParser = this.fable.CSVParser;
		if (!tmpCSVParser)
		{
			throw new Error('Fable CSVParser service is not available.');
		}

		tmpCSVParser.Header = [];
		tmpCSVParser.HeaderFieldNames = [];
		tmpCSVParser.HasSetHeader = false;
		tmpCSVParser.CurrentLine = '';
		tmpCSVParser.CurrentRecord = [];
		tmpCSVParser.InQuote = false;
		tmpCSVParser.InEscapedQuote = false;
		tmpCSVParser.LinesParsed = 0;
		tmpCSVParser.RowsEmitted = 0;

		const tmpMappingConfigs = {};
		const tmpBuildReport = this.newBuildReport();

		const tmpFileContents = libFS.readFileSync(pCSVFilePath, 'utf8');
		const tmpLines = tmpFileContents.split(/\r?\n/);
		for (let i = 0; i < tmpLines.length; i++)
		{
			const tmpLine = tmpLines[i];
			// Skip trailing empty line from the split.
			if (i === tmpLines.length - 1 && tmpLine === '')
			{
				break;
			}
			const tmpRecord = tmpCSVParser.parseCSVLine(tmpLine);
			if (tmpRecord && typeof(tmpRecord) === 'object' && !Array.isArray(tmpRecord))
			{
				this.applyRowToConfigs(tmpRecord, tmpMappingConfigs, tmpBuildReport, pOptions);
			}
		}

		return { MappingConfigs: tmpMappingConfigs, BuildReport: tmpBuildReport };
	}

	/**
	 * Materialize a map of config objects into live Manyfest instances.
	 */
	instantiateManyfests(pMappingConfigs)
	{
		const tmpResult = {};
		const tmpKeys = Object.keys(pMappingConfigs || {});
		for (let i = 0; i < tmpKeys.length; i++)
		{
			const tmpKey = tmpKeys[i];
			const tmpConfig = pMappingConfigs[tmpKey];
			const tmpManyfest = new libManyfest();
			tmpManyfest.loadManifest(tmpConfig);
			// Manyfest.loadManifest only copies known top-level fields.  Re-attach
			// our custom top-level metadata so it survives serialize() round-trips
			// performed through Manyfest.getManifest() callers.
			tmpManyfest.manifest = tmpManyfest.manifest || {};
			tmpManyfest.manifest.SourceRootAddress = tmpConfig.SourceRootAddress;
			tmpManyfest.manifest.TargetFile = tmpConfig.TargetFile;
			tmpManyfest.manifest.TargetFileType = tmpConfig.TargetFileType;
			tmpManyfest.manifest.SourceDocumentType = tmpConfig.SourceDocumentType;
			tmpManyfest.manifest.SourceRootFullPath = tmpConfig.SourceRootFullPath;
			tmpManyfest.manifest.UnmappedTargetFields = tmpConfig.UnmappedTargetFields || [];
			tmpResult[tmpKey] = tmpManyfest;
		}
		return tmpResult;
	}

	/**
	 * Write a map of mapping manyfest configs to disk.  One file per form.
	 *
	 * @returns {Array<string>} the paths written
	 */
	writeManyfestsToDirectory(pMappingConfigs, pOutputDir)
	{
		if (!libFS.existsSync(pOutputDir))
		{
			libFS.mkdirSync(pOutputDir, { recursive: true });
		}

		const tmpPathsWritten = [];
		const tmpKeys = Object.keys(pMappingConfigs || {});
		for (let i = 0; i < tmpKeys.length; i++)
		{
			const tmpKey = tmpKeys[i];
			const tmpFileName = this.manyfestFileNameForTarget(tmpKey);
			const tmpFullPath = libPath.join(pOutputDir, tmpFileName);
			libFS.writeFileSync(tmpFullPath, JSON.stringify(pMappingConfigs[tmpKey], null, 4));
			tmpPathsWritten.push(tmpFullPath);
		}
		return tmpPathsWritten;
	}

	/**
	 * Load a previously-written mapping manyfest JSON back into memory as a
	 * live Manyfest instance.  Does NOT mutate fable state.
	 */
	loadMappingManyfestFromFile(pMappingFilePath)
	{
		if (!libFS.existsSync(pMappingFilePath))
		{
			throw new Error(`Mapping manyfest file [${pMappingFilePath}] does not exist.`);
		}
		const tmpRaw = libFS.readFileSync(pMappingFilePath, 'utf8');
		const tmpConfig = JSON.parse(tmpRaw);
		const tmpManyfest = new libManyfest();
		tmpManyfest.loadManifest(tmpConfig);
		tmpManyfest.manifest = tmpManyfest.manifest || {};
		tmpManyfest.manifest.SourceRootAddress = tmpConfig.SourceRootAddress;
		tmpManyfest.manifest.TargetFile = tmpConfig.TargetFile;
		tmpManyfest.manifest.TargetFileType = tmpConfig.TargetFileType;
		tmpManyfest.manifest.SourceDocumentType = tmpConfig.SourceDocumentType;
		tmpManyfest.manifest.SourceRootFullPath = tmpConfig.SourceRootFullPath;
		tmpManyfest.manifest.UnmappedTargetFields = tmpConfig.UnmappedTargetFields || [];
		return tmpManyfest;
	}

	/**
	 * Join a source root address with a descriptor's relative address in a
	 * way that is safe with brackets.
	 *
	 *   joinAddress('ReportData.FormData', 'H.CtrlSec') => 'ReportData.FormData.H.CtrlSec'
	 *   joinAddress('ReportData.FormData', 'CAGTable[0]CAGB') => 'ReportData.FormData.CAGTable[0]CAGB'
	 *   joinAddress('',                    'H.CtrlSec') => 'H.CtrlSec'
	 */
	joinAddress(pSourceRoot, pRelativeAddress)
	{
		if (!pSourceRoot)
		{
			return pRelativeAddress;
		}
		if (!pRelativeAddress)
		{
			return pSourceRoot;
		}
		// If the relative part starts with a bracket we still need a dot.
		return `${pSourceRoot}.${pRelativeAddress}`;
	}
}

MappingManyfestBuilder.DEFAULT_SOURCE_ROOT_ADDRESS = DEFAULT_SOURCE_ROOT_ADDRESS;

module.exports = MappingManyfestBuilder;
