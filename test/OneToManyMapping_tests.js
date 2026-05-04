// Tests covering the 1:N descriptor schema (one source address, many target
// fields) and the backward-compat path that keeps old 1:1 descriptor JSON
// working without rebuild.

const libAssert = require('node:assert/strict');

const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');

const libPict = require('pict');
const libManyfest = require('manyfest');

const libMappingManyfestBuilder = require('../source/services/Service-MappingManyfestBuilder.js');
const libPDFFormFiller = require('../source/services/Service-PDFFormFiller.js');
const libXLSXFormFiller = require('../source/services/Service-XLSXFormFiller.js');
const libConversionReport = require('../source/services/Service-ConversionReport.js');

const buildAllServices = () =>
{
	const tmpFable = new libPict();
	tmpFable.addServiceType('MappingManyfestBuilder', libMappingManyfestBuilder);
	tmpFable.addServiceType('PDFFormFiller', libPDFFormFiller);
	tmpFable.addServiceType('XLSXFormFiller', libXLSXFormFiller);
	tmpFable.addServiceType('ConversionReport', libConversionReport);
	tmpFable.instantiateServiceProvider('CSVParser');
	return (
		{
			fable: tmpFable,
			builder: tmpFable.instantiateServiceProvider('MappingManyfestBuilder'),
			pdf: tmpFable.instantiateServiceProvider('PDFFormFiller'),
			xlsx: tmpFable.instantiateServiceProvider('XLSXFormFiller'),
			reporter: tmpFable.instantiateServiceProvider('ConversionReport')
		});
};

suite
(
	'normalizeDescriptorTargets: backward compatibility helper',
	() =>
	{
		test('returns [] for null/undefined/non-object descriptors',
			() =>
			{
				const tmp = buildAllServices();
				libAssert.deepEqual(tmp.builder.normalizeDescriptorTargets(null), []);
				libAssert.deepEqual(tmp.builder.normalizeDescriptorTargets(undefined), []);
				libAssert.deepEqual(tmp.builder.normalizeDescriptorTargets('string'), []);
				libAssert.deepEqual(tmp.builder.normalizeDescriptorTargets(42), []);
			});

		test('promotes a legacy 1:1 descriptor (TargetFieldName directly on it) to a single-target array',
			() =>
			{
				const tmp = buildAllServices();
				const tmpLegacyDescriptor = (
					{
						Name: '1907.pdf/job_number',
						Hash: '1907__job_number',
						DataType: 'String',
						TargetFieldName: 'job_number',
						TargetFieldType: 'Text',
						SourceSortOrder: 5,
						SourceAddressRaw: 'H.JobNo',
						Notes: 'header field'
					});
				const tmpTargets = tmp.builder.normalizeDescriptorTargets(tmpLegacyDescriptor);
				libAssert.equal(tmpTargets.length, 1);
				libAssert.equal(tmpTargets[0].TargetFieldName, 'job_number');
				libAssert.equal(tmpTargets[0].TargetFieldType, 'Text');
				libAssert.equal(tmpTargets[0].SourceSortOrder, 5);
				libAssert.equal(tmpTargets[0].Notes, 'header field');
			});

		test('returns the Targets array verbatim when present (new 1:N shape)',
			() =>
			{
				const tmp = buildAllServices();
				const tmpNewDescriptor = (
					{
						Name: '1907.pdf/job_number',
						Targets:
						[
							{ TargetFieldName: 'job_number', TargetFieldType: 'Text', SourceSortOrder: 5 },
							{ TargetFieldName: 'header_job_no', TargetFieldType: 'Text', SourceSortOrder: 47 }
						]
					});
				const tmpTargets = tmp.builder.normalizeDescriptorTargets(tmpNewDescriptor);
				libAssert.equal(tmpTargets.length, 2);
				libAssert.equal(tmpTargets[0].TargetFieldName, 'job_number');
				libAssert.equal(tmpTargets[1].TargetFieldName, 'header_job_no');
			});

		test('an empty Targets array on a descriptor falls back to the legacy single-target read',
			() =>
			{
				const tmp = buildAllServices();
				const tmpDescriptor = (
					{
						Targets: [],
						TargetFieldName: 'fallback_field',
						TargetFieldType: 'Text'
					});
				const tmpTargets = tmp.builder.normalizeDescriptorTargets(tmpDescriptor);
				libAssert.equal(tmpTargets.length, 1);
				libAssert.equal(tmpTargets[0].TargetFieldName, 'fallback_field');
			});

		test('PDFFormFiller and XLSXFormFiller carry their own copies of the helper',
			() =>
			{
				const tmp = buildAllServices();
				// All three implementations should yield the same answer on the
				// same input -- this guards against drift if one is updated and
				// the others are not.
				const tmpDescriptor = (
					{
						TargetFieldName: 'po_number',
						TargetFieldType: 'Text'
					});
				const tmpFromBuilder = tmp.builder.normalizeDescriptorTargets(tmpDescriptor);
				const tmpFromPDF = tmp.pdf.normalizeDescriptorTargets(tmpDescriptor);
				const tmpFromXLSX = tmp.xlsx.normalizeDescriptorTargets(tmpDescriptor);
				libAssert.deepEqual(tmpFromBuilder, tmpFromPDF);
				libAssert.deepEqual(tmpFromBuilder, tmpFromXLSX);
			});
	}
);

