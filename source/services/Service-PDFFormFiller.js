const libFableServiceProviderBase = require('fable-serviceproviderbase');

const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');
const libChildProcess = require('child_process');

const PDFTK_BINARY_CANDIDATES = ['pdftk', 'pdftk-java'];

/**
 * PDFFormFiller
 *
 * Fills an AcroForm PDF from a platform JSON payload using a mapping
 * manyfest.  The heavy lifting is delegated to the `pdftk` binary via
 * child_process.execFile with an XFDF input document (chosen over FDF for
 * its native Unicode handling and straightforward XML escaping).
 *
 * `pdftk` must be on the caller's PATH; install on macOS via
 * `brew install pdftk-java` or on Debian/Ubuntu via `apt install pdftk`.
 */
class PDFFormFiller extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'PDFFormFiller';
	}

	/**
	 * Return the first pdftk-style binary found on PATH, or null.
	 */
	resolvePDFTKBinary()
	{
		for (let i = 0; i < PDFTK_BINARY_CANDIDATES.length; i++)
		{
			const tmpCandidate = PDFTK_BINARY_CANDIDATES[i];
			try
			{
				const tmpResult = libChildProcess.spawnSync('which', [tmpCandidate], { encoding: 'utf8' });
				if (tmpResult.status === 0 && tmpResult.stdout)
				{
					const tmpTrimmed = tmpResult.stdout.trim();
					if (tmpTrimmed)
					{
						return tmpTrimmed;
					}
				}
			}
			catch (pError)
			{
				// Ignore and try the next candidate.
			}
		}
		return null;
	}

	/**
	 * Escape a string for safe inclusion inside an XFDF <value> element.
	 */
	escapeXML(pValue)
	{
		if (pValue === null || typeof(pValue) === 'undefined')
		{
			return '';
		}
		return String(pValue)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	/**
	 * Build an XFDF document from a mapping manyfest + source data object.
	 * This is a pure function (no IO, no pdftk) and returns both the XFDF
	 * string and a structured report describing which descriptors were
	 * emitted, skipped, or errored.
	 *
	 * @param {object} pMappingManyfest - Live Manyfest instance
	 * @param {object} pSourceData - The platform JSON payload (root level)
	 * @param {object} pReport - ConversionReport to annotate (required)
	 * @param {object} pConversionReportService - The ConversionReport service
	 * @returns {{ xfdf: string, fieldCount: number }}
	 */
	buildXFDF(pMappingManyfest, pSourceData, pReport, pConversionReportService)
	{
		const tmpFieldLines = [];
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

			const tmpFieldName = tmpDescriptor.TargetFieldName || tmpRelativeAddress;
			const tmpFullAddress = this.joinAddress(tmpSourceRoot, tmpRelativeAddress);

			// PDF Button/Checkbox rows are explicitly warn-and-skip in v1.
			if ((tmpDescriptor.TargetFieldType || '').toLowerCase() === 'button')
			{
				pConversionReportService.logWarning(
					pReport,
					tmpFieldName,
					tmpFullAddress,
					'PDF checkbox/Button mappings are warn-and-skip in manyfest-conversion v1.');
				continue;
			}

			let tmpValue;
			try
			{
				tmpValue = pMappingManyfest.getValueAtAddress(pSourceData, tmpFullAddress);
			}
			catch (pError)
			{
				pConversionReportService.logError(
					pReport,
					tmpFieldName,
					tmpFullAddress,
					`Error resolving source address: ${pError.message}`);
				continue;
			}

			if (typeof(tmpValue) === 'undefined' || tmpValue === null)
			{
				pConversionReportService.logWarning(
					pReport,
					tmpFieldName,
					tmpFullAddress,
					'Source address did not resolve to a value in the payload.');
				continue;
			}

			if (typeof(tmpValue) === 'object')
			{
				pConversionReportService.logError(
					pReport,
					tmpFieldName,
					tmpFullAddress,
					'Source address resolved to an object/array, not a scalar.');
				continue;
			}

			const tmpEscapedName = this.escapeXML(tmpFieldName);
			const tmpEscapedValue = this.escapeXML(tmpValue);
			tmpFieldLines.push(`    <field name="${tmpEscapedName}"><value>${tmpEscapedValue}</value></field>`);

			pConversionReportService.logSuccess(pReport, tmpFieldName, tmpFullAddress, tmpValue);
		}

		const tmpXFDF = [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">',
			'  <fields>',
			tmpFieldLines.join('\n'),
			'  </fields>',
			'</xfdf>',
			''
		].join('\n');

		return { xfdf: tmpXFDF, fieldCount: tmpFieldLines.length };
	}

	/**
	 * Shell out to pdftk to apply an XFDF file to a template PDF, writing
	 * a filled PDF to the given output path.  Uses execFile (not exec) so
	 * filenames cannot be mis-interpreted as shell arguments.
	 */
	runPDFTK(pTemplatePDFPath, pXFDFPath, pOutputPDFPath)
	{
		const tmpBinary = this.resolvePDFTKBinary();
		if (!tmpBinary)
		{
			throw new Error('pdftk binary not found on PATH.  Install via "brew install pdftk-java" (macOS) or "apt install pdftk" (Debian/Ubuntu).');
		}

		const tmpArgs = [pTemplatePDFPath, 'fill_form', pXFDFPath, 'output', pOutputPDFPath];
		const tmpResult = libChildProcess.spawnSync(tmpBinary, tmpArgs, { encoding: 'utf8' });
		if (tmpResult.error)
		{
			throw new Error(`Failed to spawn pdftk: ${tmpResult.error.message}`);
		}
		if (tmpResult.status !== 0)
		{
			const tmpStderr = (tmpResult.stderr || '').trim();
			throw new Error(`pdftk exited with status ${tmpResult.status}: ${tmpStderr}`);
		}
		return true;
	}

	/**
	 * End-to-end fill: build XFDF, write it to a temp file, run pdftk,
	 * clean up.
	 *
	 * @param {object} pMappingManyfest - Live Manyfest instance
	 * @param {object} pSourceData - The platform JSON payload
	 * @param {string} pTemplatePDFPath
	 * @param {string} pOutputPDFPath
	 * @param {object} pReport - ConversionReport to annotate
	 * @param {object} pConversionReportService
	 * @returns {object} the (same) report, with stats finalized
	 */
	fillPDF(pMappingManyfest, pSourceData, pTemplatePDFPath, pOutputPDFPath, pReport, pConversionReportService)
	{
		if (!libFS.existsSync(pTemplatePDFPath))
		{
			pConversionReportService.logError(pReport, null, null, `Template PDF does not exist: ${pTemplatePDFPath}`);
			pConversionReportService.finalize(pReport);
			throw new Error(`Template PDF does not exist: ${pTemplatePDFPath}`);
		}

		const tmpBuild = this.buildXFDF(pMappingManyfest, pSourceData, pReport, pConversionReportService);

		const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-'));
		const tmpXFDFPath = libPath.join(tmpTempDir, 'fill.xfdf');
		try
		{
			libFS.writeFileSync(tmpXFDFPath, tmpBuild.xfdf, 'utf8');
			this.runPDFTK(pTemplatePDFPath, tmpXFDFPath, pOutputPDFPath);
		}
		catch (pError)
		{
			pConversionReportService.logError(pReport, null, null, `PDF fill failed: ${pError.message}`);
			pConversionReportService.finalize(pReport);
			// Cleanup best-effort
			try { libFS.unlinkSync(tmpXFDFPath); } catch (pCleanupError) { /* ignore */ }
			try { libFS.rmdirSync(tmpTempDir); } catch (pCleanupError) { /* ignore */ }
			throw pError;
		}

		try { libFS.unlinkSync(tmpXFDFPath); } catch (pCleanupError) { /* ignore */ }
		try { libFS.rmdirSync(tmpTempDir); } catch (pCleanupError) { /* ignore */ }

		pConversionReportService.finalize(pReport);
		return pReport;
	}

	/**
	 * Join a source root address with a relative descriptor address.
	 * Shared implementation with MappingManyfestBuilder.joinAddress().
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
		return `${pSourceRoot}.${pRelativeAddress}`;
	}
}

module.exports = PDFFormFiller;
