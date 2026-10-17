// Puente JS del plugin nativo "Alarma" (Sistema Integrado)
// Sigue el mismo formato que generan los plugins de Capacitor.
var alarmaExports = (function (exports, core) {
	'use strict';

	const Alarma = core.registerPlugin('Alarma', {});

	exports.Alarma = Alarma;

	return exports;

})({}, capacitorExports);
