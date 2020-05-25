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
	UUID: "53b4b8d0-c174-419a-b65e-14fd41a2ec58",
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
	GROUPSUFFIX: app.stringIDToTypeID("GroupSuffix"),
	PADDINGPREFIX: app.stringIDToTypeID("PaddingPrefix"),
	BACKGROUND: app.stringIDToTypeID("Background"),
	SORTINGORDER: app.stringIDToTypeID("SortingOrder"),
	VERIFYOVERWRITE: app.stringIDToTypeID("VerifyOverwrite"),
}

// global object
var g = {
	doc: null,
	docName: "",
	targetLayers: [],
	options: null,
	outputPath: "",
	layerColors: ["No Color", "Red", "Orange", "Yellow", "Green", "Blue", "Violet", "Gray"],
	groupSuffix: "",
	paddingPrefix: "",
};

function main()
{
	if (initialize() === false)
	{
		return;
	}

	// Find all layers ordered by top to bottom, except adjustment layers
	g.targetLayers = getAllLayers(g.options.children, false);

	// Filter out layers based on user preferences
	filterEmptyGroups();
	filterLayers();
	filterGroups();
	filterLayersByColor();
	filterHidden();
	filterBackground();

	// Exit if there are zero layers to export
	if (g.targetLayers.length === 0)
	{
		alert("No layers to export");
		g.doc.close(SaveOptions.DONOTSAVECHANGES);
		return;
	}

	// Determine which character to use as suffix for group names
	g.groupSuffix = getPrefixSuffix(g.options.groupSuffix);
	g.paddingPrefix = getPrefixSuffix(g.options.paddingPrefix);

	// Reverse targetLayers?
	if (g.options.sortingOrder === "DESC")
	{
		g.targetLayers = g.targetLayers.reverse();
	}

	// Create list of all layers visibility state, including adjustment layers
	var visibleLayerDict = {}
	var allLayers = getAllLayers(true, true);
	for (var i = 0; i < allLayers.length; i++)
	{
		visibleLayerDict[allLayers[i].id] = allLayers[i].visible;
	}

	var outputNames = getOutputNames();

	// Confirm overwriting files
	if (g.options.verifyOverwrite)
	{
		// Make a dry run to see if any files already exists
		for (var i = 0; i < g.targetLayers.length; i++)
		{
			var result = saveFile(outputNames[i], true);
			if (result === false)
			{
				g.doc.close(SaveOptions.DONOTSAVECHANGES);
				return;
			}
			else if (result === true)
			{
				break;
			}
		}
	}

	progress(g.targetLayers.length);

	// Cache layers we want to hide
	var layersToHide = getAllLayers(true, !g.options.adjustments);

	// Loop over each target layer and save the png
	for (var i = 0; i < g.targetLayers.length; i++)
	{
		// Save history state before proceeding
		var savedState = g.doc.activeHistoryState;

		// Begin by hiding all layers
		hideLayers(layersToHide);

		// Make the layer visible within its hierarchy
		showInHierarchy(g.targetLayers[i]);

		// Show child layers based on user preferences
		var children = [];
		findChildLayers(g.targetLayers[i], children);

		if (g.options.hidden === false)
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
				if (children[j].typename === "LayerSet" || layerInColors(children[j]))
				{
					children[j].visible = true;
				}
			}
		}

		// Trim the document if enabled
		if (g.options.trim)
		{
			g.doc.trim(TrimType.TRANSPARENT);
		}

		// Save!
		try
		{
			saveFile(outputNames[i], false);
		}
		catch (err)
		{
			alert("Save error " + err);
			break;
		}

		// Increment progress bar
		progress.increment();

		// Restore history
		g.doc.activeHistoryState = savedState;
	}

	// Close progress bar window
	progress.close();

	// Close the duplicated document
	g.doc.close(SaveOptions.DONOTSAVECHANGES);
}

