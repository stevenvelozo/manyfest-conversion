const libAssert = require('node:assert/strict');

const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');
const libChildProcess = require('child_process');

const libPict = require('pict');
const libPDFFormFiller = require('../source/services/Service-PDFFormFiller.js');
const libMappingManyfestBuilder = require('../source/services/Service-MappingManyfestBuilder.js');

const SAMPLE_1923_PDF = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '000-Originals', '1923 - Sample Identification.pdf');
const SAMPLE_1859_PDF = libPath.join(__dirname, '..', 'debug', 'dist', 'data', 'MDOT PDF Forms', '000-Originals', '1859 - Coarse Agg Gravity.pdf');

const pdftkAvailable = () =>
{
	try
	{
		const tmp = libChildProcess.spawnSync('which', ['pdftk'], { encoding: 'utf8' });
		if (tmp.status === 0 && tmp.stdout && tmp.stdout.trim())
		{
			return true;
		}
		const tmp2 = libChildProcess.spawnSync('which', ['pdftk-java'], { encoding: 'utf8' });
		return tmp2.status === 0 && tmp2.stdout && tmp2.stdout.trim();
	}
	catch (pError)
	{
		return false;
	}
};

const SAMPLE_DUMP_OUTPUT = [
	'---',
	'FieldType: Text',
	'FieldName: Text1',
	'FieldFlags: 8388608',
	'FieldJustification: Left',
	'---',
	'FieldType: Button',
	'FieldName: Check Box3',
	'FieldFlags: 0',
	'FieldJustification: Left',
	'FieldStateOption: Off',
	'FieldStateOption: Yes',
	'---',
	'FieldType: Text',
	'FieldName: Text11.2.0',
	'FieldNameAlt: Special, with comma and "quotes"',
	'FieldFlags: 8388608',
	'FieldJustification: Center',
	''
].join('\n');

suite
(
	'PDFFormFiller.parseDumpDataFields',
	() =>
	{
		const buildService = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('PDFFormFiller', libPDFFormFiller);
			return tmpFable.instantiateServiceProvider('PDFFormFiller');
		};

		test('returns an empty array for empty input',
			() =>
			{
				const tmpSvc = buildService();
				libAssert.deepEqual(tmpSvc.parseDumpDataFields(''), []);
				libAssert.deepEqual(tmpSvc.parseDumpDataFields(null), []);
				libAssert.deepEqual(tmpSvc.parseDumpDataFields(undefined), []);
			});

		test('parses a hand-crafted dump_data_fields output into field descriptor objects',
			() =>
			{
				const tmpSvc = buildService();
				const tmpFields = tmpSvc.parseDumpDataFields(SAMPLE_DUMP_OUTPUT);

				libAssert.equal(tmpFields.length, 3);

				libAssert.equal(tmpFields[0].FieldType, 'Text');
				libAssert.equal(tmpFields[0].FieldName, 'Text1');
				libAssert.equal(tmpFields[0].FieldFlags, '8388608');
				libAssert.equal(tmpFields[0].FieldJustification, 'Left');
				libAssert.equal(tmpFields[0].FieldNameAlt, null);
				libAssert.deepEqual(tmpFields[0].FieldStateOptions, []);

				libAssert.equal(tmpFields[1].FieldType, 'Button');
				libAssert.equal(tmpFields[1].FieldName, 'Check Box3');
				libAssert.deepEqual(tmpFields[1].FieldStateOptions, ['Off', 'Yes']);

				libAssert.equal(tmpFields[2].FieldName, 'Text11.2.0');
				libAssert.equal(tmpFields[2].FieldNameAlt, 'Special, with comma and "quotes"');
				libAssert.equal(tmpFields[2].FieldJustification, 'Center');
			});

		test('ignores unknown keys without throwing',
			() =>
			{
				const tmpSvc = buildService();
				const tmpFields = tmpSvc.parseDumpDataFields(
					[
						'---',
						'FieldType: Text',
						'FieldName: Only',
						'UnknownKey: whatever',
						'AnotherNewKey: value'
					].join('\n'));
				libAssert.equal(tmpFields.length, 1);
				libAssert.equal(tmpFields[0].FieldName, 'Only');
			});

		test('drops trailing blocks that have no FieldName',
			() =>
			{
				const tmpSvc = buildService();
				const tmpFields = tmpSvc.parseDumpDataFields(
					[
						'---',
						'FieldType: Text',
						'FieldName: Keep',
						'---',
						'FieldType: Text'
					].join('\n'));
				libAssert.equal(tmpFields.length, 1);
				libAssert.equal(tmpFields[0].FieldName, 'Keep');
			});
	}
);