suite
(
	'MappingManyfestBuilder: 1:N descriptor emission and dupe handling',
	() =>
	{
		test('a CSV with two rows pairing the same source address with different target fields produces ONE descriptor with TWO targets',
			() =>
			{
				const tmp = buildAllServices();
				const tmpConfigs = {};
				const tmpReport = tmp.builder.newBuildReport();
				const tmpRows =
				[
					{
						'Sort': '1', 'pdf_file': '1907.pdf', 'field_type': 'Text', 'field_name': 'job_number',
						'HL Form': 'WalbecMICorelogSublot', 'Document Data Long Filler': '',
						'Form Input Address': 'Gen.JobNum', 'Form Input Address Long': 'Gen.JobNum', 'Notes': ''
					},
					{
						'Sort': '47', 'pdf_file': '1907.pdf', 'field_type': 'Text', 'field_name': 'header_job_no',
						'HL Form': 'WalbecMICorelogSublot', 'Document Data Long Filler': '',
						'Form Input Address': 'Gen.JobNum', 'Form Input Address Long': 'Gen.JobNum', 'Notes': ''
					}
				];
				for (const tmpRow of tmpRows)
				{
					tmp.builder.applyRowToConfigs(tmpRow, tmpConfigs, tmpReport, {});
				}

				libAssert.equal(tmpReport.RowsAccepted, 2);
				libAssert.equal(tmpReport.RowsSkipped, 0);

				const tmpDescriptor = tmpConfigs['1907.pdf'].Descriptors['Gen.JobNum'];
				libAssert.equal(typeof tmpDescriptor, 'object');
				libAssert.ok(Array.isArray(tmpDescriptor.Targets));
				libAssert.equal(tmpDescriptor.Targets.length, 2);
				libAssert.equal(tmpDescriptor.Targets[0].TargetFieldName, 'job_number');
				libAssert.equal(tmpDescriptor.Targets[1].TargetFieldName, 'header_job_no');
				libAssert.equal(tmpDescriptor.Targets[0].SourceSortOrder, 1);
				libAssert.equal(tmpDescriptor.Targets[1].SourceSortOrder, 47);
				// Per-target counts roll into Forms[].DescriptorCount
				libAssert.equal(tmpReport.Forms['1907.pdf'].DescriptorCount, 2);
			});

		test('three rows fanning the same source address to three target fields produce three Targets',
			() =>
			{
				const tmp = buildAllServices();
				const tmpConfigs = {};
				const tmpReport = tmp.builder.newBuildReport();
				const tmpMakeRow = (pSort, pField) =>
					({
						'Sort': pSort, 'pdf_file': '1937 - TSR.pdf', 'field_type': 'Text', 'field_name': pField,
						'HL Form': 'MI-TSR', 'Document Data Long Filler': '',
						'Form Input Address': 'LoadTestingSamples.XWetAvg1', 'Form Input Address Long': 'LoadTestingSamples.XWetAvg1', 'Notes': ''
					});
				tmp.builder.applyRowToConfigs(tmpMakeRow('1', 'wet_avg_a'), tmpConfigs, tmpReport, {});
				tmp.builder.applyRowToConfigs(tmpMakeRow('2', 'wet_avg_b'), tmpConfigs, tmpReport, {});
				tmp.builder.applyRowToConfigs(tmpMakeRow('3', 'wet_avg_c'), tmpConfigs, tmpReport, {});

				const tmpDescriptor = tmpConfigs['1937 - TSR.pdf'].Descriptors['LoadTestingSamples.XWetAvg1'];
				libAssert.equal(tmpDescriptor.Targets.length, 3);
				libAssert.deepEqual(
					tmpDescriptor.Targets.map((t) => t.TargetFieldName),
					['wet_avg_a', 'wet_avg_b', 'wet_avg_c']);
			});

		test('the SAME (source, target) pair appearing twice still skips with a clear reason',
			() =>
			{
				const tmp = buildAllServices();
				const tmpConfigs = {};
				const tmpReport = tmp.builder.newBuildReport();
				const tmpRow =
					{
						'Sort': '1', 'pdf_file': 'foo.pdf', 'field_type': 'Text', 'field_name': 'job_number',
						'HL Form': 'X', 'Document Data Long Filler': '',
						'Form Input Address': 'Gen.JobNum', 'Form Input Address Long': '', 'Notes': ''
					};
				tmp.builder.applyRowToConfigs(tmpRow, tmpConfigs, tmpReport, {});
				tmp.builder.applyRowToConfigs(tmpRow, tmpConfigs, tmpReport, {});

				libAssert.equal(tmpReport.RowsAccepted, 1);
				libAssert.equal(tmpReport.RowsSkipped, 1);
				libAssert.match(tmpReport.SkipReasons[0].Reason, /Duplicate \(source, target\) pair/);
			});
	}
);