function initialize()
{
	// Store original document name
	g.docName = getDocumentName(app.activeDocument);

	// Try to get current document path
	var path = "";
	try
	{
		var fname = app.activeDocument.fullName.toString()
		path = fname.substring(0, fname.lastIndexOf("/"));
	} 
	catch (err)
	{
		path = "";
	}

	// Ask for folder to save images to
	var outputPath = Folder(path).selectDlg("Select Save Folder");

	if (outputPath == null)
	{
		return false;
	}

	g.outputPath = outputPath;

	// Duplicate the active document
	app.activeDocument = app.activeDocument.duplicate();

	g.doc = app.activeDocument;
	g.targetLayers = [];

	return true;
}

// Get a list of all layers in the document
function getAllLayers(includeChildren, includeAdjustmentLayers)
{
	var allLayers = [];

	for (var i = 0; i < g.doc.layers.length; i++)
	{
		// Ignore adjustment layers
		if (includeAdjustmentLayers === false || isAdjustment(g.doc.layers[i]) === false)
		{
			allLayers.push(g.doc.layers[i]);

			// Find all child layers
			if (includeChildren)
			{
				var childLayers = [];
				findChildLayers(g.doc.layers[i], childLayers);

				// Add all children to the list of layers
				for (var j = 0; j < childLayers.length; j++)
				{
					// Ignore adjustment layers
					if (includeAdjustmentLayers === false || isAdjustment(g.doc.layers[i]) === false)
					{
						allLayers.push(childLayers[j]);
					}
				}
			}
		}
	}

	return allLayers;
}

// Utility function to find all child layers of a given layer
function findChildLayers(layer, layerList)
{
	if (layer.layers !== undefined && layer.layers.length !== 0)
	{
		for (var i = 0; i < layer.layers.length; i++)
		{
			if (layer.layers[i] !== undefined)
			{
				layerList.push(layer.layers[i]);
				findChildLayers(layer.layers[i], layerList);
			}
		}
	}
}

// Removes empty groups from the targetLayers
function filterEmptyGroups()
{
	for (var i = g.targetLayers.length - 1; i >= 0; i--)
	{
		if (isEmptyGroup(g.targetLayers[i]))
		{
			g.targetLayers.splice(i, 1);
		}
	}
}

// Remove layers from targetLayers
function filterLayers()
{
	if (g.options.layers === false)
	{
		for (var i = g.targetLayers.length - 1; i >= 0; i--)
		{
			if (g.targetLayers[i].typename === "ArtLayer")
			{
				g.targetLayers.splice(i, 1);
			}
		}
	}
}

// Remove groups for targetLayers
function filterGroups()
{
	if (g.options.groups === false)
	{
		for (var i = g.targetLayers.length - 1; i >= 0; i--)
		{
			if (g.targetLayers[i].typename === "LayerSet")
			{
				g.targetLayers.splice(i, 1);
			}
		}
	}
}

function filterLayersByColor()
{
	var colorOptions = [g.options.noColor, g.options.red, g.options.orange, g.options.yellow, g.options.green, g.options.blue, g.options.violet, g.options.gray];

	for (var i = g.layerColors.length - 1; i >= 0; i--)
	{
		if (colorOptions[i] === false)
		{
			g.layerColors.splice(i, 1);
		}
	}

	if (g.layerColors.length === 0)
	{
		g.targetLayers = [];
	}

	for (var i = g.targetLayers.length - 1; i >= 0; i--)
	{
		if (layerInColors(g.targetLayers[i]) === false)
		{
			g.targetLayers.splice(i, 1);
		}
	}
}

function filterHidden()
{
	if (g.options.hidden === false)
	{
		for (var i = g.targetLayers.length - 1; i >= 0; i--)
		{
			if (visibleInHierarchy(g.targetLayers[i]) === false)
			{
				g.targetLayers.splice(i, 1);
			}
		}
	}
}

function filterBackground()
{
	for (var i = 0; i < g.targetLayers.length; i++)
	{
		if (g.targetLayers[i].isBackgroundLayer)
		{
			if (g.options.background === false)
			{
				g.targetLayers[i].isBackgroundLayer = false;
				g.targetLayers[i].name = "Background";
			}
			else
			{
				g.targetLayers.splice(i, 1);
			}
			break;
		}
	}
}

