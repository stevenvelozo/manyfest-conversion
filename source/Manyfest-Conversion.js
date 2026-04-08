const libMappingManyfestBuilder = require('./services/Service-MappingManyfestBuilder.js');
const libPDFFormFiller = require('./services/Service-PDFFormFiller.js');
const libXLSXFormFiller = require('./services/Service-XLSXFormFiller.js');
const libConversionReport = require('./services/Service-ConversionReport.js');

module.exports = (
	{
		MappingManyfestBuilder: libMappingManyfestBuilder,
		PDFFormFiller: libPDFFormFiller,
		XLSXFormFiller: libXLSXFormFiller,
		ConversionReport: libConversionReport
	});
