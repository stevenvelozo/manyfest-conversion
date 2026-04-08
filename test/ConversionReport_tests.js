const Chai = require('chai');
const Expect = Chai.expect;

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
				Expect(tmpReport.SourceFile).to.equal('source.json');
				Expect(tmpReport.TargetFile).to.equal('target.pdf');
				Expect(tmpReport.Successes).to.deep.equal([]);
				Expect(tmpReport.Warnings).to.deep.equal([]);
				Expect(tmpReport.Errors).to.deep.equal([]);
				Expect(tmpReport.Stats.SuccessCount).to.equal(0);
				Expect(tmpReport.Stats.WarningCount).to.equal(0);
				Expect(tmpReport.Stats.ErrorCount).to.equal(0);
				Expect(tmpReport.Stats.TotalFields).to.equal(0);
				Expect(tmpReport.Timestamp).to.be.a('string');
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

				Expect(tmpReport.Stats.SuccessCount).to.equal(2);
				Expect(tmpReport.Stats.WarningCount).to.equal(1);
				Expect(tmpReport.Stats.ErrorCount).to.equal(1);
				Expect(tmpReport.Stats.TotalFields).to.equal(4);
				Expect(tmpReport.Successes[0]).to.deep.equal({ FieldName: 'fieldA', SourceAddress: 'H.A', Value: 'v1' });
				Expect(tmpReport.Warnings[0].Message).to.equal('missing');
				Expect(tmpReport.Errors[0].Message).to.equal('fail');
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
				Expect(tmpReport.MappingManyfestScope).to.equal('MI-CAG-Walbec::1859 - Coarse Agg Gravity.pdf');
				Expect(tmpReport.SourceDocumentType).to.equal('MI-CAG-Walbec');
			});
	}
);
