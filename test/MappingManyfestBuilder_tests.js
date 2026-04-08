const Chai = require('chai');
const Expect = Chai.expect;

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
				Expect(tmpSvc.normalizeSourceAddress('CAGTable[0]CAGB')).to.equal('CAGTable[0].CAGB');
				Expect(tmpSvc.normalizeSourceAddress('CAGTable[0].CAGB')).to.equal('CAGTable[0].CAGB');
				Expect(tmpSvc.normalizeSourceAddress('H.CtrlSecID')).to.equal('H.CtrlSecID');
				Expect(tmpSvc.normalizeSourceAddress('Dogs[`key`].Value')).to.equal('Dogs[`key`].Value');
			});

		test('classifyTargetFileType tolerates the .xslx typo',
			() =>
			{
				const tmpSvc = buildService();
				Expect(tmpSvc.classifyTargetFileType('foo.pdf')).to.equal('PDF');
				Expect(tmpSvc.classifyTargetFileType('foo.PDF')).to.equal('PDF');
				Expect(tmpSvc.classifyTargetFileType('foo.xlsx')).to.equal('XLSX');
				Expect(tmpSvc.classifyTargetFileType('HMA - Data Sheet - MI.xslx')).to.equal('XLSX');
				Expect(tmpSvc.classifyTargetFileType('foo.txt')).to.equal('Unknown');
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

				Expect(tmpResult).to.be.an('object');
				Expect(tmpResult.MappingConfigs).to.be.an('object');
				Expect(tmpResult.BuildReport).to.be.an('object');

				const tmpKeys = Object.keys(tmpResult.MappingConfigs);
				// 14 distinct target forms per exploration: 13 PDFs + 1 XLSX.
				Expect(tmpKeys.length).to.equal(14);

				// Spot-check a well-known entry.
				const tmp1859 = tmpResult.MappingConfigs['1859 - Coarse Agg Gravity.pdf'];
				Expect(tmp1859, '1859 config').to.be.an('object');
				Expect(tmp1859.TargetFileType).to.equal('PDF');
				Expect(tmp1859.SourceDocumentType).to.equal('MI-CAG-Walbec');
				Expect(tmp1859.SourceRootAddress).to.equal('ReportData.FormData');

				const tmpDescriptor = tmp1859.Descriptors['CAGTable[0].CAGB'];
				Expect(tmpDescriptor, 'descriptor for CAGTable[0].CAGB').to.be.an('object');
				Expect(tmpDescriptor.TargetFieldName).to.equal('A4');
				Expect(tmpDescriptor.TargetFieldType).to.equal('Text');
				Expect(tmpDescriptor.SourceAddressRaw).to.equal('CAGTable[0]CAGB');

				// XLSX entry tolerates the typo in the CSV filename (".xslx").
				const tmpXlsxKey = Object.keys(tmpResult.MappingConfigs).find(
					(pKey) => pKey.toLowerCase().endsWith('.xslx') || pKey.toLowerCase().endsWith('.xlsx'));
				Expect(tmpXlsxKey, 'xlsx key present').to.be.a('string');
				Expect(tmpResult.MappingConfigs[tmpXlsxKey].TargetFileType).to.equal('XLSX');
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
				Expect(tmpManyfest1859, '1859 manyfest').to.be.an('object');

				const tmpSourceData = JSON.parse(libFS.readFileSync(SOURCE_CAG_JSON, 'utf8'));
				const tmpFullAddress = tmpSvc.joinAddress(tmpManyfest1859.manifest.SourceRootAddress, 'CAGTable[0].CAGB');
				const tmpValue = tmpManyfest1859.getValueAtAddress(tmpSourceData, tmpFullAddress);
				Expect(tmpValue).to.equal('100.0');
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
					Expect(tmpPaths.length).to.equal(14);

					const tmp1859Path = tmpPaths.find((pPath) => pPath.includes('1859'));
					Expect(tmp1859Path).to.be.a('string');

					const tmpLoaded = tmpSvc.loadMappingManyfestFromFile(tmp1859Path);
					Expect(tmpLoaded.manifest.TargetFile).to.equal('1859 - Coarse Agg Gravity.pdf');
					Expect(tmpLoaded.manifest.SourceRootAddress).to.equal('ReportData.FormData');
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
