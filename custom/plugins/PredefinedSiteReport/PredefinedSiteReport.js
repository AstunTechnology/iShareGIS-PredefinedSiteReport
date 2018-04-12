Astun.JS.Plugins.installDialog('predefinedSiteReportOutput', function($map, openlayers) {
	// pluginPath should be the path to where the predefinedSiteReport sits
	// and should not need to change, but this should be updated if it does
	var pluginPath = "custom/plugins/predefinedsitereport";

	// number of seconds before deciding that we aren't getting any results back
	var loadingTimeout = 60;

	// the layers defines what layers are included in the report for a mapsource
	/*
	   	Layer definition:
		~~~~~~~~~~~~~~~~~

		var layers = {
			"Astun/Default" : {
				"Wards_OGC" : {
					defaultName: "Wards",
					fields: [
						{ name: "ogc_fid", displayName: "Id" },
						{ name: "name",	displayName: "Name"	},
						{ name: "hectares",	displayName: "Area (hectares)" }
					],
					orderBy: {
						field: "hectares",
						sortOrder: "asc"
					}
				},
				"OtherLayer" : {
					...
				}
			},
			"OtherMapsource" : {
				...
			}
		};

		Astun/Default: 	Full Mapsource as shown in Studio in the
						"Map Source" > "My Maps" > "MapSource Name" field
		Wards_OGC:		The layer name as shown in Studio layer definition
		defaultName:	The name for the layer as shown in the report (optional)
		fields:			A list of the fields to show in the report. Any required
						fields must be included in the layer field output list
		ogc_fid:		The field name to display
		Id				The text to display for the field heading in the report
		orderBy:		The field to order the results by (optional)
		sortOrder:		The direction of the sort, either "asc" or "desc"
						(ascending if not specified)

		Important:
		~~~~~~~~~~

		As legacy layers don't return the actual field name, we need some other
		way to match them to the layers in our definition. To do this, rather than
		having the field name in the name attribute, you would have the display name.
		As you can see below, the display name from Studio has been entered in the
		name attribute, but you can still enter something different in the displayName
		and this will be used on the report.

		"Astun/WebTeam": {
			"wards": {
				fields: [
					{ name: "Ward name", displayName: "The Ward Name" },
					{ name: "Ward description", displayName: "Ward description" },
					{ name: "Ward code", displayName: "Ward code" }
				},
				orderBy: {
					field: "name"
				}
			}
		}

	*/

	var layers = {
		"Astun/Default" : {
			"Wards_OGC" : {
				displayName: "Wards Information",
				fields: [
					{ name: "ogc_fid", displayName: "Id" },
					{ name: "name",	displayName: "Name"	},
					{ name: "hectares",	displayName: "Area (hectares)" }
				],
				orderBy: {
					field: "hectares",
					sortOrder: "asc" // asc / desc
				}
			},
			"Parishes_OGC" : {
				displayName: "Parishes",
				fields: [
					{ name: "ogc_fid", displayName: "Id" },
					{ name: "name",	displayName: "Name"	}
				]
			},
			"Secondary_Schools_OGC": {
				displayName: "Secondary Schools",
				fields: [
					{ name: "establishment_name", displayName: "Name" },
					{ name: "capacity_numeric", displayName: "Capacity" },
					{ name: "gender_name", displayName: "Gender" }
				],
				orderBy: {
					field: "capacity_numeric",
					sortOrder: "desc"
				}
			}
		},
		"Astun/WebTeam": {
			"wards": {
				displayName: "Wards",
				fields: [
					{ name: "Ward name", displayName: "Ward Name" },
					{ name: "code", displayName: "Ward code" },
					{ name: "Ward description", displayName: "Ward description" }
				],
				orderBy: {
					field: "Ward name"
				}
			},
			"Wards_OGC": {
				displayName: "Wards (OGC)",
				fields: [
					{ name: "name", displayName: "Ward Name" },
					{ name: "area_code", displayName: "Ward code" },
					{ name: "descriptio", displayName: "Ward description" }
				],
				orderBy: {
					field: "name"
				}
			},
			"primary_schools": {
				displayName: "Primary Schools",
				fields: [
					{ name: "Name", displayName: "Name" }
				]
			},
			"secondary_schools": {
				displayName: "Secondary Schools",
				fields: [
					{ name: "Name", displayName: "Name" }
				]
			}
		}
	};

	if (!String.prototype.trim) {
		String.prototype.trim = function () {
			return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
		};
	}

	var $wrapper = jQuery('<div>').addClass('ishare-sitereport');
	var loading = 0;
	var loadingTimeoutId = null;

	// take a reference to the layers
	var layersBackup = layers

	// add a clone function to the backup
	layersBackup['clone'] = function() {
		var dest = {};
		for (var ms in layersBackup) {
			if (!layersBackup.hasOwnProperty(ms)) { continue; }
			dest[ms] = {};

			for (var l in layersBackup[ms]) {
				if (!layersBackup[ms].hasOwnProperty(l)) { continue; }

				dest[ms][l] = {
					fields: []
				};

				if (layersBackup[ms][l].displayName) {
					dest[ms][l].displayName = layersBackup[ms][l].displayName;
				}

				for (var f = 0; f < layersBackup[ms][l].fields.length; f++) {
					dest[ms][l].fields[f] = {
						'name': '' + layersBackup[ms][l].fields[f].name,
						'displayName': '' + layersBackup[ms][l].fields[f].displayName
					};
				}

				if (layersBackup[ms][l].orderBy) {
					dest[ms][l]["orderBy"] = {
						'field': '' + layersBackup[ms][l].orderBy.field
					};

					if (layersBackup[ms][l].orderBy.sortOrder) {
						dest[ms][l].orderBy['sortOrder'] = layersBackup[ms][l].orderBy.sortOrder;
					}
				}
			}
		}

		return dest;
	};

	// clone the backup over the original to break the reference
	layers = layersBackup.clone();

	// https://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric
	function isNumeric(value) {
		return !isNaN(value - parseFloat(value));
	}

	function getData(mapsource, layer, response) {
		var data = [];
		var b = layersBackup;

		// legacy layers don't return a field list, so we need to generate one
		if (typeof response.properties.fields === 'undefined') {
			response.properties.fields = {};
			for (var i = 0; i < layers[mapsource][layer]['fields'].length; i++) {
				for (var f in response.features[0].properties.fields) {
					var sanitisedName = f.replace(/_{1,}/gi, ' ').trim();
					if (layers[mapsource][layer]['fields'][i].name.toLowerCase() === sanitisedName.toLowerCase()) {
						layers[mapsource][layer]['fields'][i].name = f;

						console.log('Renaming field "' + sanitisedName + '" to "' + f + '"');

						if (layers[mapsource][layer]['orderBy'] && layers[mapsource][layer]['orderBy'].field) {
							if (layers[mapsource][layer]['orderBy'].field === sanitisedName) {
								layers[mapsource][layer]['orderBy'].field = f;
							}
						}

						response.properties.fields[f] = {
							'name': f,
							'displayName': layers[mapsource][layer]['fields'][i].displayName
						};

						console.log('Set defintion for "' + f + '"');
					}
				}
			}
		}

		// populate the fields
		for (var feature = 0; feature < response.features.length; feature++) {
			var row = {},
				rename = [];

			for (var field in response.properties.fields) {
				if (!response.properties.fields.hasOwnProperty(field)) { continue; }

				row[field] = {
					name: field,
					displayName: response.properties.fields[field].displayName,
					value: response.features[feature].properties.fields[field],
					sortValue: ("" + response.features[feature].properties.fields[field]).toLowerCase(),
					link: response.features[feature].properties.links[field]
				};
			}
			data.push(row);
		}

		return data;
	}

	function parseValues(data) {
		for (var feature = 0; feature < data.length; feature++) {
			for (var field in data[feature]) {
				if (!data[feature].hasOwnProperty(field)) { continue; }

				var value = data[feature][field].sortValue;

				if (isNumeric(value)) {
					if ((""+ value).toString().indexOf(".") > -1) {
						data[feature][field].sortValue = parseFloat(value);
					} else {
						data[feature][field].sortValue = parseInt(value);
					}
				}
			}
		}

		return data;
	}

	function sortData(layer, data) {
		if (data.length < 2 || !layer.orderBy || !layer.orderBy.field) {
			return data;
		}

		// change the sort order depending on what's defined in the layer description
		var gt = 1, lt = -1;
		if (layer.orderBy.sortOrder && layer.orderBy.sortOrder.toLowerCase() === 'desc') {
			gt = -1;
			lt = 1;
		}

		data.sort(function(a, b) {
			if (a[layer.orderBy.field].sortValue > b[layer.orderBy.field].sortValue) {
				return gt;
			} else if (a[layer.orderBy.field].sortValue < b[layer.orderBy.field].sortValue) {
				return lt;
			} else {
				return 0;
			}
		});

		return data
	}

	return {
		'$downloadLinks': [],
		'uid': 'createPredefinedSiteReport',
		'content': $wrapper,
		'onOpen': function($box, $inner) {
			$wrapper.empty();
			layers = layersBackup.clone();

			var $mapContainer = jQuery('<div>')
				.attr('class', 'sitereport-mapcontainer');

			var formText = '';
			formText += '<form id="predefinedsitereport-form" method="POST" action="GetOWS.ashx" encType="multipart/form-data">';
			formText += '<input type="hidden" id="VERSION" name="VERSION" value="1.0.0" />';
			formText += '<input type="hidden" id="SERVICE" name="SERVICE" value="WFS" />';
			formText += '<input type="hidden" id="REQUEST" name="REQUEST" value="GetFeature" />';
			formText += '<input type="hidden" id="OUTPUTFORMAT" name="OUTPUTFORMAT" value="csv" />';
			formText += '<input type="hidden" id="RequestType" name="RequestType" value="Table" />';
			formText += '<input type="hidden" id="TYPENAME" name="TYPENAME" value="" />';
			formText += '<input type="hidden" id="FILTER" name="FILTER" value="" />';
			formText += '<input type="hidden" id="PropertyName" name="PropertyName" value="" />';

			for (var mapSource in layers) {
				if (!layers.hasOwnProperty(mapSource)) { continue; }
				if (astun.mapWrapper.mapSource.mapName.toLowerCase() !== mapSource.toLowerCase()) { continue; }
				for (var layer in layers[mapSource]) {
					if (!layers[mapSource].hasOwnProperty(layer)) { continue; }

					formText += '<div data-loaded="false" data-error="false" data-layer-name="' + layer.toLowerCase() + '" class="layer page-break"></div>';
				}
			}

			formText += "</form>";
			var $form = jQuery(formText);
			$form.find(".page-break:last").removeClass('page-break');

			$mapContainer.append($form);

			jQuery('<div id="print"><a href="#" title="Print the report"><span>Print</span></a></div>')
				.appendTo($mapContainer)
				.click(this.print.bind(this));
			jQuery('<div id="please-wait"><div><span>Please wait</span></div></div>')
				.appendTo($mapContainer);

			$wrapper.append($mapContainer);

			//$wrapper.addCSS();

			var bounds = '';

			if (astun.mapWrapper.scratchLayer.selectedFeatures.length === 0 || astun.mapWrapper.scratchLayer.selectedFeatures[0].geometry.id.indexOf('Polygon') === -1) {
				bounds = this.createExtentsString(astun.mapWrapper.map.getExtent());
			} else {
				bounds = new OpenLayers.Format.WKT().write(astun.mapWrapper.scratchLayer.selectedFeatures[0]);
			}

			var requestMade = false;
			loading = 0;
			for (var mapSource in layers) {
				if (!layers.hasOwnProperty(mapSource)) { continue; }
				if (astun.mapWrapper.mapSource.mapName.toLowerCase() !== mapSource.toLowerCase()) { continue; }

				var layerNames = [];
				for (var layerName in layers[mapSource]) {
					layerNames.push( layerName );
				}

				loading = layerNames.length;
				astun.mapWrapper.getMapMultiInfo(bounds, 5000, 'shapeInfo', this.responseReceived.bind(this), { 'layers': layerNames, 'individualResponses': true });
			}

			loadingTimeoutId = window.setTimeout(this.timedOut.bind(this), loadingTimeout * 1000);
		},
		'onClose': function($box, $inner) {
			for (var i = 0; i < this.$downloadLinks.length; i++) {
				this.$downloadLinks[i].unbind('click', this.downloadCSV);
			}

			this.$downloadLinks = [];
		},
		'cancelButton': Astun.lang.common.closeLabel,
		'createExtentsString': function(extents) {
			var str = 'POLYGON(([left] [top],[right] [top],[right] [bottom],[left] [bottom],[left] [top]))';
			str = str.replace(/\[left\]/gi, extents.left);
			str = str.replace(/\[top\]/gi, extents.top);
			str = str.replace(/\[right\]/gi, extents.right);
			str = str.replace(/\[bottom\]/gi, extents.bottom);
			return str;
		},
		'responseReceived': function(response, $mapWrapper) {
			loading--;
			if (loading <= 0) {
				jQuery('#please-wait').addClass('disabled');
				window.clearTimeout(this.loadingTimeoutId);
			}

			if (!response || response === null || response.unexpectedResponse || response.error)
				return;

			// make sure the response has a properties.layerName property
			if (typeof response[0].properties === 'undefined' || typeof response[0].properties.layerName !== 'string') { return; }
			var resultLayerName = response[0].properties.layerName;
			var mapSource = astun.mapWrapper.mapSource.mapName;
			var displayName = layers[mapSource][resultLayerName].displayName ?
				layers[mapSource][resultLayerName].displayName : response[0].properties.layer;

			var downloadLink = '<a href="#" onclick="return false;" src="" title="Download the data as a CSV file" class="download"><span>Download dataset as CSV</span></a>',
				$table = jQuery("<table>").attr('width', '100%').attr('id', 'sr-' + response[0].properties.layer),
				$caption = jQuery('<caption>' + displayName + '</caption>'),
				$headerRow = jQuery('<tr>'),
				filterGeom = null,
				filterObj = null,
				filterNode = null,
				filter = null;

			if (!layers[mapSource]) { return; }

			$table.append($caption);

			if (astun.mapWrapper.scratchLayer.selectedFeatures.length === 0) {
				filterGeom = new OpenLayers.Format.WKT().read(this.createExtentsString(astun.mapWrapper.map.getExtent())).geometry;
			} else {
				filterGeom = astun.mapWrapper.scratchLayer.selectedFeatures[0].geometry;
			}

			filterObj = new OpenLayers.Filter.Spatial({
				type: OpenLayers.Filter.Spatial.INTERSECTS,
				value: filterGeom
			});
			filterNode = new OpenLayers.Format.Filter({version:'1.0.0'}).write(filterObj);
			var filter = new OpenLayers.Format.XML().write(filterNode);

			// make sure we want this layer in the results
			if (typeof layers[mapSource][resultLayerName] === 'undefined') { return; }

			this.$downloadLinks.push(jQuery(downloadLink).click({
						layerName: resultLayerName,
						mapsource: astun.mapWrapper.mapSource.mapName,
						filter: filter,
						layerDefinition: layers[mapSource][resultLayerName]
					},
					this.downloadCSV
				)
			);

			// uncomment the line below to enable CSV download links
			// $caption.append(this.$downloadLinks[this.$downloadLinks.length -1]);

			var data = getData(mapSource, resultLayerName, response[0])
			var layerDefinition = layers[mapSource][resultLayerName];
			data = parseValues(data);
			data = sortData(layerDefinition, data);

			// output the table headers
			for (var i = 0; i < layerDefinition.fields.length; i++) {
				var field = layerDefinition.fields[i].name;

				// is the field included in the definition, if not skip it
				if (typeof (data[0][field]) === 'undefined') { continue; }

				jQuery('<th>' + layerDefinition.fields[i].displayName + '</th>')
					.appendTo($headerRow);
			}
			$headerRow.appendTo($table);

			for (var feature = 0; feature < data.length; feature++) {
				var $dataRow = jQuery('<tr>');

				for (var i = 0; i < layerDefinition.fields.length; i++) {
					var field = layerDefinition.fields[i].name;

					// is the field included in the definition, if not skip it
					if (typeof data[feature][field] === 'undefined') { continue; }

					if (data[feature][field].link && data[feature][field].link !== '') {
						var url = data[feature][field].link;
						if (url.substr(0, 4).toLowerCase() !== 'http') {
							url = 'http://' + url;
						}
						jQuery('<td><a href="' + url + '">' + data[feature][field].value + '</a></td>')
							.appendTo($dataRow);
					} else {
						jQuery('<td>' + data[feature][field].value + '</td>')
							.appendTo($dataRow);
					}
				}

				$dataRow.appendTo($table);

				jQuery('#createPredefinedSiteReport').find('[data-layer-name="' + resultLayerName + '"]').data('layers', null);
			}

			var $form = jQuery('#predefinedsitereport-form');
			var $parent = jQuery('#predefinedsitereport-form div[data-layer-name="' + resultLayerName.toLowerCase() + '"]');
			$parent.empty();
			$parent.attr('data-loaded', 'true');
			$parent.append($table);
			$wrapper.append($form);
		},
		'timedOut': function() {
			jQuery('#please-wait').addClass('disabled');
			var $layers = jQuery('div.layer[data-loaded="false"][data-error="false"]');
			var mapSource = astun.mapWrapper.mapSource.mapName;
			var layerNames = Object.keys(layers[mapSource]);

			for (var i = 0; i < $layers.length; i++) {
				var $layer = jQuery($layers[i]);
				var layerName = $layer.attr('data-layer-name');
				for (var j = 0; j < layerNames.length; j++) {
					if (layerName.toLowerCase() === layerNames[j].toLowerCase()) {
						layerName = layerNames[j];
						break;
					}
				}

				if (typeof layers[mapSource][layerName] === 'undefined') { return; }

				var displayName = layers[mapSource][layerName].displayName ?
					layers[mapSource][layerName].displayName : layerName;
				$layer.append('<table width="100%"><tr><td>No results found for this layer</td></tr><caption>' + displayName + '</caption>');
				$layer.attr('data-error', 'true');
			}
		},
		'print': function(ev) {
			var tab = window.open('', '_blank');
			var $head = jQuery(tab.document.head);
			var $body = jQuery(tab.document.body);
			window.focus();

			var path = document.location.href;
			if (path.toLowerCase().indexOf('.aspx') > -1) {
				var parts = path.split('/');
				parts.pop();
				path = parts.join('/') + '/';
			}

			$head.append('<base href="' + path + '" />');
			$head.append('<link href="' + pluginPath + '/predefinedsitereport.css?ts=' + new Date().getTime() + '" rel="stylesheet" type="text/css" />');
			var content = jQuery('#predefinedsitereport-form').html();
			$body.append('<div id="createPredefinedSiteReport">' + content + '</div>');

			// setTimeout needs to be called from the parent window for IE,
			// but from the child for everything else
			var root = (this.detectIE() ===  false) ? tab : window;
			root.setTimeout(function() {
				tab.print();
				tab.close();
			}.bind(this), 500);

			console.log('printing...');


			return false;
		},
		'downloadCSV': function(ev) {
			jQuery('#predefinedsitereport-form').attr('action', 'getows.ashx?MAPSOURCE=' + ev.data.mapsource);
			jQuery('#predefinedsitereport-form #TYPENAME').val(ev.data.layerName);
			jQuery('#predefinedsitereport-form #FILTER').val(ev.data.filter);

			var fields = [];
			for (var field in ev.data.layerDefinition.fields) {
				if (!ev.data.layerDefinition.fields.hasOwnProperty(field)) { continue; }
				fields.push(field);
			}
			jQuery('#predefinedsitereport-form #PropertyName').val(fields.join());

			var form = document.getElementById('predefinedsitereport-form');
			form.submit();
		},
		'detectIE': function() {
			var ua = window.navigator.userAgent;

			// Test values; Uncomment to check result …

			// IE 10
			// ua = 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)';

			// IE 11
			// ua = 'Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko';

			// Edge 12 (Spartan)
			// ua = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36 Edge/12.0';

			// Edge 13
			// ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Safari/537.36 Edge/13.10586';

			var msie = ua.indexOf('MSIE ');
			if (msie > 0) {
				// IE 10 or older => return version number
				return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
			}

			var trident = ua.indexOf('Trident/');
			if (trident > 0) {
				// IE 11 => return version number
				var rv = ua.indexOf('rv:');
				return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
			}

			var edge = ua.indexOf('Edge/');
			if (edge > 0) {
				// Edge (IE 12+) => return version number
				return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
			}

			// other browser
			return false;
		}
	};
});

Astun.JS.Plugins.installButton(
	{
		name: 'predefinedSiteReport',
		type: 'modaldialog',
		dialog: Astun.JS.Plugins.dialogs.predefinedSiteReportOutput,
		hideOnEmptyDialog: false,
		text: 'Predefined Site Report',
		tooltip: 'Activate the Predefined Site Report',
		tooltipTitle: 'Predefined Site Report'
	}
);