suite
(
	'PDFFormFiller: 1:N targets emit one XFDF entry per target',
	() =>
	{
		const buildLiveManyfest = (pDescriptors) =>
		{
			const tmpManyfest = new libManyfest();
			tmpManyfest.loadManifest({ Scope: 'test', Descriptors: pDescriptors });
			tmpManyfest.manifest = tmpManyfest.manifest || {};
			tmpManyfest.manifest.SourceRootAddress = 'ReportData.FormData';
			return tmpManyfest;
		};

		test('one descriptor with three targets emits three <field> entries',
			() =>
			{
				const tmp = buildAllServices();
				const tmpManyfest = buildLiveManyfest(
					{
						'H.JobNo':
						{
							Name: '1907.pdf/job_number',
							Targets:
							[
								{ TargetFieldName: 'job_number', TargetFieldType: 'Text' },
								{ TargetFieldName: 'header_job_no', TargetFieldType: 'Text' },
								{ TargetFieldName: 'footer_job_no', TargetFieldType: 'Text' }
							]
						}
					});
				const tmpSource = { ReportData: { FormData: { H: { JobNo: '220407A' } } } };
				const tmpReport = tmp.reporter.newReport('s', 't');

				const tmpBuild = tmp.pdf.buildXFDF(tmpManyfest, tmpSource, tmpReport, tmp.reporter);
				libAssert.equal(tmpBuild.fieldCount, 3);
				libAssert.ok(tmpBuild.xfdf.includes('<field name="job_number"><value>220407A</value></field>'));
				libAssert.ok(tmpBuild.xfdf.includes('<field name="header_job_no"><value>220407A</value></field>'));
				libAssert.ok(tmpBuild.xfdf.includes('<field name="footer_job_no"><value>220407A</value></field>'));

				tmp.reporter.finalize(tmpReport);
				libAssert.equal(tmpReport.Stats.SuccessCount, 3);
				libAssert.equal(tmpReport.Stats.ErrorCount, 0);
			});

		test('legacy 1:1 descriptor (TargetFieldName directly on it) still fills correctly -- backward compat',
			() =>
			{
				const tmp = buildAllServices();
				const tmpManyfest = buildLiveManyfest(
					{
						'H.JobNo':
						{
							Name: '1907.pdf/job_number',
							TargetFieldName: 'job_number',
							TargetFieldType: 'Text'
						}
					});
				const tmpSource = { ReportData: { FormData: { H: { JobNo: '220407A' } } } };
				const tmpReport = tmp.reporter.newReport('s', 't');

				const tmpBuild = tmp.pdf.buildXFDF(tmpManyfest, tmpSource, tmpReport, tmp.reporter);
				libAssert.equal(tmpBuild.fieldCount, 1);
				libAssert.ok(tmpBuild.xfdf.includes('<field name="job_number"><value>220407A</value></field>'));

				tmp.reporter.finalize(tmpReport);
				libAssert.equal(tmpReport.Stats.SuccessCount, 1);
				libAssert.equal(tmpReport.Stats.ErrorCount, 0);
			});

		test('multi-target descriptor with mixed Text+Button: Button targets warn, Text targets succeed',
			() =>
			{
				const tmp = buildAllServices();
				const tmpManyfest = buildLiveManyfest(
					{
						'H.Status':
						{
							Targets:
							[
								{ TargetFieldName: 'status_text', TargetFieldType: 'Text' },
								{ TargetFieldName: 'status_check_box', TargetFieldType: 'Button' }
							]
						}
					});
				const tmpSource = { ReportData: { FormData: { H: { Status: 'OK' } } } };
				const tmpReport = tmp.reporter.newReport('s', 't');

				const tmpBuild = tmp.pdf.buildXFDF(tmpManyfest, tmpSource, tmpReport, tmp.reporter);
				libAssert.equal(tmpBuild.fieldCount, 1);  // only the Text target wrote XFDF
				libAssert.ok(tmpBuild.xfdf.includes('status_text'));
				libAssert.ok(!tmpBuild.xfdf.includes('status_check_box'));

				tmp.reporter.finalize(tmpReport);
				libAssert.equal(tmpReport.Stats.SuccessCount, 1);
				libAssert.equal(tmpReport.Stats.WarningCount, 1);
				libAssert.match(tmpReport.Warnings[0].Message, /warn-and-skip/);
			});

		test('missing source value warns once per target',
			() =>
			{
				const tmp = buildAllServices();
				const tmpManyfest = buildLiveManyfest(
					{
						'H.Missing':
						{
							Targets:
							[
								{ TargetFieldName: 'a', TargetFieldType: 'Text' },
								{ TargetFieldName: 'b', TargetFieldType: 'Text' }
							]
						}
					});
				const tmpSource = { ReportData: { FormData: {} } };
				const tmpReport = tmp.reporter.newReport('s', 't');

				tmp.pdf.buildXFDF(tmpManyfest, tmpSource, tmpReport, tmp.reporter);
				tmp.reporter.finalize(tmpReport);

				libAssert.equal(tmpReport.Stats.SuccessCount, 0);
				libAssert.equal(tmpReport.Stats.WarningCount, 2);
			});
	}
);

