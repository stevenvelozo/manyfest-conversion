const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libXLSX = require('xlsx');

const libFS = require('fs');

/**
 * XLSXFormFiller
 *
 * Fills an Excel workbook from a platform JSON payload using a mapping
 * manyfest.  Each descriptor's TargetFieldName is a cell reference, either
 * fully-qualified with a sheet name (`'FIELD DATA SHEET'!E5` or
 * `FIELD DATA SHEET!E5`) or a bare cell coordinate (`E5`), in which case
 * the workbook's first sheet is used.
 */
class XLSXFormFiller extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'XLSXFormFiller';
	}

	/**
	 * Parse a cell reference into { sheetName, cellAddress }.
	 *
	 *   "'FIELD DATA SHEET'!E5"  -> { sheetName: 'FIELD DATA SHEET', cellAddress: 'E5' }
	 *   "FIELD DATA SHEET!E5"    -> { sheetName: 'FIELD DATA SHEET', cellAddress: 'E5' }
	 *   "Sheet1!A1"              -> { sheetName: 'Sheet1',          cellAddress: 'A1' }
	 *   "E5"                     -> { sheetName: null,              cellAddress: 'E5' }
	 */
	parseCellReference(pRawRef)
	{
		if (!pRawRef || typeof(pRawRef) !== 'string')
		{
			return { sheetName: null, cellAddress: null };
		}

		const tmpTrimmed = pRawRef.trim();
		const tmpBangIndex = tmpTrimmed.lastIndexOf('!');
		if (tmpBangIndex < 0)
		{
			return { sheetName: null, cellAddress: tmpTrimmed };
		}

		let tmpSheet = tmpTrimmed.substring(0, tmpBangIndex).trim();
		const tmpCell = tmpTrimmed.substring(tmpBangIndex + 1).trim();

		// Strip wrapping or stray single quotes.  Excel's convention for sheet
		// names with spaces/special characters is 'Sheet Name', but the sample
		// CSV has asymmetric variants like `FIELD DATA SHEET'!E5` that we
		// also need to tolerate.
		while (tmpSheet.length > 0 && tmpSheet.charAt(0) === "'")
		{
			tmpSheet = tmpSheet.substring(1);
		}
		while (tmpSheet.length > 0 && tmpSheet.charAt(tmpSheet.length - 1) === "'")
		{
			tmpSheet = tmpSheet.substring(0, tmpSheet.length - 1);
		}

		return { sheetName: tmpSheet, cellAddress: tmpCell };
	}

	/**
	 * Write a value into a cell on a SheetJS workbook.  Creates the cell
	 * if it does not already exist and updates the sheet's !ref range so
	 * the written cell is included in subsequent writes.
	 */
	setCellValue(pWorkbook, pSheetName, pCellAddress, pValue)
	{
		const tmpSheet = pWorkbook.Sheets[pSheetName];
		if (!tmpSheet)
		{
			throw new Error(`Sheet [${pSheetName}] not found in workbook.`);
		}

		// Parse the A1-style address into {c, r} so we can extend the sheet
		// range if the cell falls outside the current used area.
		const tmpCellCoord = libXLSX.utils.decode_cell(pCellAddress);

		const tmpCurrentRef = tmpSheet['!ref'];
		if (tmpCurrentRef)
		{
			const tmpRange = libXLSX.utils.decode_range(tmpCurrentRef);
			if (tmpCellCoord.r < tmpRange.s.r)
			{
				tmpRange.s.r = tmpCellCoord.r;
			}
			if (tmpCellCoord.c < tmpRange.s.c)
			{
				tmpRange.s.c = tmpCellCoord.c;
			}
			if (tmpCellCoord.r > tmpRange.e.r)
			{
				tmpRange.e.r = tmpCellCoord.r;
			}
			if (tmpCellCoord.c > tmpRange.e.c)
			{
				tmpRange.e.c = tmpCellCoord.c;
			}
			tmpSheet['!ref'] = libXLSX.utils.encode_range(tmpRange);
		}
		else
		{
			tmpSheet['!ref'] = libXLSX.utils.encode_range(
				{ s: { c: tmpCellCoord.c, r: tmpCellCoord.r }, e: { c: tmpCellCoord.c, r: tmpCellCoord.r } });
		}

		// Use a string-typed cell since platform payloads stringify everything
		// (including numeric and boolean values).  The target spreadsheets are
		// designed for human review, not downstream formula math.
		tmpSheet[pCellAddress] = { t: 's', v: String(pValue), w: String(pValue) };
	}

	/**
	 * End-to-end fill.  Loads the template, writes each mapped descriptor
	 * into its target cell, writes the workbook out, and finalizes the
	 * report.
	 */
	fillXLSX(pMappingManyfest, pSourceData, pTemplateXLSXPath, pOutputXLSXPath, pReport, pConversionReportService)
	{
		if (!libFS.existsSync(pTemplateXLSXPath))
		{
			pConversionReportService.logError(pReport, null, null, `Template XLSX does not exist: ${pTemplateXLSXPath}`);
			pConversionReportService.finalize(pReport);
			throw new Error(`Template XLSX does not exist: ${pTemplateXLSXPath}`);
		}

		const tmpWorkbook = libXLSX.readFile(pTemplateXLSXPath, { cellStyles: true });
		const tmpDefaultSheetName = tmpWorkbook.SheetNames[0];
		const tmpManifestData = pMappingManyfest.manifest || {};
		const tmpSourceRoot = tmpManifestData.SourceRootAddress || '';

		const tmpDescriptorAddresses = pMappingManyfest.elementAddresses || [];
		for (let i = 0; i < tmpDescriptorAddresses.length; i++)
		{
			const tmpRelativeAddress = tmpDescriptorAddresses[i];
			const tmpDescriptor = pMappingManyfest.elementDescriptors[tmpRelativeAddress];
			if (!tmpDescriptor)
			{
				continue;
			}

			const tmpTargetFieldRaw = tmpDescriptor.TargetFieldName || '';
			const tmpFullAddress = this.joinAddress(tmpSourceRoot, tmpRelativeAddress);

			let tmpValue;
			try
			{
				tmpValue = pMappingManyfest.getValueAtAddress(pSourceData, tmpFullAddress);
			}
			catch (pError)
			{
				pConversionReportService.logError(
					pReport,
					tmpTargetFieldRaw,
					tmpFullAddress,
					`Error resolving source address: ${pError.message}`);
				continue;
			}

			if (typeof(tmpValue) === 'undefined' || tmpValue === null)
			{
				pConversionReportService.logWarning(
					pReport,
					tmpTargetFieldRaw,
					tmpFullAddress,
					'Source address did not resolve to a value in the payload.');
				continue;
			}

			if (typeof(tmpValue) === 'object')
			{
				pConversionReportService.logError(
					pReport,
					tmpTargetFieldRaw,
					tmpFullAddress,
					'Source address resolved to an object/array, not a scalar.');
				continue;
			}

			const tmpParsed = this.parseCellReference(tmpTargetFieldRaw);
			const tmpSheetName = tmpParsed.sheetName || tmpDefaultSheetName;
			if (!tmpParsed.cellAddress)
			{
				pConversionReportService.logError(
					pReport,
					tmpTargetFieldRaw,
					tmpFullAddress,
					`Could not parse cell reference [${tmpTargetFieldRaw}]`);
				continue;
			}

			try
			{
				this.setCellValue(tmpWorkbook, tmpSheetName, tmpParsed.cellAddress, tmpValue);
				pConversionReportService.logSuccess(pReport, tmpTargetFieldRaw, tmpFullAddress, tmpValue);
			}
			catch (pError)
			{
				pConversionReportService.logError(
					pReport,
					tmpTargetFieldRaw,
					tmpFullAddress,
					`Error writing cell: ${pError.message}`);
			}
		}

		libXLSX.writeFile(tmpWorkbook, pOutputXLSXPath);
		pConversionReportService.finalize(pReport);
		return pReport;
	}

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
		return `${pSourceRoot}.${pRelativeAddress}`;
	}
}

module.exports = XLSXFormFiller;
