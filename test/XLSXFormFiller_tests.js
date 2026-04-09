const libAssert = require('node:assert/strict');

const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');
const libExcelJS = require('exceljs');

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

		test('parseTargetCellSpec handles quoted sheet names',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseTargetCellSpec("'FIELD DATA SHEET'!E5");
				libAssert.equal(tmpParsed.sheetName, 'FIELD DATA SHEET');
				libAssert.deepEqual(tmpParsed.cellAddresses, ['E5']);
			});

		test('parseTargetCellSpec handles trailing-only single quote (sample CSV style)',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseTargetCellSpec("FIELD DATA SHEET'!E5");
				libAssert.equal(tmpParsed.sheetName, 'FIELD DATA SHEET');
				libAssert.deepEqual(tmpParsed.cellAddresses, ['E5']);
			});

		test('parseTargetCellSpec handles unquoted sheet names with spaces',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseTargetCellSpec('FIELD DATA SHEET!E5');
				libAssert.equal(tmpParsed.sheetName, 'FIELD DATA SHEET');
				libAssert.deepEqual(tmpParsed.cellAddresses, ['E5']);
			});

		test('parseTargetCellSpec handles bare cell addresses',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseTargetCellSpec('E5');
				libAssert.equal(tmpParsed.sheetName, null);
				libAssert.deepEqual(tmpParsed.cellAddresses, ['E5']);
			});

		test('expandCellRange handles single cells',
			() =>
			{
				const tmpSvc = buildEnv();
				libAssert.deepEqual(tmpSvc.expandCellRange('E5'), ['E5']);
			});

		test('expandCellRange handles hyphen shorthand (sample CSV style)',
			() =>
			{
				const tmpSvc = buildEnv();
				libAssert.deepEqual(tmpSvc.expandCellRange('O14-25'), [
					'O14', 'O15', 'O16', 'O17', 'O18', 'O19', 'O20', 'O21', 'O22', 'O23', 'O24', 'O25'
				]);
				libAssert.equal(tmpSvc.expandCellRange('M14-26').length, 13);
			});

		test('expandCellRange handles single-column colon ranges',
			() =>
			{
				const tmpSvc = buildEnv();
				libAssert.deepEqual(tmpSvc.expandCellRange('B2:B5'), ['B2', 'B3', 'B4', 'B5']);
			});

		test('expandCellRange handles rectangular colon ranges (row-major)',
			() =>
			{
				const tmpSvc = buildEnv();
				libAssert.deepEqual(tmpSvc.expandCellRange('A1:C2'), ['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
			});

		test('parseTargetCellSpec recognizes the hyphen-range form on the qualified path',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpParsed = tmpSvc.parseTargetCellSpec("'FIELD DATA SHEET'!O14-25");
				libAssert.equal(tmpParsed.sheetName, 'FIELD DATA SHEET');
				libAssert.equal(tmpParsed.cellAddresses.length, 12);
				libAssert.equal(tmpParsed.cellAddresses[0], 'O14');
				libAssert.equal(tmpParsed.cellAddresses[11], 'O25');
			});

		test('columnLettersToNumber and columnNumberToLetters round-trip',
			() =>
			{
				const tmpSvc = buildEnv();
				libAssert.equal(tmpSvc.columnLettersToNumber('A'), 1);
				libAssert.equal(tmpSvc.columnLettersToNumber('Z'), 26);
				libAssert.equal(tmpSvc.columnLettersToNumber('AA'), 27);
				libAssert.equal(tmpSvc.columnNumberToLetters(1), 'A');
				libAssert.equal(tmpSvc.columnNumberToLetters(26), 'Z');
				libAssert.equal(tmpSvc.columnNumberToLetters(27), 'AA');
			});
	}
);

