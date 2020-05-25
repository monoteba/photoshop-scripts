// todo: use global object
// todo: make script work with unsaved documents
// todo: enumerate layers with identical names

/*
MIT License

Copyright (c) 2020 Morten Andersen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

#target photoshop

const kOptions = 
{
	NAME: "ExportLayers_k41d8godw",
	FILENAME: app.stringIDToTypeID("Filename"),
	NOCOLOR: app.stringIDToTypeID("NoColor"),
	RED: app.stringIDToTypeID("Red"),
	ORANGE: app.stringIDToTypeID("Orange"),
	YELLOW: app.stringIDToTypeID("Yellow"),
	GREEN: app.stringIDToTypeID("Green"),
	BLUE: app.stringIDToTypeID("Blue"),
	VIOLET: app.stringIDToTypeID("Violet"),
	GRAY: app.stringIDToTypeID("Gray"),
	HIDDEN: app.stringIDToTypeID("Hidden"),
	EXPORTLAYERS: app.stringIDToTypeID("ExportLayers"),
	EXPORTGROUPS: app.stringIDToTypeID("ExportGroups"),
	TRIM: app.stringIDToTypeID("Trim"),
	ADJUSTMENTLAYER: app.stringIDToTypeID("AdjustmentLayer"),
	CHILDREN: app.stringIDToTypeID("Children"),
	FORMAT: app.stringIDToTypeID("Format"),
	GROUPDIVIDER: app.stringIDToTypeID("GroupDivider"),
	BACKGROUND: app.stringIDToTypeID("Background"),
}

// global object
var g = {
	doc: null,
	docName: "",
	targetLayers: [],
	options: [],
	outputPath: "",
	layerColors: ["No Color", "Red", "Orange", "Yellow", "Green", "Blue", "Violet", "Gray"],
};

function main(options)
{
	// Test if file has ever been saved
	try
	{
		app.activeDocument.path;
	}
	catch (err)
	{
		alert("Script could not execute :/\n" + err);
		return;
	}

	// Store original document name
	var docName = getDocumentName(app.activeDocument);

	// Get current document path
	var fname = app.activeDocument.fullName.toString()
	var path = fname.substring(0, fname.lastIndexOf("/"));

	// Ask for folder to save images to
	var outputPath = Folder(path).selectDlg("Select Save Folder");

	if (outputPath == null)
	{
		return;
	}

	path = outputPath;

	// Duplicate the active document
	app.activeDocument = app.activeDocument.duplicate();

	var doc = app.activeDocument;
	var targetLayers = []

	// Find all layers ordered by top to bottom, except adjustment layers
	for (var i = 0; i < doc.layers.length; i++)
	{
		// Ignore adjustment layers
		if (isAdjustment(doc.layers[i]) === false)
		{
			targetLayers.push(doc.layers[i]);

			// Find all child layers
			if (options.children)
			{
				var childLayers = [];
				findChildLayers(doc.layers[i], childLayers);

				// Add all children to the list of layers
				for (var j = 0; j < childLayers.length; j++)
				{
					// Ignore adjustment layers
					if (isAdjustment(childLayers[j]) === false)
					{
						targetLayers.push(childLayers[j]);
					}
				}
			}
		}
	}

	var s = "Layers:\n";
	for (var i = 0; i < targetLayers.length; i++)
	{
		s += targetLayers[i].name + "\n";
	}
	alert(s);
	return;

	// Filter out empty groups
	for (var i = targetLayers.length - 1; i >= 0; i--)
	{
		if (isEmptyGroup(targetLayers[i]))
		{
			targetLayers.splice(i, 1);
		}
	}

	// Filter out layers
	if (options.layers === false)
	{
		for (var i = targetLayers.length - 1; i >= 0; i--)
		{
			if (targetLayers[i].typename === "ArtLayer")
			{
				targetLayers.splice(i, 1);
			}
		}
	}

	// Filter out groups
	if (options.groups === false)
	{
		for (var i = targetLayers.length - 1; i >= 0; i--)
		{
			if (targetLayers[i].typename === "LayerSet")
			{
				targetLayers.splice(i, 1);
			}
		}
	}

	// Filter out colors
	var colors = ["No Color", "Red", "Orange", "Yellow", "Green", "Blue", "Violet", "Gray"];
	var colorOptions = [options.noColor, options.red, options.orange, options.yellow, options.green, options.blue, options.violet, options.gray];

	for (var i = colors.length - 1; i >= 0; i--)
	{
		if (colorOptions[i] === false)
		{
			colors.splice(i, 1);
		}
	}

	if (colors.length === 0)
	{
		targetLayers = [];
	}

	for (var i = targetLayers.length - 1; i >= 0; i--)
	{
		if (layerInColors(targetLayers[i], colors) === false)
		{
			targetLayers.splice(i, 1);
		}
	}

	// Filter out hidden layers
	if (options.hidden === false)
	{
		for (var i = targetLayers.length - 1; i >= 0; i--)
		{
			if (visibleInHierarchy(targetLayers[i]) === false)
			{
				targetLayers.splice(i, 1);
			}
		}
	}

	// Filter out background layer
	for (var i = 0; i < targetLayers.length; i++)
	{
		if (targetLayers[i].isBackgroundLayer)
		{
			if (options.background === false)
			{
				targetLayers[i].isBackgroundLayer = false;
				targetLayers[i].name = "Background";
			}
			else
			{
				targetLayers.splice(i, 1);
			}
			break;
		}
	}

	// Create list of layers visibility state
	var visibleLayerDict = {}
	var allLayers = getAllLayers(doc, true);
	for (var i = 0; i < allLayers.length; i++)
	{
		visibleLayerDict[allLayers[i].id] = allLayers[i].visible;
	}

	// Exit if there are zero layers to export
	if (targetLayers.length === 0)
	{
		alert("No layers to export");
		doc.close(SaveOptions.DONOTSAVECHANGES);
		return;
	}

	// Determine divider
	var groupDivider = "";
	switch (options.divider)
	{
		case "Space":
			groupDivider = " ";
			break;
		case "Dash":
			groupDivider = "-";
			break;
		case "Underscore":
			groupDivider = "_";
			break;
		case "Period":
			groupDivider = ".";
			break;
	}

	// Make a dry run to see if any files already exists
	for (var i = 0; i < targetLayers.length; i++)
	{
		var filename = resolveName(options.filename, docName, targetLayers[i], groupDivider);
		var result = saveFile(doc, path, filename, options.format, true);
		if (result === false)
		{
			return;
		}
		else if (result === true)
		{
			break;
		}
	}

	progress(targetLayers.length);

	// Loop over each target layer and save the png
	for (var i = 0; i < targetLayers.length; i++)
	{
		progress.increment();

		// Save history state before proceeding
		var savedState = doc.activeHistoryState;

		// Begin by hiding all layers
		hideAllLayers(doc, !options.adjustments);

		// Make the layer visible within its hierarchy
		showInHierarchy(targetLayers[i]);

		var children = [];
		findChildLayers(targetLayers[i], children);

		if (options.hidden === false)
		{
			// Show children below in hierarchy that was previously visible
			for (var j = 0; j < children.length; j++)
			{
				children[j].visible = visibleLayerDict[children[j].id];
			}
		}
		else
		{
			// If the layer is a group, show all children with a matching color tag
			for (var j = 0; j < children.length; j++)
			{
				if (children[j].typename === "LayerSet" || layerInColors(children[j], colors))
				{
					children[j].visible = true;
				}
			}
		}

		if (options.trim)
		{
			doc.trim(TrimType.TRANSPARENT);
		}

		// Save!
		try
		{
			var filename = resolveName(options.filename, docName, targetLayers[i], groupDivider);
			saveFile(doc, path, filename, options.format, false);
		}
		catch (err)
		{
			alert("Save error " + err);
		}

		// Restore history
		doc.activeHistoryState = savedState;
	}

	progress.close();

	// Close the duplicated document
	doc.close(SaveOptions.DONOTSAVECHANGES);
}

// Get a list of all layers in the document
function getAllLayers(doc, includeAdjustmentLayers)
{
	var allLayers = [];

	for (var i = 0; i < doc.layers.length; i++)
	{
		if (includeAdjustmentLayers || isAdjustment(doc.layers[i]) === false)
		{
			allLayers.push(doc.layers[i]);
		}
	}

	// Find all child layers
	var childLayers = [];
	for (var i = 0; i < allLayers.length; i++)
	{
		findChildLayers(allLayers[i], childLayers);
	}

	// Add all children to the list of layers
	for (var i = 0; i < childLayers.length; i++)
	{
		if (includeAdjustmentLayers || isAdjustment(childLayers[i]) === false)
		{
			allLayers.push(childLayers[i]);
		}
	}

	return allLayers;
}

// Utility function to find all child layers of a given layer
function findChildLayers(layer, layers)
{
	if (layer.layers !== undefined && layer.layers.length !== 0)
	{
		for (var i = 0; i < layer.layers.length; i++)
		{
			if (layer.layers[i] !== undefined)
			{
				layers.push(layer.layers[i]);
				findChildLayers(layer.layers[i], layers);
			}
		}
	}
	else
	{
		return;
	}
}

// Hide all layers and groups in the document
function hideAllLayers(doc, includeAdjustmentLayers, background)
{
	var layers = getAllLayers(doc, includeAdjustmentLayers);
	for (var i = 0; i < layers.length; i++)
	{
		if (layers[i].isBackgroundLayer === false)
		{
			layers[i].visible = false;
		}
	}
}

// Show the given layer within its hierarchy
function showInHierarchy(layer)
{
	layer.visible = true;
	var current = layer.parent;
	while (current.typename === "LayerSet")
	{
		current.visible = true;
		current = current.parent;
	}
}

// Determine if a given layer is visible at all
function visibleInHierarchy(layer)
{
	if (layer.visible === false)
	{
		return false;
	}

	var current = layer.parent;
	while (current.typename === "LayerSet")
	{
		if (current.visible === true)
		{
			current = current.parent;
		}
		else
		{
			return false;
		}
	}

	return true;
}

// Determine if a given layer is in an array of color tags
function layerInColors(layer, colors)
{
	for (var j = 0; j < colors.length; j++)
	{
		if (getLayerColorByID(layer.id) === colors[j])
		{
			return true;
		}
	}

	return false;
}

// Get the name of a given document without the extension
function getDocumentName(doc)
{
	// Get original document name without extension
	var docName = doc.name.toString();
	var dotPos = docName.lastIndexOf(".");
	if (dotPos > -1)
	{
		docName = docName.substr(0, dotPos);
	}

	return docName;
}

// Get the layer"s color tag as a string from the ID
function getLayerColorByID(id)
{
	// Use ActionReference to get the layer color value
	var ref = new ActionReference();
	ref.putProperty(charIDToTypeID("Prpr") ,stringIDToTypeID("color"));
	ref.putIdentifier(charIDToTypeID("Lyr "), id);
	var colorName = typeIDToStringID(executeActionGet(ref).getEnumerationValue(stringIDToTypeID("color")));

	// Return the color name as shown in Photoshop
	switch (colorName)
	{
		case "none":
			return "No Color";
		case "red":
			return "Red";
		case "yellowColor":
			return "Yellow";
		case "orange":
			return "Orange";
		case "grain":
			return "Green";
		case "blue":
			return "Blue";
		case "violet":
			return "Violet";
		case "gray":
			return "Gray";
	}
}

// Check if a layer is an empty group
function isEmptyGroup(layer)
{
	if (layer.typename === "LayerSet")
	{
		if (layer.layers.length == 0)
		{
			return true;
		}
	}

	return false;
}

// Check if a layer is an adjustment layer
function isAdjustment(layer)
{
	if (layer.typename === "LayerSet")
	{
		return false;
	}

	switch (layer.kind)
	{
		case LayerKind.NORMAL:
		case LayerKind.LAYER3D:
		case LayerKind.SMARTOBJECT:
		case LayerKind.TEXT:
		case LayerKind.VIDEO:
			return false;
		default:
			return true;
	}
}

// Resolve special naming
function resolveName(filename, docName, layer, groupDivider)
{
	var sourcePattern = "{doc}";
	var groupPattern = "{group}";
	var layerPattern = "{layer}";

	var result = filename;
	result = result.replace(sourcePattern, docName);
	result = result.replace(layerPattern, layer.name);

	var groupIndex = filename.indexOf(groupPattern);

	if (groupIndex !== -1)
	{
		// collect layer patterns
		var groupNames = [];
		var current = layer.parent;
		while (current.typename === "LayerSet")
		{
			groupNames.push(current.name);
			current = current.parent;
		}

		if (groupNames.length > 0)
		{
			// create group string
			var groups = "";
			for (var i = groupNames.length - 1; i >= 0 ; i--)
			{
				groups += groupNames[i] + groupDivider;
			}

			// replace groupPattern
			result = result.replace(groupPattern, groups);
		}
		else
		{
			// just remove the group pattern
			result = result.replace(groupPattern, "");
		}
	}

	return result;
}

// Save a PNG given a document, path, filename and name
// The function can do a dry run, where no files are saved
function saveFile(doc, path, filename, format, dryrun)
{
	var ext = "";
	switch (format)
	{
		case "PNG":
			ext = "png";
			break;
		case "JPG":
			ext = "jpg";
			break;
		case "TIFF":
			ext = "tif";
			break;
		case "PSD":
			ext = "psd";
			break;
	}

	// Create new file object
	var file = new File(path + "/" + filename + "." + ext);

	if (dryrun)
	{
		if (file.exists)
		{
			return confirm("One or more files already exists. Do you want to overwrite them?", true, "Overwrite Existing?");
		}

		return;
	}

	var options = undefined;
	if (format === "PNG")
	{
		options = new PNGSaveOptions();
		options.compression = 5; // 0-9
		options.interlaced = false;
	}
	else if (format === "JPG")
	{
		options = new JPEGSaveOptions();
		options.embedColorProfile = true;
		options.quality = 10;
		options.formatOptions = FormatOptions.STANDARDBASELINE;
	}
	else if (format === "TIFF")
	{
		options = new TiffSaveOptions();
		options.byteOrder = ByteOrder.IBM;
		options.embedColorProfile = true;
		options.imageCompression = TIFFEncoding.TIFFLZW;
		options.interleaveChannels = true;
		options.layers = false;
		options.transparency = true;
	}
	else if (format === "PSD")
	{
		options = new PhotoshopSaveOptions();
		options.alphaChannels = true;
		options.embedColorProfile = true;
		options.layers = false;
	}

	doc.saveAs(file, options, true);
	return true;
}

// Show the dialog window with options
function showDialog()
{
	// Exit if no documents are open
	if (app.documents.length == false)
		return;

	var settings = loadSettings();

	var win = new Window("dialog", "Export Layers And Groups To Files", undefined, {resizeable: false});
	win.orientation = "column";
	win.alignChildren = "fill";

	var wrapper = win.add("group");
	wrapper.orientation = "row";
	wrapper.alignChildren = "top";

	var leftColumn = wrapper.add("group");
	leftColumn.orientation = "column";
	leftColumn.alignChildren = "fill";

	var rightColumn = wrapper.add("group");
	rightColumn.orientation = "column";
	rightColumn.alignChildren = "fill";

	// filename
	var filenamePanel = leftColumn.add("panel", undefined, "Filename", {borderStyle: "etched"});
	filenamePanel.orientation = "column";
	filenamePanel.alignChildren = "fill";

	var filename = filenamePanel.add("edittext");
	filename.preferredSize.width = 300;
	filename.text = settings.filename;

	var groupDivider = filenamePanel.add("panel", undefined, "Group Divider", {borderStyle: "etched"});
	groupDivider.orientation = "row";

	var dividers = ["Nothing", "Space", "Dash", "Underscore", "Period"];
	var dividerRadiobuttons = [];

	for (var i = 0; i < dividers.length;i ++)
	{
		dividerRadiobuttons[i] = groupDivider.add("radiobutton", undefined, dividers[i]);
		if (dividers[i] === settings.divider)
		{
			dividerRadiobuttons[i].value = true;
		}
	}

	// format
	var formatPanel = leftColumn.add("panel", undefined, "File Format", {borderStyle: "etched"});
	formatPanel.orientation = "row";
	formatPanel.alignChildren = "left";

	switch (app.activeDocument.bitsPerChannel)
	{
		case BitsPerChannelType.EIGHT:
			var formats = ["PNG", "JPG", "TIFF", "PSD"];
			break;
		case BitsPerChannelType.SIXTEEN:
			var formats = ["PNG", "JPG", "TIFF", "PSD"];
			break;
		case BitsPerChannelType.THIRTYTWO:
			var formats = ["TIFF", "PSD"];
			break;
	}

	var formatRadiobuttons = [];
	var formatSet = false;
	for (var i = 0; i < formats.length; i++)
	{
		formatRadiobuttons.push(formatPanel.add("radiobutton", undefined, formats[i]));
		if (formats[i] === settings.format)
		{
			formatRadiobuttons[i].value = true;
			formatSet = true;
		}
	}

	if (formatSet === false)
	{
		formatRadiobuttons[0].value = true;
	}

	// help
	var helpPanel = leftColumn.add("panel", undefined, "Notes", { borderStyle: "etched" });
	helpPanel.orientation = "column";
	helpPanel.alignChildren = "fill";

	helpPanel.add("statictext", undefined, "{doc}, {group} and {layer} can be used in the filename to insert the document name, group names and layer name.", {multiline: true});
	helpPanel.add("statictext", undefined, "Please make sure that layers and groups have unique names, as they will otherwise overwrite each other.", {multiline: true});

	// layer colors
	var colorPanel = rightColumn.add("panel", undefined, "Layer Colors", { borderStyle: "etched" });
	colorPanel.orientation = "row";
	colorPanel.alignChildren = "top";

	var colorGroup1 = colorPanel.add("group");
	colorGroup1.orientation = "column";
	colorGroup1.alignChildren = "left";
	colorGroup1.minimumSize = [120, 0];

	var colorGroup2 = colorPanel.add("group");
	colorGroup2.orientation = "column";
	colorGroup2.alignChildren = "left";
	colorGroup2.minimumSize = [120, 0];

	var noColor = colorGroup1.add("checkbox", undefined, "No Color");
	var red = colorGroup1.add("checkbox", undefined, "Red");
	var yellow = colorGroup1.add("checkbox", undefined, "Yellow");
	var orange = colorGroup1.add("checkbox", undefined, "Orange");
	var green = colorGroup2.add("checkbox", undefined, "Green");
	var blue = colorGroup2.add("checkbox", undefined, "Blue");
	var violet = colorGroup2.add("checkbox", undefined, "Violet");
	var gray = colorGroup2.add("checkbox", undefined, "Gray");

	noColor.value = settings.noColor;
	red.value = settings.red;
	yellow.value = settings.yellow;
	orange.value = settings.orange;
	green.value = settings.green;
	blue.value = settings.blue;
	violet.value = settings.violet;
	gray.value = settings.gray;

	// additional settings
	var additionalPanel = rightColumn.add("panel", undefined, "Additional Settings", { borderStyle: "etched" });
	additionalPanel.alignChildren = "fill";

	var layers = additionalPanel.add("checkbox", undefined, "Export Layers");
	var groups = additionalPanel.add("checkbox", undefined, "Export Groups");
	var children = additionalPanel.add("checkbox", undefined, "Child Layers");
	var hidden = additionalPanel.add("checkbox", undefined, "Hidden Layers");
	var background = additionalPanel.add("checkbox", undefined, "Background Layer On All Layers");
	var adjustments = additionalPanel.add("checkbox", undefined, "Keep Adjustment Layers Visible");
	var trim = additionalPanel.add("checkbox", undefined, "Trim");

	hidden.value = settings.hidden;
	children.value = settings.children;
	layers.value = settings.layers;
	groups.value = settings.groups;
	background.value = settings.background;
	adjustments.value = settings.adjustments;
	trim.value = settings.trim;

	// buttons
	var buttonGroup = win.add("group");
	buttonGroup.orientation = "row";
	buttonGroup.alignment = "right";

	var cancelButton = buttonGroup.add("button", undefined, "Cancel", {name: "cancel"});
	cancelButton.minimumSize = [120, 0];
	cancelButton.onClick = function() { win.close(); };

	var saveButton = buttonGroup.add("button", undefined, "Save", {name: "ok"});
	saveButton.minimumSize = [120, 0];
	saveButton.onClick = function()
	{
		var divider = "";
		for (var i = 0; i < dividerRadiobuttons.length; i++)
		{
			if (dividerRadiobuttons[i].value)
			{
				divider = dividerRadiobuttons[i].text
				break;
			}
		}

		var format = "";
		for (var i = 0; i < formatRadiobuttons.length; i++)
		{
			if (formatRadiobuttons[i].value)
			{
				format = formatRadiobuttons[i].text;
				break;
			}
		}

		var options = {
			filename: filename.text,
			noColor: noColor.value,
			red: red.value,
			yellow: yellow.value,
			orange: orange.value,
			green: green.value,
			blue: blue.value,
			violet: violet.value,
			gray: gray.value,
			hidden: hidden.value,
			layers: layers.value,
			groups: groups.value,
			trim: trim.value,
			adjustments: adjustments.value,
			children: children.value,
			background: background.value,
			format: format,
			divider: divider,
		};

		win.close();
		saveSettings(options);
		main(options);
	};

	win.center();
	win.show();
}

// Load the window settings
function loadSettings()
{
	var des = null;

	try
	{
		des = app.getCustomOptions(kOptions.NAME);
	}
	catch (err)
	{
		// return default settings
		return {
			filename: "{doc}_{group}{layer}",
			noColor: true,
			red: true,
			yellow: true,
			orange: true,
			green: true,
			blue: true,
			violet: true,
			gray: true,
			hidden: false,
			layers: true,
			groups: true,
			trim: false,
			adjustments: true,
			children: false,
			background: false,
			format: "",
			divider: "Nothing",
		};
	}

	// return loaded settings
	return {
		filename: des.getString(kOptions.FILENAME),
		noColor: des.getBoolean(kOptions.NOCOLOR),
		red: des.getBoolean(kOptions.RED),
		yellow: des.getBoolean(kOptions.ORANGE),
		orange: des.getBoolean(kOptions.YELLOW),
		green: des.getBoolean(kOptions.GREEN),
		blue: des.getBoolean(kOptions.BLUE),
		violet: des.getBoolean(kOptions.VIOLET),
		gray: des.getBoolean(kOptions.GRAY),
		hidden: des.getBoolean(kOptions.HIDDEN),
		layers: des.getBoolean(kOptions.EXPORTLAYERS),
		groups: des.getBoolean(kOptions.EXPORTGROUPS),
		trim: des.getBoolean(kOptions.TRIM),
		adjustments: des.getBoolean(kOptions.ADJUSTMENTLAYER),
		children: des.getBoolean(kOptions.CHILDREN),
		background: des.getBoolean(kOptions.BACKGROUND),
		format: des.getString(kOptions.FORMAT),
		divider: des.getString(kOptions.GROUPDIVIDER),
	};
}

// Save the window settings
function saveSettings(options)
{
	var des = new ActionDescriptor();

	des.putString(kOptions.FILENAME, options.filename);
	des.putBoolean(kOptions.NOCOLOR, options.noColor);
	des.putBoolean(kOptions.RED, options.red);
	des.putBoolean(kOptions.ORANGE, options.orange);
	des.putBoolean(kOptions.YELLOW, options.yellow);
	des.putBoolean(kOptions.GREEN, options.green);
	des.putBoolean(kOptions.BLUE, options.blue);
	des.putBoolean(kOptions.VIOLET, options.violet);
	des.putBoolean(kOptions.GRAY, options.gray);
	des.putBoolean(kOptions.HIDDEN, options.hidden);
	des.putBoolean(kOptions.EXPORTLAYERS, options.layers);
	des.putBoolean(kOptions.EXPORTGROUPS, options.groups);
	des.putBoolean(kOptions.TRIM, options.trim);
	des.putBoolean(kOptions.ADJUSTMENTLAYER, options.adjustments);
	des.putBoolean(kOptions.CHILDREN, options.children);
	des.putBoolean(kOptions.BACKGROUND, options.background);
	des.putString(kOptions.FORMAT, options.format);
	des.putString(kOptions.GROUPDIVIDER, options.divider);

	app.putCustomOptions(kOptions.NAME, des, true);
}

function progress(steps)
{
	var bar;
	var win;

	win = new Window("palette", "Exporting Layers", undefined, {closeButton: false});

	if (steps)
	{
		bar = win.add("progressbar", undefined, 0, steps);
		bar.preferredSize.width = 450;
	}

	progress.close = function()
	{
		win.close();
	};

	progress.increment = function()
	{
		bar.value++;
		if (bar.value % 10 === 0)
			app.refresh();
	};

	win.show();
	app.refresh();
}

showDialog();