suite
(
	'XLSXFormFiller: resolveSourceValue runs once per descriptor; targets iterate',
	() =>
	{
		const buildManyfest = () =>
		{
			const tmpManyfest = new libManyfest();
			tmpManyfest.loadManifest({ Scope: 'test', Descriptors: {} });
			return tmpManyfest;
		};

		test('end-to-end: descriptor with two cell targets writes the same value to both cells',
			async () =>
			{
				const tmp = buildAllServices();
				const tmpManyfest = buildManyfest();
				tmpManyfest.loadManifest(
					{
						Scope: 'test',
						Descriptors:
						{
							'Header.PONumber':
							{
								Targets:
								[
									{ TargetFieldName: 'B2', TargetFieldType: 'Text' },
									{ TargetFieldName: 'B20', TargetFieldType: 'Text' }
								]
							}
						}
					});
				tmpManyfest.manifest = tmpManyfest.manifest || {};
				tmpManyfest.manifest.SourceRootAddress = '';

				// Build a tiny in-memory workbook
				const libExcelJS = require('exceljs');
				const tmpWB = new libExcelJS.Workbook();
				const tmpSheet = tmpWB.addWorksheet('Sheet1');
				tmpSheet.getCell('B2').value = '';
				tmpSheet.getCell('B20').value = '';

				const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-1n-test-'));
				const tmpTemplatePath = libPath.join(tmpTempDir, 'template.xlsx');
				const tmpOutputPath = libPath.join(tmpTempDir, 'filled.xlsx');
				try
				{
					await tmpWB.xlsx.writeFile(tmpTemplatePath);

					const tmpSource = { Header: { PONumber: 'PO-2026-0042' } };
					const tmpReport = tmp.reporter.newReport(tmpTemplatePath, 'template.xlsx', tmpManyfest);
					await tmp.xlsx.fillXLSX(tmpManyfest, tmpSource, tmpTemplatePath, tmpOutputPath, tmpReport, tmp.reporter);

					const tmpReadBack = new libExcelJS.Workbook();
					await tmpReadBack.xlsx.readFile(tmpOutputPath);
					const tmpReadSheet = tmpReadBack.getWorksheet('Sheet1');
					libAssert.equal(String(tmpReadSheet.getCell('B2').value), 'PO-2026-0042');
					libAssert.equal(String(tmpReadSheet.getCell('B20').value), 'PO-2026-0042');

					libAssert.equal(tmpReport.Stats.SuccessCount, 2);
					libAssert.equal(tmpReport.Stats.ErrorCount, 0);
				}
				finally
				{
					try { libFS.unlinkSync(tmpTemplatePath); } catch (e) {}
					try { libFS.unlinkSync(tmpOutputPath); } catch (e) {}
					try { libFS.rmdirSync(tmpTempDir); } catch (e) {}
				}
			});

		test('legacy 1:1 descriptor still fills correctly -- backward compat',
			async () =>
			{
				const tmp = buildAllServices();
				const tmpManyfest = buildManyfest();
				tmpManyfest.loadManifest(
					{
						Scope: 'test',
						Descriptors:
						{
							'Header.PONumber':
							{
								// Old shape: TargetFieldName directly on the descriptor
								TargetFieldName: 'B2',
								TargetFieldType: 'Text'
							}
						}
					});
				tmpManyfest.manifest = tmpManyfest.manifest || {};
				tmpManyfest.manifest.SourceRootAddress = '';

				const libExcelJS = require('exceljs');
				const tmpWB = new libExcelJS.Workbook();
				const tmpSheet = tmpWB.addWorksheet('Sheet1');
				tmpSheet.getCell('B2').value = '';

				const tmpTempDir = libFS.mkdtempSync(libPath.join(libOS.tmpdir(), 'mfconv-legacy-test-'));
				const tmpTemplatePath = libPath.join(tmpTempDir, 'template.xlsx');
				const tmpOutputPath = libPath.join(tmpTempDir, 'filled.xlsx');
				try
				{
					await tmpWB.xlsx.writeFile(tmpTemplatePath);

					const tmpSource = { Header: { PONumber: 'PO-LEGACY-1' } };
					const tmpReport = tmp.reporter.newReport(tmpTemplatePath, 'template.xlsx', tmpManyfest);
					await tmp.xlsx.fillXLSX(tmpManyfest, tmpSource, tmpTemplatePath, tmpOutputPath, tmpReport, tmp.reporter);

					const tmpReadBack = new libExcelJS.Workbook();
					await tmpReadBack.xlsx.readFile(tmpOutputPath);
					libAssert.equal(String(tmpReadBack.getWorksheet('Sheet1').getCell('B2').value), 'PO-LEGACY-1');

					libAssert.equal(tmpReport.Stats.SuccessCount, 1);
					libAssert.equal(tmpReport.Stats.ErrorCount, 0);
				}
				finally
				{
					try { libFS.unlinkSync(tmpTemplatePath); } catch (e) {}
					try { libFS.unlinkSync(tmpOutputPath); } catch (e) {}
					try { libFS.rmdirSync(tmpTempDir); } catch (e) {}
				}
			});
	}
);