suite
(
	'MappingManyfestBuilder CSV generation',
	() =>
	{
		const buildService = () =>
		{
			const tmpFable = new libPict();
			tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
			tmpFable.instantiateServiceProvider('CSVParser');
			return tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
		};

		test('escapeCSVCell quotes cells containing commas, quotes, or newlines',
			() =>
			{
				const tmpSvc = buildService();
				libAssert.equal(tmpSvc.escapeCSVCell('plain'), 'plain');
				libAssert.equal(tmpSvc.escapeCSVCell(''), '');
				libAssert.equal(tmpSvc.escapeCSVCell(null), '');
				libAssert.equal(tmpSvc.escapeCSVCell(undefined), '');
				libAssert.equal(tmpSvc.escapeCSVCell('a,b'), '"a,b"');
				libAssert.equal(tmpSvc.escapeCSVCell('say "hi"'), '"say ""hi"""');
				libAssert.equal(tmpSvc.escapeCSVCell('one\ntwo'), '"one\ntwo"');
				libAssert.equal(tmpSvc.escapeCSVCell(42), '42');
			});

		test('buildNotesForExtractedField concatenates metadata with semicolons',
			() =>
			{
				const tmpSvc = buildService();
				libAssert.equal(tmpSvc.buildNotesForExtractedField(null), '');
				libAssert.equal(tmpSvc.buildNotesForExtractedField({ FieldType: 'Text' }), '');
				libAssert.equal(
					tmpSvc.buildNotesForExtractedField(
						{
							FieldType: 'Button',
							FieldNameAlt: 'Select payment method',
							FieldJustification: 'Center',
							FieldFlags: '65536',
							FieldStateOptions: ['Cash', 'Credit', 'Off']
						}),
					'Tooltip: Select payment method; Justification: Center; Flags: 65536; States: Cash|Credit|Off');
			});

		test('generateMappingCSVFromFields emits a valid header and one row per field',
			() =>
			{
				const tmpSvc = buildService();
				const tmpFields = (
					[
						{ FieldType: 'Text', FieldName: 'first_name', FieldFlags: '0', FieldJustification: 'Left', FieldStateOptions: [] },
						{ FieldType: 'Text', FieldName: 'last_name',  FieldFlags: '0', FieldJustification: 'Left', FieldStateOptions: [] },
						{ FieldType: 'Button', FieldName: 'is_member', FieldFlags: '0', FieldJustification: 'Left', FieldStateOptions: ['Off', 'Yes'] }
					]);

				const tmpCSV = tmpSvc.generateMappingCSVFromFields(tmpFields, 'Membership.pdf', { formName: 'MembershipForm' });
				const tmpLines = tmpCSV.trim().split('\n');

				libAssert.equal(tmpLines.length, 4);  // header + 3 data rows
				libAssert.equal(tmpLines[0], 'Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes');
				libAssert.equal(tmpLines[1], '1,Membership.pdf,Text,first_name,MembershipForm,,,,');
				libAssert.equal(tmpLines[2], '2,Membership.pdf,Text,last_name,MembershipForm,,,,');
				libAssert.equal(tmpLines[3], '3,Membership.pdf,Button,is_member,MembershipForm,,,,States: Off|Yes');
			});

		test('generateMappingCSVFromFields round-trips through buildFromCSVFile (rows parse as unmapped skeletons)',
			function()
			{
				const tmpSvc = buildService();
				const tmpFields = (
					[
						{ FieldType: 'Text', FieldName: 'first_name', FieldFlags: '0', FieldJustification: 'Left', FieldStateOptions: [] },
						{ FieldType: 'Text', FieldName: 'last_name',  FieldFlags: '0', FieldJustification: 'Left', FieldStateOptions: [] }
					]);
				const tmpCSV = tmpSvc.generateMappingCSVFromFields(tmpFields, 'Membership.pdf', { formName: 'MembershipForm' });

				const tmpDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-extract-test-'));
				const tmpCSVPath = libPath.join(tmpDir, 'Membership-ManyfestMapping.csv');
				try
				{
					libFS.writeFileSync(tmpCSVPath, tmpCSV);
					const tmpResult = tmpSvc.buildFromCSVFileSync(tmpCSVPath);
					libAssert.equal(tmpResult.BuildReport.FormCount, 1);
					const tmpConfig = tmpResult.MappingConfigs['Membership.pdf'];
					libAssert.notEqual(tmpConfig, undefined);
					libAssert.equal(tmpConfig.SourceDocumentType, 'MembershipForm');
					// All rows have empty Form Input Address -> zero descriptors, two unmapped.
					libAssert.equal(Object.keys(tmpConfig.Descriptors).length, 0);
					libAssert.equal(tmpConfig.UnmappedTargetFields.length, 2);
					libAssert.equal(tmpConfig.UnmappedTargetFields[0].FieldName, 'first_name');
				}
				finally
				{
					libFS.unlinkSync(tmpCSVPath);
					libFS.rmdirSync(tmpDir);
				}
			});

		test('defaultMappingCSVPathForPDF turns Washington-Drivers-Form.pdf into Washington-Drivers-Form-ManyfestMapping.csv',
			() =>
			{
				const tmpSvc = buildService();
				libAssert.equal(
					tmpSvc.defaultMappingCSVPathForPDF('/path/to/Washington-Drivers-Form.pdf'),
					libPath.join('/path/to', 'Washington-Drivers-Form-ManyfestMapping.csv'));
				libAssert.equal(
					tmpSvc.defaultMappingCSVPathForPDF('fw9.pdf'),
					'fw9-ManyfestMapping.csv');
			});
	}
);

