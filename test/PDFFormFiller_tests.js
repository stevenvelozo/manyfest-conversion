const Chai = require('chai');
const Expect = Chai.expect;

const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');
const libChildProcess = require('child_process');

const libPict = require('pict');
const libManyfest = require('manyfest');
const libPDFFormFiller = require('../source/services/Service-PDFFormFiller.js');
const libConversionReport = require('../source/services/Service-ConversionReport.js');
const libMappingManyfestBuilder = require('../source/services/Service-MappingManyfestBuilder.js');

const CSV_PATH = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '111-Mappings', 'Walbec-MDOT-Mappings.csv');
const TEMPLATE_1859 = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '000-Originals', '1859 - Coarse Agg Gravity.pdf');
const SOURCE_CAG_JSON = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '222-DocumentSourceData', 'MI-CAG-IDDocument-2491844.json');

const pdftkAvailable = () =>
{
	try
	{
		const tmpResult = libChildProcess.spawnSync('which', ['pdftk'], { encoding: 'utf8' });
		if (tmpResult.status === 0 && tmpResult.stdout && tmpResult.stdout.trim())
		{
			return true;
		}
		const tmpResult2 = libChildProcess.spawnSync('which', ['pdftk-java'], { encoding: 'utf8' });
		return tmpResult2.status === 0 && tmpResult2.stdout && tmpResult2.stdout.trim();
	}
	catch (pError)
	{
		return false;
	}
};

suite
(
	'PDFFormFiller: XFDF generation (pure, no pdftk required)',
	() =>
	{
		const buildEnv = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('PDFFormFiller', libPDFFormFiller);
			tmpFable.addServiceType('ConversionReport', libConversionReport);
			return (
				{
					fable: tmpFable,
					filler: tmpFable.instantiateServiceProvider('PDFFormFiller'),
					reporter: tmpFable.instantiateServiceProvider('ConversionReport')
				});
		};

		const smallManyfest = () =>
		{
			const tmpManyfest = new libManyfest();
			tmpManyfest.loadManifest(
				{
					Scope: 'test',
					Descriptors:
						{
							'H.Name': { TargetFieldName: 'Text1', TargetFieldType: 'Text' },
							'H.Note': { TargetFieldName: 'Text2', TargetFieldType: 'Text' },
							'H.Skip': { TargetFieldName: 'Check Box3', TargetFieldType: 'Button' }
						}
				});
			tmpManyfest.manifest = tmpManyfest.manifest || {};
			tmpManyfest.manifest.SourceRootAddress = 'ReportData.FormData';
			return tmpManyfest;
		};

		test('escapeXML encodes all XML special characters',
			() =>
			{
				const tmp = buildEnv();
				Expect(tmp.filler.escapeXML('a & b')).to.equal('a &amp; b');
				Expect(tmp.filler.escapeXML('<tag>')).to.equal('&lt;tag&gt;');
				Expect(tmp.filler.escapeXML(`quotes: " '`)).to.equal('quotes: &quot; &apos;');
				Expect(tmp.filler.escapeXML(null)).to.equal('');
				Expect(tmp.filler.escapeXML(undefined)).to.equal('');
			});

		test('buildXFDF emits Text fields, skips Button fields with a warning, and warns on missing values',
			() =>
			{
				const tmp = buildEnv();
				const tmpManyfest = smallManyfest();
				const tmpSource = { ReportData: { FormData: { H: { Name: 'Alice & Bob', Note: '<important>' } } } };
				const tmpReport = tmp.reporter.newReport('src', 'tgt');

				const tmpBuild = tmp.filler.buildXFDF(tmpManyfest, tmpSource, tmpReport, tmp.reporter);

				Expect(tmpBuild.xfdf).to.be.a('string');
				Expect(tmpBuild.fieldCount).to.equal(2);

				Expect(tmpBuild.xfdf).to.include('<field name="Text1"><value>Alice &amp; Bob</value></field>');
				Expect(tmpBuild.xfdf).to.include('<field name="Text2"><value>&lt;important&gt;</value></field>');
				Expect(tmpBuild.xfdf).to.not.include('Check Box3');

				tmp.reporter.finalize(tmpReport);
				Expect(tmpReport.Stats.SuccessCount).to.equal(2);
				Expect(tmpReport.Stats.WarningCount).to.equal(1);
				Expect(tmpReport.Warnings[0].FieldName).to.equal('Check Box3');
				Expect(tmpReport.Stats.ErrorCount).to.equal(0);
			});

		test('buildXFDF emits warning when a source value is missing',
			() =>
			{
				const tmp = buildEnv();
				const tmpManyfest = smallManyfest();
				const tmpSource = { ReportData: { FormData: { H: { Name: 'only name' } } } };
				const tmpReport = tmp.reporter.newReport('src', 'tgt');

				tmp.filler.buildXFDF(tmpManyfest, tmpSource, tmpReport, tmp.reporter);
				tmp.reporter.finalize(tmpReport);

				Expect(tmpReport.Stats.SuccessCount).to.equal(1);
				// Missing note + skipped checkbox = 2 warnings.
				Expect(tmpReport.Stats.WarningCount).to.equal(2);
			});
	}
);

