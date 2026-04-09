const libAssert = require('node:assert/strict');

const libPict = require('pict');
const libConversionReport = require('../source/services/Service-ConversionReport.js');

suite
(
	'ConversionReport: report bookkeeping',
	() =>
	{
		const buildService = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('ConversionReport', libConversionReport);
			return tmpFable.instantiateServiceProvider('ConversionReport');
		};

		test('newReport emits empty arrays and zero stats',
			() =>
			{
				const tmpSvc = buildService();
				const tmpReport = tmpSvc.newReport('source.json', 'target.pdf');
				libAssert.equal(tmpReport.SourceFile, 'source.json');
				libAssert.equal(tmpReport.TargetFile, 'target.pdf');
				libAssert.deepEqual(tmpReport.Successes, []);
				libAssert.deepEqual(tmpReport.Warnings, []);
				libAssert.deepEqual(tmpReport.Errors, []);
				libAssert.equal(tmpReport.Stats.SuccessCount, 0);
				libAssert.equal(tmpReport.Stats.WarningCount, 0);
				libAssert.equal(tmpReport.Stats.ErrorCount, 0);
				libAssert.equal(tmpReport.Stats.TotalFields, 0);
				libAssert.equal(typeof tmpReport.Timestamp, 'string');
			});

		test('log methods append and finalize recomputes stats',
			() =>
			{
				const tmpSvc = buildService();
				const tmpReport = tmpSvc.newReport('s', 't');

				tmpSvc.logSuccess(tmpReport, 'fieldA', 'H.A', 'v1');
				tmpSvc.logSuccess(tmpReport, 'fieldB', 'H.B', 'v2');
				tmpSvc.logWarning(tmpReport, 'fieldC', 'H.C', 'missing');
				tmpSvc.logError(tmpReport, 'fieldD', 'H.D', 'fail');

				tmpSvc.finalize(tmpReport);

				libAssert.equal(tmpReport.Stats.SuccessCount, 2);
				libAssert.equal(tmpReport.Stats.WarningCount, 1);
				libAssert.equal(tmpReport.Stats.ErrorCount, 1);
				libAssert.equal(tmpReport.Stats.TotalFields, 4);
				libAssert.deepEqual(tmpReport.Successes[0], { FieldName: 'fieldA', SourceAddress: 'H.A', Value: 'v1' });
				libAssert.equal(tmpReport.Warnings[0].Message, 'missing');
				libAssert.equal(tmpReport.Errors[0].Message, 'fail');
			});

		test('newReport carries scope from mapping manyfest if supplied',
			() =>
			{
				const tmpSvc = buildService();
				const tmpFakeManyfest = (
					{
						scope: 'MI-CAG-Walbec::1859 - Coarse Agg Gravity.pdf',
						manifest: { SourceDocumentType: 'MI-CAG-Walbec' }
					});
				const tmpReport = tmpSvc.newReport('s.json', 't.pdf', tmpFakeManyfest);
				libAssert.equal(tmpReport.MappingManyfestScope, 'MI-CAG-Walbec::1859 - Coarse Agg Gravity.pdf');
				libAssert.equal(tmpReport.SourceDocumentType, 'MI-CAG-Walbec');
			});
	}
);