suite
(
	'End-to-end backward compatibility: existing 1:1 mapping JSONs on disk still work',
	() =>
	{
		const BOOKSTORE_MAPPING = libPath.join(__dirname, '..', 'docs', 'examples', 'data', 'bookstore', 'built-mappings', 'AcquisitionOrder.pdf.mapping.json');
		const BOOKSTORE_SOURCE = libPath.join(__dirname, '..', 'docs', 'examples', 'data', 'bookstore', 'source.json');

		test('the previously-shipped bookstore mapping JSON loads and produces XFDF without error',
			function()
			{
				if (!libFS.existsSync(BOOKSTORE_MAPPING) || !libFS.existsSync(BOOKSTORE_SOURCE))
				{
					this.skip();
					return;
				}

				const tmp = buildAllServices();
				const tmpManyfest = tmp.builder.loadMappingManyfestFromFile(BOOKSTORE_MAPPING);
				const tmpSourceData = JSON.parse(libFS.readFileSync(BOOKSTORE_SOURCE, 'utf8'));
				const tmpReport = tmp.reporter.newReport(BOOKSTORE_SOURCE, 'AcquisitionOrder.pdf', tmpManyfest);

				const tmpBuild = tmp.pdf.buildXFDF(tmpManyfest, tmpSourceData, tmpReport, tmp.reporter);
				tmp.reporter.finalize(tmpReport);

				// All bookstore descriptors are 1:1 and resolve cleanly.  We
				// don't assert exact counts here -- the test exists to confirm
				// no error is thrown and that at least some XFDF lines are
				// emitted from the legacy-shape file.
				libAssert.ok(tmpBuild.fieldCount > 0, 'should emit at least one XFDF field from legacy 1:1 mapping');
				libAssert.equal(tmpReport.Stats.ErrorCount, 0, 'no errors should be raised by legacy-shape descriptors');
			});
	}
);
