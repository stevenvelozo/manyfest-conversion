const Chai = require('chai');
const Expect = Chai.expect;

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
				Expect(libManyfestConversion).to.be.an('object');
				Expect(libManyfestConversion.MappingManyfestBuilder).to.be.a('function');
				Expect(libManyfestConversion.PDFFormFiller).to.be.a('function');
				Expect(libManyfestConversion.XLSXFormFiller).to.be.a('function');
				Expect(libManyfestConversion.ConversionReport).to.be.a('function');
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

				Expect(tmpBuilder).to.be.an('object');
				Expect(tmpBuilder.serviceType).to.equal('MappingManyfestBuilder');
				Expect(tmpPDF.serviceType).to.equal('PDFFormFiller');
				Expect(tmpXLSX.serviceType).to.equal('XLSXFormFiller');
				Expect(tmpReport.serviceType).to.equal('ConversionReport');
			});
	}
);
