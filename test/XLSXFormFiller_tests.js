const Chai = require('chai');
const Expect = Chai.expect;

const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');
const libXLSX = require('xlsx');

const libPict = require('pict');
const libXLSXFormFiller = require('../source/services/Service-XLSXFormFiller.js');
const libConversionReport = require('../source/services/Service-ConversionReport.js');
const libMappingManyfestBuilder = require('../source/services/Service-MappingManyfestBuilder.js');

const CSV_PATH = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '111-Mappings', 'Walbec-MDOT-Mappings.csv');
const TEMPLATE_HMA = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '000-Originals', 'HMA - Data Sheet - MI.xlsx');
const SOURCE_HMA_JSON = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '222-DocumentSourceData', 'HMA-DataSheet-Filled-IDProject-30861-IDDocument-2591191.json');

suite
(
	'XLSXFormFiller: cell reference parsing',
	() =>
	{
		const buildEnv = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('XLSXFormFiller', libXLSXFormFiller);
			return tmpFable.instantiateServiceProvider('XLSXFormFiller');
		};

		test('parseCellReference handles quoted sheet names',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseCellReference("'FIELD DATA SHEET'!E5");
				Expect(tmpParsed.sheetName).to.equal('FIELD DATA SHEET');
				Expect(tmpParsed.cellAddress).to.equal('E5');
			});

		test('parseCellReference handles unquoted sheet names with spaces',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseCellReference('FIELD DATA SHEET!E5');
				Expect(tmpParsed.sheetName).to.equal('FIELD DATA SHEET');
				Expect(tmpParsed.cellAddress).to.equal('E5');
			});

		test('parseCellReference handles simple sheet names',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseCellReference('Sheet1!A1');
				Expect(tmpParsed.sheetName).to.equal('Sheet1');
				Expect(tmpParsed.cellAddress).to.equal('A1');
			});

		test('parseCellReference handles bare cell addresses',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseCellReference('E5');
				Expect(tmpParsed.sheetName).to.equal(null);
				Expect(tmpParsed.cellAddress).to.equal('E5');
			});
	}
);

suite
(
	'XLSXFormFiller: end-to-end HMA data sheet fill',
	() =>
	{
		let _skip = false;

		suiteSetup(function()
		{
			if (!libFS.existsSync(CSV_PATH) || !libFS.existsSync(TEMPLATE_HMA) || !libFS.existsSync(SOURCE_HMA_JSON))
			{
				_skip = true;
				this.skip();
			}
		});

		test('fills HMA workbook from the real source JSON and writes a valid output file',
			function()
			{
				if (_skip)
				{
					this.skip();
					return;
				}

				const tmpFable = new libPict();
				tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
				tmpFable.addServiceType('XLSXFormFiller', libXLSXFormFiller);
				tmpFable.addServiceType('ConversionReport', libConversionReport);
				tmpFable.instantiateServiceProvider('CSVParser');

				const tmpBuilder = tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
				const tmpFiller = tmpFable.instantiateServiceProvider('XLSXFormFiller');
				const tmpReporter = tmpFable.instantiateServiceProvider('ConversionReport');

				const tmpResult = tmpBuilder.buildFromCSVFileSync(CSV_PATH);

				// Locate the HMA XLSX mapping (filename in CSV has typo ".xslx").
				const tmpHMAKey = Object.keys(tmpResult.MappingConfigs).find(
					(pKey) => pKey.toLowerCase().endsWith('.xslx') || pKey.toLowerCase().endsWith('.xlsx'));
				Expect(tmpHMAKey, 'hma mapping key').to.be.a('string');

				const tmpManyfests = tmpBuilder.instantiateManyfests(tmpResult.MappingConfigs);
				const tmpManyfestHMA = tmpManyfests[tmpHMAKey];
				Expect(tmpManyfestHMA).to.be.an('object');

				const tmpSourceData = JSON.parse(libFS.readFileSync(SOURCE_HMA_JSON, 'utf8'));
				const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-xlsx-test-'));
				const tmpOutputPath = libPath.join(tmpTempDir, 'filled-hma.xlsx');
				const tmpReport = tmpReporter.newReport(SOURCE_HMA_JSON, tmpHMAKey, tmpManyfestHMA);

				try
				{
					tmpFiller.fillXLSX(tmpManyfestHMA, tmpSourceData, TEMPLATE_HMA, tmpOutputPath, tmpReport, tmpReporter);

					Expect(libFS.existsSync(tmpOutputPath)).to.equal(true);
					const tmpReadBack = libXLSX.readFile(tmpOutputPath);
					Expect(tmpReadBack.SheetNames.length).to.be.greaterThan(0);

					// Stats should add up to the total descriptor count on the HMA mapping.
					const tmpDescriptorCount = Object.keys(tmpResult.MappingConfigs[tmpHMAKey].Descriptors).length;
					Expect(tmpReport.Stats.TotalFields).to.equal(tmpDescriptorCount);
				}
				finally
				{
					try { libFS.unlinkSync(tmpOutputPath); } catch (pError) { /* ignore */ }
					try { libFS.rmdirSync(tmpTempDir); } catch (pError) { /* ignore */ }
				}
			});
	}
);
