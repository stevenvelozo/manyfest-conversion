const libAssert = require('node:assert/strict');

const libPict = require('pict');
const libManyfestConversion = require('../source/Manyfest-Conversion.js');

suite
(
	'Manyfest-Conversion: main export',
	() =>
	{
		test('exports all four service classes',
			() =>
			{
				libAssert.equal(typeof libManyfestConversion, 'object');
				libAssert.equal(typeof libManyfestConversion.MappingManyfestBuilder, 'function');
				libAssert.equal(typeof libManyfestConversion.PDFFormFiller, 'function');
				libAssert.equal(typeof libManyfestConversion.XLSXFormFiller, 'function');
				libAssert.equal(typeof libManyfestConversion.ConversionReport, 'function');
			});

		test('services instantiate on a standalone Pict fable',
			() =>
			{
				const tmpFable = new libPict();
				tmpFable.addServiceType('MappingManyfestBuilder', libManyfestConversion.MappingManyfestBuilder);
				tmpFable.addServiceType('PDFFormFiller', libManyfestConversion.PDFFormFiller);
				tmpFable.addServiceType('XLSXFormFiller', libManyfestConversion.XLSXFormFiller);
				tmpFable.addServiceType('ConversionReport', libManyfestConversion.ConversionReport);

				const tmpBuilder = tmpFable.instantiateServiceProvider('MappingManyfestBuilder');
				const tmpPDF = tmpFable.instantiateServiceProvider('PDFFormFiller');
				const tmpXLSX = tmpFable.instantiateServiceProvider('XLSXFormFiller');
				const tmpReport = tmpFable.instantiateServiceProvider('ConversionReport');

				libAssert.equal(typeof tmpBuilder, 'object');
				libAssert.equal(tmpBuilder.serviceType, 'MappingManyfestBuilder');
				libAssert.equal(tmpPDF.serviceType, 'PDFFormFiller');
				libAssert.equal(tmpXLSX.serviceType, 'XLSXFormFiller');
				libAssert.equal(tmpReport.serviceType, 'ConversionReport');
			});
	}
);