suite
(
	'End-to-end: extract fields from a real PDF (skipped if pdftk missing)',
	() =>
	{
		let _skip = false;

		suiteSetup(function()
		{
			if (!pdftkAvailable() || !libFS.existsSync(SAMPLE_1923_PDF))
			{
				_skip = true;
				this.skip();
			}
		});

		test('extracts 30 fields from 1923 - Sample Identification.pdf',
			function()
			{
				if (_skip) { this.skip(); return; }

				const tmpFable = new libPict();
				tmpFable.addServiceType('PDFFormFiller', libPDFFormFiller);
				const tmpFiller = tmpFable.instantiateServiceProvider('PDFFormFiller');

				const tmpFields = tmpFiller.dumpFormFields(SAMPLE_1923_PDF);
				libAssert.equal(tmpFields.length, 30);

				const tmpByName = Object.fromEntries(tmpFields.map((f) => [f.FieldName, f]));
				libAssert.equal(tmpByName['Text1'].FieldType, 'Text');
				libAssert.equal(tmpByName['Check Box3'].FieldType, 'Button');
				libAssert.equal(tmpByName['Text11.2.0'].FieldType, 'Text');
			});

		test('generateMappingCSVFromPDF writes a CSV that build-mappings can re-read',
			function()
			{
				if (_skip || !libFS.existsSync(SAMPLE_1859_PDF)) { this.skip(); return; }

				const tmpFable = new libPict();
				tmpFable.addServiceType('PDFFormFiller', libPDFFormFiller);
				tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
				tmpFable.instantiateServiceProvider('CSVParser');
				tmpFable.instantiateServiceProvider('PDFFormFiller');
				const tmpBuilder = tmpFable.instantiateServiceProvider('MappingManyfestBuilder');

				const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-extract-1859-'));
				const tmpCSVPath = libPath.join(tmpTempDir, '1859-ManyfestMapping.csv');

				try
				{
					const tmpResult = tmpBuilder.generateMappingCSVFromPDF(SAMPLE_1859_PDF, tmpCSVPath, { formName: 'MI-CAG-Walbec' });

					libAssert.equal(libFS.existsSync(tmpCSVPath), true);
					libAssert.equal(tmpResult.targetFileName, '1859 - Coarse Agg Gravity.pdf');
					libAssert.ok(tmpResult.fields.length > 0);

					const tmpCSVContents = libFS.readFileSync(tmpCSVPath, 'utf8');
					const tmpHeaderLine = tmpCSVContents.split('\n')[0];
					libAssert.equal(tmpHeaderLine, 'Sort,PDF File,Field Type,Field Name,Form,Document Data Long Filler,Form Input Address,Form Input Address Long,Notes');

					// Re-read through build-mappings: should produce one unmapped skeleton.
					const tmpBuilt = tmpBuilder.buildFromCSVFileSync(tmpCSVPath);
					libAssert.equal(tmpBuilt.BuildReport.FormCount, 1);
					const tmpConfig = tmpBuilt.MappingConfigs['1859 - Coarse Agg Gravity.pdf'];
					libAssert.notEqual(tmpConfig, undefined);
					libAssert.equal(tmpConfig.SourceDocumentType, 'MI-CAG-Walbec');
					libAssert.equal(Object.keys(tmpConfig.Descriptors).length, 0);
					libAssert.equal(tmpConfig.UnmappedTargetFields.length, tmpResult.fields.length);
				}
				finally
				{
					try { libFS.unlinkSync(tmpCSVPath); } catch (pError) { /* ignore */ }
					try { libFS.rmdirSync(tmpTempDir); } catch (pError) { /* ignore */ }
				}
			});
	}
);
