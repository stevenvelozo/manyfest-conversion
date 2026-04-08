const libFableServiceProviderBase = require('fable-serviceproviderbase');

/**
* ConversionReport
*
* Tracks per-fill outcomes (successes, warnings, errors) during a single
* PDF or XLSX conversion.  A "report" is a plain object so it is trivially
* serializable as a sidecar JSON next to the filled artifact.
*/
class ConversionReport extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'ConversionReport';
	}

	/**
	 * Build a fresh report skeleton.
	 *
	 * @param {string} pSourceFile - Path or identifier of the source JSON payload
	 * @param {string} pTargetFile - Filename of the target form being filled
	 * @param {object} [pMappingManyfest] - The mapping manyfest being applied (for scope metadata)
	 * @returns {object}
	 */
	newReport(pSourceFile, pTargetFile, pMappingManyfest)
	{
		let tmpScope = null;
		let tmpDocumentType = null;
		if (pMappingManyfest && typeof(pMappingManyfest) === 'object')
		{
			tmpScope = pMappingManyfest.scope || null;
			if (pMappingManyfest.manifest && typeof(pMappingManyfest.manifest) === 'object')
			{
				tmpDocumentType = pMappingManyfest.manifest.SourceDocumentType || null;
			}
		}

		const tmpReport = (
			{
				SourceFile: pSourceFile || null,
				SourceDocumentType: tmpDocumentType,
				TargetFile: pTargetFile || null,
				MappingManyfestScope: tmpScope,
				Timestamp: new Date().toISOString(),
				Successes: [],
				Warnings: [],
				Errors: [],
				Stats:
					{
						TotalFields: 0,
						SuccessCount: 0,
						WarningCount: 0,
						ErrorCount: 0
					}
			});
		return tmpReport;
	}

	/**
	 * Record a successful field write.
	 */
	logSuccess(pReport, pFieldName, pSourceAddress, pValue)
	{
		if (!pReport)
		{
			return false;
		}
		pReport.Successes.push(
			{
				FieldName: pFieldName,
				SourceAddress: pSourceAddress,
				Value: (typeof(pValue) === 'undefined') ? null : pValue
			});
		return true;
	}

	/**
	 * Record a non-fatal warning (e.g. missing value, skipped checkbox).
	 */
	logWarning(pReport, pFieldName, pSourceAddress, pMessage)
	{
		if (!pReport)
		{
			return false;
		}
		pReport.Warnings.push(
			{
				FieldName: pFieldName,
				SourceAddress: pSourceAddress,
				Message: pMessage
			});
		return true;
	}

	/**
	 * Record a hard error (e.g. field resolution failure, target field missing).
	 */
	logError(pReport, pFieldName, pSourceAddress, pMessage)
	{
		if (!pReport)
		{
			return false;
		}
		pReport.Errors.push(
			{
				FieldName: pFieldName,
				SourceAddress: pSourceAddress,
				Message: pMessage
			});
		return true;
	}

	/**
	 * Recompute the Stats block.  Call before writing the sidecar.
	 */
	finalize(pReport)
	{
		if (!pReport)
		{
			return false;
		}
		pReport.Stats.SuccessCount = pReport.Successes.length;
		pReport.Stats.WarningCount = pReport.Warnings.length;
		pReport.Stats.ErrorCount = pReport.Errors.length;
		pReport.Stats.TotalFields = pReport.Stats.SuccessCount + pReport.Stats.WarningCount + pReport.Stats.ErrorCount;
		return pReport;
	}

	/**
	 * Write the report to disk as a sidecar JSON.  Requires FilePersistence
	 * to be available on the fable instance.
	 */
	writeSidecar(pReport, pSidecarPath)
	{
		if (!pReport || !pSidecarPath)
		{
			return false;
		}
		this.finalize(pReport);
		if (this.fable && this.fable.FilePersistence && typeof(this.fable.FilePersistence.writeFileSyncFromObject) === 'function')
		{
			this.fable.FilePersistence.writeFileSyncFromObject(pSidecarPath, pReport);
			return true;
		}
		// Fallback to raw fs
		const libFS = require('fs');
		libFS.writeFileSync(pSidecarPath, JSON.stringify(pReport, null, 4));
		return true;
	}
}

module.exports = ConversionReport;