function getPrefixSuffix(name)
{
	// Determine suffix
	switch (name)
	{
		case "Space":
			return " ";
		case "Dash":
			return "-";
		case "Underscore":
			return "_";
		case "Period":
			return ".";
		default:
			return "";
	}
}

// Returns a list of names with the same length as g.targetLayers
function getOutputNames()
{
	var names = [];
	var nameObj = {};
	var pad = "0000";

	g.groupSuffix = getPrefixSuffix(g.options.groupSuffix); // just for safety

	for (var i = 0; i < g.targetLayers.length; i++)
	{
		var filename = resolveName(g.targetLayers[i]);

		if (nameObj.hasOwnProperty(filename) === false)
		{
			// the name hasn't been used yet, so add it and set count to 0
			nameObj[filename] = 0;
			names.push(filename);
		}
		else
		{
			// the name is already used, so increment the count
			nameObj[filename] += 1;
			var num = (pad + nameObj[filename]).slice(-pad.length);
			names.push(filename + g.paddingPrefix + num);
		}
	}

	return names;
}

// Hide all layers and groups in the document
function hideLayers(layers)
{
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
function layerInColors(layer)
{
	for (var j = 0; j < g.layerColors.length; j++)
	{
		if (getLayerColorByID(layer.id) === g.layerColors[j])
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
	var name = doc.name.toString();
	var dotPos = name.lastIndexOf(".");
	if (dotPos > -1)
	{
		name = name.substr(0, dotPos);
	}

	return name;
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
function resolveName(layer)
{
	var sourcePattern = "{doc}";
	var groupPattern = "{group}";
	var layerPattern = "{layer}";

	var result = g.options.filename;
	result = result.replace(sourcePattern, g.docName);
	result = result.replace(layerPattern, layer.name);

	var groupIndex = g.options.filename.indexOf(groupPattern);

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
				groups += groupNames[i] + g.groupSuffix;
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
function saveFile(filename, dryrun)
{
	var ext = "";
	switch (g.options.format)
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
	var file = new File(g.outputPath + "/" + filename + "." + ext);

	if (dryrun)
	{
		if (file.exists)
		{
			return confirm("One or more files already exists. Do you want to overwrite them?", true, "Overwrite Existing?");
		}

		return;
	}

	var saveOptions = undefined;
	switch (g.options.format)
	{
		case "PNG":
			saveOptions = new PNGSaveOptions();
			saveOptions.compression = 5; // 0-9
			saveOptions.interlaced = false;
			break;
		case "JPG":
			saveOptions = new JPEGSaveOptions();
			saveOptions.embedColorProfile = true;
			saveOptions.quality = 10;
			saveOptions.formatOptions = FormatOptions.STANDARDBASELINE;
			break;
		case "TIFF":
			saveOptions = new TiffSaveOptions();
			saveOptions.byteOrder = ByteOrder.IBM;
			saveOptions.embedColorProfile = true;
			saveOptions.imageCompression = TIFFEncoding.TIFFLZW;
			saveOptions.interleaveChannels = true;
			saveOptions.layers = false;
			saveOptions.transparency = true;
			break;
		case "PSD":
			saveOptions = new PhotoshopSaveOptions();
			saveOptions.alphaChannels = true;
			saveOptions.embedColorProfile = true;
			saveOptions.layers = false;
			break;
	}

	g.doc.saveAs(file, saveOptions, true);
}

// Show the dialog window with options
function showDialog()
{
	// Exit if no documents are open
	if (app.documents.length == false)
	{
		alert("No documents are open");
		return;
	}

	g.options = loadSettings();

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
	filename.text = g.options.filename;

	filenamePanel.add("statictext", undefined, "You can use {doc}, {group} and {layer} in the filename.");
	
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
		if (formats[i] === g.options.format)
		{
			formatRadiobuttons[i].value = true;
			formatSet = true;
		}
	}

	if (formatSet === false)
	{
		formatRadiobuttons[0].value = true;
	}

	// group suffix
	var groupSuffixPanel = leftColumn.add("panel", undefined, "Group Suffix", {borderStyle: "etched"});
	groupSuffixPanel.orientation = "row";
	groupSuffixPanel.alignChildren = "left";

	var suffixes = ["Nothing", "Space", "Dash", "Underscore", "Period"];
	var groupSuffixRadiobuttons = [];

	for (var i = 0; i < suffixes.length;i ++)
	{
		groupSuffixRadiobuttons[i] = groupSuffixPanel.add("radiobutton", undefined, suffixes[i]);
		if (suffixes[i] === g.options.groupSuffix)
		{
			groupSuffixRadiobuttons[i].value = true;
		}
	}

	// padding
	var paddingPanel = leftColumn.add("panel", undefined, "Numbering Prefix", {borderStyle: "etched"});
	paddingPanel.orientation = "column";
	paddingPanel.alignChildren = "fill";


	var paddingPrefixGroup = paddingPanel.add("group");
	paddingPrefixGroup.orientation = "row";

	var paddingPrefixRadiobuttons = [];

	for (var i = 0; i < suffixes.length;i ++)
	{
		paddingPrefixRadiobuttons[i] = paddingPrefixGroup.add("radiobutton", undefined, suffixes[i]);
		if (suffixes[i] === g.options.groupSuffix)
		{
			paddingPrefixRadiobuttons[i].value = true;
		}
	}

	paddingPanel.add("statictext", [0, 0, 0, 0], ""); // spacer
	paddingPanel.add("statictext", undefined, "Filename clashes are resolved with 4-digit numbering.");
	paddingPanel.add("statictext", undefined, "Warning: This does not prevent overwriting existing files!");

	// sorting order
	var sortingOrderPanel = leftColumn.add("panel", undefined, "Sorting Order", {borderStyle: "etched"});
	sortingOrderPanel.orientation = "column";
	sortingOrderPanel.alignChildren = "fill";

	var sortingOrderRadioGroup = sortingOrderPanel.add("group");
	sortingOrderRadioGroup.orientation = "row";
	sortingOrderRadioGroup.alignChildren = "left";

	var ascRadiobutton = sortingOrderRadioGroup.add("radiobutton", undefined, "Top to Bottom");
	var descRadiobutton = sortingOrderRadioGroup.add("radiobutton", undefined, "Bottom to Top");

	switch (g.options.sortingOrder)
	{
		case "ASC":
			ascRadiobutton.value = true;
			break;
		case "DESC":
			descRadiobutton.value = true;
			break;
		default:
			ascRadiobutton.value = true;
	}

	sortingOrderPanel.add("statictext", [0, 0, 0, 0], ""); // spacer
	sortingOrderPanel.add("statictext", undefined, "Sorting order is mostly relevant in case of filename clashes.");

	// settings
	var settingsPanel = rightColumn.add("panel", undefined, "Settings", { borderStyle: "etched" });
	settingsPanel.alignChildren = "fill";

	var layers = settingsPanel.add("checkbox", undefined, "Export Layers");
	var groups = settingsPanel.add("checkbox", undefined, "Export Groups");
	settingsRule1 = settingsPanel.add("panel"); // spacer
	settingsRule1.minimumSize.height = settingsRule1.maximumSize.height = 1;
	var children = settingsPanel.add("checkbox", undefined, "Child Layers");
	var hidden = settingsPanel.add("checkbox", undefined, "Hidden Layers");
	settingsRule2 = settingsPanel.add("panel"); // spacer
	settingsRule2.minimumSize.height = settingsRule2.maximumSize.height = 1;
	var background = settingsPanel.add("checkbox", undefined, "Keep Background Layer");
	var adjustments = settingsPanel.add("checkbox", undefined, "Keep Adjustment Layers Visible");
	settingsRule3 = settingsPanel.add("panel"); // spacer
	settingsRule3.minimumSize.height = settingsRule3.maximumSize.height = 1;
	var trim = settingsPanel.add("checkbox", undefined, "Trim");

	hidden.value = g.options.hidden;
	children.value = g.options.children;
	layers.value = g.options.layers;
	groups.value = g.options.groups;
	background.value = g.options.background;
	adjustments.value = g.options.adjustments;
	trim.value = g.options.trim;

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

	noColor.value = g.options.noColor;
	red.value = g.options.red;
	yellow.value = g.options.yellow;
	orange.value = g.options.orange;
	green.value = g.options.green;
	blue.value = g.options.blue;
	violet.value = g.options.violet;
	gray.value = g.options.gray;

	// verify overwrite
	var otherPanel = rightColumn.add("panel", undefined, "Other", {borderStyle: "etched"});
	otherPanel.alignChildren = "left";

	var verifyOverwrite = otherPanel.add("checkbox", undefined, "Verify Overwrite");
	verifyOverwrite.value = g.options.verifyOverwrite;

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
		var groupSuffix = "";
		for (var i = 0; i < groupSuffixRadiobuttons.length; i++)
		{
			if (groupSuffixRadiobuttons[i].value)
			{
				groupSuffix = groupSuffixRadiobuttons[i].text
				break;
			}
		}

		var paddingPrefix = "";
		for (var i = 0; i < paddingPrefixRadiobuttons.length; i++)
		{
			if (paddingPrefixRadiobuttons[i].value)
			{
				paddingPrefix = paddingPrefixRadiobuttons[i].text
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

		var sortingOrder = "ASC";
		if (ascRadiobutton.value)
		{
			sortingOrder = "ASC";
		}
		else if (descRadiobutton.value)
		{
			sortingOrder = "DESC";
		}

		g.options = {
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
			groupSuffix: groupSuffix,
			paddingPrefix: paddingPrefix,
			sortingOrder: sortingOrder,
			verifyOverwrite: verifyOverwrite.value,
		};

		win.close();
		saveSettings();
		try
		{
			main();
		}
		catch (err)
		{
			alert("Error line: " + err.line + "\n" + err);
			if (g.doc !== null)
			{
				g.doc.close();
			}
		}
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
		des = app.getCustomOptions(kOptions.UUID);
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
			verifyOverwrite: true,
			format: "",
			groupSuffix: "Underscore",
			paddingPrefix: "Underscore",
			sortingOrder: "ASC",
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
		verifyOverwrite: des.getBoolean(kOptions.VERIFYOVERWRITE),
		format: des.getString(kOptions.FORMAT),
		groupSuffix: des.getString(kOptions.GROUPSUFFIX),
		paddingPrefix: des.getString(kOptions.PADDINGPREFIX),
		sortingOrder: des.getString(kOptions.SORTINGORDER),
	};
}

// Save the window settings
function saveSettings()
{
	var des = new ActionDescriptor();

	des.putString(kOptions.FILENAME, g.options.filename);
	des.putBoolean(kOptions.NOCOLOR, g.options.noColor);
	des.putBoolean(kOptions.RED, g.options.red);
	des.putBoolean(kOptions.ORANGE, g.options.orange);
	des.putBoolean(kOptions.YELLOW, g.options.yellow);
	des.putBoolean(kOptions.GREEN, g.options.green);
	des.putBoolean(kOptions.BLUE, g.options.blue);
	des.putBoolean(kOptions.VIOLET, g.options.violet);
	des.putBoolean(kOptions.GRAY, g.options.gray);
	des.putBoolean(kOptions.HIDDEN, g.options.hidden);
	des.putBoolean(kOptions.EXPORTLAYERS, g.options.layers);
	des.putBoolean(kOptions.EXPORTGROUPS, g.options.groups);
	des.putBoolean(kOptions.TRIM, g.options.trim);
	des.putBoolean(kOptions.ADJUSTMENTLAYER, g.options.adjustments);
	des.putBoolean(kOptions.CHILDREN, g.options.children);
	des.putBoolean(kOptions.BACKGROUND, g.options.background);
	des.putBoolean(kOptions.VERIFYOVERWRITE, g.options.verifyOverwrite);
	des.putString(kOptions.FORMAT, g.options.format);
	des.putString(kOptions.GROUPSUFFIX, g.options.groupSuffix);
	des.putString(kOptions.PADDINGPREFIX, g.options.paddingPrefix);
	des.putString(kOptions.SORTINGORDER, g.options.sortingOrder);

	app.putCustomOptions(kOptions.UUID, des, true);
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