suite
(
	'PDFFormFiller: end-to-end pdftk fill (skipped if pdftk missing)',
	() =>
	{
		let _skip = false;

		suiteSetup(function()
		{
			if (!pdftkAvailable() || !libFS.existsSync(CSV_PATH) || !libFS.existsSync(TEMPLATE_1859) || !libFS.existsSync(SOURCE_CAG_JSON))
			{
				_skip = true;
				this.skip();
			}
		});

		test('fills 1859 - Coarse Agg Gravity.pdf and A4 contains "100.0" on dump_data_fields',
			function()
			{
				if (_skip)
				{
					this.skip();
					return;
				}

				const tmpFable = new libPict();
				tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
				tmpFable.addServiceType('PDFFormFiller', libPDFFormFiller);
				tmpFable.addServiceType('ConversionReport', libConversionReport);
				tmpFable.instantiateServiceProvider('CSVParser');

				const tmpBuilder = tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
				const tmpFiller = tmpFable.instantiateServiceProvider('PDFFormFiller');
				const tmpReporter = tmpFable.instantiateServiceProvider('ConversionReport');

				const tmpResult = tmpBuilder.buildFromCSVFileSync(CSV_PATH);
				const tmpManyfests = tmpBuilder.instantiateManyfests(tmpResult.MappingConfigs);
				const tmpManyfest1859 = tmpManyfests['1859 - Coarse Agg Gravity.pdf'];

				const tmpSourceData = JSON.parse(libFS.readFileSync(SOURCE_CAG_JSON, 'utf8'));
				const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-pdf-test-'));
				const tmpOutputPath = libPath.join(tmpTempDir, 'filled-1859.pdf');
				const tmpReport = tmpReporter.newReport(SOURCE_CAG_JSON, '1859 - Coarse Agg Gravity.pdf', tmpManyfest1859);

				try
				{
					tmpFiller.fillPDF(tmpManyfest1859, tmpSourceData, TEMPLATE_1859, tmpOutputPath, tmpReport, tmpReporter);
					Expect(libFS.existsSync(tmpOutputPath)).to.equal(true);

					// Read back fields via pdftk dump_data_fields to assert A4 = "100.0".
					const tmpDump = libChildProcess.spawnSync('pdftk', [tmpOutputPath, 'dump_data_fields'], { encoding: 'utf8' });
					Expect(tmpDump.status, 'pdftk dump_data_fields exit').to.equal(0);
					// Find the block for FieldName: A4.  pdftk output format:
					//   FieldName: A4
					//   FieldValue: 100.0
					const tmpBlocks = tmpDump.stdout.split('---');
					let tmpFoundValue = null;
					for (const tmpBlock of tmpBlocks)
					{
						if (/FieldName:\s*A4\s*$/m.test(tmpBlock))
						{
							const tmpMatch = tmpBlock.match(/FieldValue:\s*(.*)/);
							if (tmpMatch)
							{
								tmpFoundValue = tmpMatch[1].trim();
							}
							break;
						}
					}
					Expect(tmpFoundValue).to.equal('100.0');
				}
				finally
				{
					try { libFS.unlinkSync(tmpOutputPath); } catch (pError) { /* ignore */ }
					try { libFS.rmdirSync(tmpTempDir); } catch (pError) { /* ignore */ }
				}
			});
	}
);
