const libAssert = require('node:assert/strict');

const libFS = require('fs');
const libPath = require('path');

const libPict = require('pict');
const libMappingManyfestBuilder = require('../source/services/Service-MappingManyfestBuilder.js');

const CSV_PATH = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '111-Mappings', 'Walbec-MDOT-Mappings.csv');
const SOURCE_CAG_JSON = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '222-DocumentSourceData', 'MI-CAG-IDDocument-2491844.json');

suite
(
	'MappingManyfestBuilder: CSV ingestion',
	() =>
	{
		const buildService = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
			tmpFable.instantiateServiceProvider('CSVParser');
			return tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
		};

		test('normalizeSourceAddress inserts a dot after ] when followed by a letter',
			() =>
			{
				const tmpSvc = buildService();
				libAssert.equal(tmpSvc.normalizeSourceAddress('CAGTable[0]CAGB'), 'CAGTable[0].CAGB');
				libAssert.equal(tmpSvc.normalizeSourceAddress('CAGTable[0].CAGB'), 'CAGTable[0].CAGB');
				libAssert.equal(tmpSvc.normalizeSourceAddress('H.CtrlSecID'), 'H.CtrlSecID');
				libAssert.equal(tmpSvc.normalizeSourceAddress('Dogs[`key`].Value'), 'Dogs[`key`].Value');
			});

		test('classifyTargetFileType tolerates the .xslx typo',
			() =>
			{
				const tmpSvc = buildService();
				libAssert.equal(tmpSvc.classifyTargetFileType('foo.pdf'), 'PDF');
				libAssert.equal(tmpSvc.classifyTargetFileType('foo.PDF'), 'PDF');
				libAssert.equal(tmpSvc.classifyTargetFileType('foo.xlsx'), 'XLSX');
				libAssert.equal(tmpSvc.classifyTargetFileType('HMA - Data Sheet - MI.xslx'), 'XLSX');
				libAssert.equal(tmpSvc.classifyTargetFileType('foo.txt'), 'Unknown');
			});

		test('buildFromCSVFileSync produces one config per target form',
			function()
			{
				if (!libFS.existsSync(CSV_PATH))
				{
					this.skip();
					return;
				}
				const tmpSvc = buildService();
				const tmpResult = tmpSvc.buildFromCSVFileSync(CSV_PATH);

				libAssert.equal(typeof tmpResult, 'object');
				libAssert.equal(typeof tmpResult.MappingConfigs, 'object');
				libAssert.equal(typeof tmpResult.BuildReport, 'object');

				const tmpKeys = Object.keys(tmpResult.MappingConfigs);
				// 14 distinct target forms per exploration: 13 PDFs + 1 XLSX.
				libAssert.equal(tmpKeys.length, 14);

				// Spot-check a well-known entry.
				const tmp1859 = tmpResult.MappingConfigs['1859 - Coarse Agg Gravity.pdf'];
				libAssert.equal(typeof tmp1859, 'object');
				libAssert.equal(tmp1859.TargetFileType, 'PDF');
				libAssert.equal(tmp1859.SourceDocumentType, 'MI-CAG-Walbec');
				libAssert.equal(tmp1859.SourceRootAddress, 'ReportData.FormData');

				const tmpDescriptor = tmp1859.Descriptors['CAGTable[0].CAGB'];
				libAssert.equal(typeof tmpDescriptor, 'object');
				libAssert.equal(tmpDescriptor.TargetFieldName, 'A4');
				libAssert.equal(tmpDescriptor.TargetFieldType, 'Text');
				libAssert.equal(tmpDescriptor.SourceAddressRaw, 'CAGTable[0]CAGB');

				// XLSX entry tolerates the typo in the CSV filename (".xslx").
				const tmpXlsxKey = Object.keys(tmpResult.MappingConfigs).find(
					(pKey) => pKey.toLowerCase().endsWith('.xslx') || pKey.toLowerCase().endsWith('.xlsx'));
				libAssert.equal(typeof tmpXlsxKey, 'string');
				libAssert.equal(tmpResult.MappingConfigs[tmpXlsxKey].TargetFileType, 'XLSX');
			});

		test('end-to-end value trace: built manyfest reads CAGTable[0].CAGB from the real source JSON',
			function()
			{
				if (!libFS.existsSync(CSV_PATH) || !libFS.existsSync(SOURCE_CAG_JSON))
				{
					this.skip();
					return;
				}
				const tmpSvc = buildService();
				const tmpResult = tmpSvc.buildFromCSVFileSync(CSV_PATH);
				const tmpManyfests = tmpSvc.instantiateManyfests(tmpResult.MappingConfigs);
				const tmpManyfest1859 = tmpManyfests['1859 - Coarse Agg Gravity.pdf'];
				libAssert.equal(typeof tmpManyfest1859, 'object');

				const tmpSourceData = JSON.parse(libFS.readFileSync(SOURCE_CAG_JSON, 'utf8'));
				const tmpFullAddress = tmpSvc.joinAddress(tmpManyfest1859.manifest.SourceRootAddress, 'CAGTable[0].CAGB');
				const tmpValue = tmpManyfest1859.getValueAtAddress(tmpSourceData, tmpFullAddress);
				libAssert.equal(tmpValue, '100.0');
			});

		test('writeManyfestsToDirectory and loadMappingManyfestFromFile round-trip',
			function()
			{
				if (!libFS.existsSync(CSV_PATH))
				{
					this.skip();
					return;
				}
				const tmpSvc = buildService();
				const tmpResult = tmpSvc.buildFromCSVFileSync(CSV_PATH);
				const tmpTempDir = libFS.mkdtempSync(libPath.join(require('os').tmpdir(), 'mfconv-test-'));
				try
				{
					const tmpPaths = tmpSvc.writeManyfestsToDirectory(tmpResult.MappingConfigs, tmpTempDir);
					libAssert.equal(tmpPaths.length, 14);

					const tmp1859Path = tmpPaths.find((pPath) => pPath.includes('1859'));
					libAssert.equal(typeof tmp1859Path, 'string');

					const tmpLoaded = tmpSvc.loadMappingManyfestFromFile(tmp1859Path);
					libAssert.equal(tmpLoaded.manifest.TargetFile, '1859 - Coarse Agg Gravity.pdf');
					libAssert.equal(tmpLoaded.manifest.SourceRootAddress, 'ReportData.FormData');
				}
				finally
				{
					// Cleanup
					const tmpFiles = libFS.readdirSync(tmpTempDir);
					for (const tmpFile of tmpFiles)
					{
						libFS.unlinkSync(libPath.join(tmpTempDir, tmpFile));
					}
					libFS.rmdirSync(tmpTempDir);
				}
			});
	}
);