suite
(
	'XLSXFormFiller: source array-broadcast resolution',
	() =>
	{
		const libManyfest = require('manyfest');
		const buildEnv = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('XLSXFormFiller', libXLSXFormFiller);
			return tmpFable.instantiateServiceProvider('XLSXFormFiller');
		};
		const buildManyfest = () =>
		{
			const tmpManyfest = new libManyfest();
			tmpManyfest.loadManifest({ Scope: 'test', Descriptors: {} });
			return tmpManyfest;
		};

		test('resolveSourceValue returns scalar for non-array addresses',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpManyfest = buildManyfest();
				const tmpData = { H: { JobNo: '12345' } };
				const tmpResult = tmpSvc.resolveSourceValue(tmpManyfest, tmpData, 'H.JobNo');
				libAssert.equal(tmpResult.kind, 'scalar');
				libAssert.equal(tmpResult.value, '12345');
			});

		test('resolveSourceValue expands ExtractionGradationTable[].JMF to all element values',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpManyfest = buildManyfest();
				const tmpData = (
					{
						ExtractionGradationTable:
						[
							{ JMF: '100.0' },
							{ JMF: '95.5' },
							{ JMF: '80.2' }
						]
					});
				const tmpResult = tmpSvc.resolveSourceValue(tmpManyfest, tmpData, 'ExtractionGradationTable[].JMF');
				libAssert.equal(tmpResult.kind, 'array');
				libAssert.equal(tmpResult.values.length, 3);
				libAssert.deepEqual(tmpResult.values[0], { ok: true, value: '100.0' });
				libAssert.deepEqual(tmpResult.values[2], { ok: true, value: '80.2' });
			});

		test('resolveSourceValue surfaces missing values inside the array',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpManyfest = buildManyfest();
				const tmpData = (
					{
						T: [ { v: '1' }, { v: null }, { v: '3' } ]
					});
				const tmpResult = tmpSvc.resolveSourceValue(tmpManyfest, tmpData, 'T[].v');
				libAssert.equal(tmpResult.kind, 'array');
				libAssert.equal(tmpResult.values[0].ok, true);
				libAssert.equal(tmpResult.values[1].ok, false);
				libAssert.equal(tmpResult.values[2].ok, true);
			});

		test('resolveSourceValue returns missing for unresolvable scalar address',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpManyfest = buildManyfest();
				const tmpResult = tmpSvc.resolveSourceValue(tmpManyfest, {}, 'H.NotThere');
				libAssert.equal(tmpResult.kind, 'missing');
			});

		test('resolveSourceValue errors when array prefix is not actually an array',
			() =>
			{
				const tmpSvc = buildEnv();
				const tmpManyfest = buildManyfest();
				const tmpData = { Foo: { Bar: 'oops' } };
				const tmpResult = tmpSvc.resolveSourceValue(tmpManyfest, tmpData, 'Foo[].Bar');
				libAssert.equal(tmpResult.kind, 'error');
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

		test('fills HMA workbook including array-broadcast ranges, preserves sheet structure',
			async function()
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
				libAssert.equal(typeof tmpHMAKey, 'string');

				const tmpManyfests = tmpBuilder.instantiateManyfests(tmpResult.MappingConfigs);
				const tmpManyfestHMA = tmpManyfests[tmpHMAKey];

				const tmpSourceData = JSON.parse(libFS.readFileSync(SOURCE_HMA_JSON, 'utf8'));
				const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-xlsx-test-'));
				const tmpOutputPath = libPath.join(tmpTempDir, 'filled-hma.xlsx');
				const tmpReport = tmpReporter.newReport(SOURCE_HMA_JSON, tmpHMAKey, tmpManyfestHMA);

				try
				{
					await tmpFiller.fillXLSX(tmpManyfestHMA, tmpSourceData, TEMPLATE_HMA, tmpOutputPath, tmpReport, tmpReporter);

					libAssert.equal(libFS.existsSync(tmpOutputPath), true);

					// Re-read with exceljs and assert that array-broadcast ranges
					// were populated and that scalar fills landed too.
					const tmpReadBack = new libExcelJS.Workbook();
					await tmpReadBack.xlsx.readFile(tmpOutputPath);
					const tmpSheet = tmpReadBack.getWorksheet('FIELD DATA SHEET');
					libAssert.notEqual(tmpSheet, undefined);

					// Scalar fill: H.JobNo -> E5
					libAssert.equal(String(tmpSheet.getCell('E5').value), '408377');
					// Scalar fill: H.JobName -> D6
					libAssert.equal(String(tmpSheet.getCell('D6').value), 'M-35 From Lake Shore Drive to US-2');

					// Array-broadcast fill: ExtractionGradationTable[].JMF -> O14..O25 (12 cells)
					libAssert.equal(String(tmpSheet.getCell('O14').value), '100.0');
					libAssert.equal(String(tmpSheet.getCell('O25').value), '5.80');

					// Stats: 13-element source array against 12-cell range produces
					// 12 successes + 1 truncation warning per such row.  At least
					// the previous "object/array" errors should be gone.
					const tmpRangeErrors = (tmpReport.Errors || []).filter(
						(e) => e.Message && e.Message.includes('object/array'));
					libAssert.equal(tmpRangeErrors.length, 0);
				}
				finally
				{
					try { libFS.unlinkSync(tmpOutputPath); } catch (pError) { /* ignore */ }
					try { libFS.rmdirSync(tmpTempDir); } catch (pError) { /* ignore */ }
				}
			});
	}
);
