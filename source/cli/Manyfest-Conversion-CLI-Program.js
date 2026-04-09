const libCLIProgram = require('pict-service-commandlineutility');

let _PictCLIProgram = new libCLIProgram(
	{
		Product: 'Manyfest-Conversion-CLI',
		Version: require('../../package.json').version,

		Command: 'manyfest-conversion',
		Description: 'Build mapping manyfests from CSVs, then fill PDFs and XLSX workbooks from platform JSON.',

		DefaultProgramConfiguration: require('./Default-Manyfest-Conversion-Configuration.json'),

		ProgramConfigurationFileName: '.manyfest-conversion.config.json',
		AutoGatherProgramConfiguration: true,
		AutoAddConfigurationExplanationCommand: true
	},
	[
		require('./commands/Manyfest-Conversion-Command-ExtractFields.js'),
		require('./commands/Manyfest-Conversion-Command-BuildMappings.js'),
		require('./commands/Manyfest-Conversion-Command-FillPDF.js'),
		require('./commands/Manyfest-Conversion-Command-FillXLSX.js'),
		require('./commands/Manyfest-Conversion-Command-ConvertBatch.js')
	]);

_PictCLIProgram.instantiateServiceProvider('FilePersistence');
_PictCLIProgram.instantiateServiceProvider('CSVParser');

module.exports = _PictCLIProgram;
