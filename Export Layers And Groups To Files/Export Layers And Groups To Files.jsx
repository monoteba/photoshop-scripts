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
	UUID: "f1feca61-db14-4093-9bd5-aff78e1d8006",
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
	LOCKED: app.stringIDToTypeID("Locked"),
	CHILDREN: app.stringIDToTypeID("Children"),
	FORMAT: app.stringIDToTypeID("Format"),
	GROUPSUFFIX: app.stringIDToTypeID("GroupSuffix"),
	PADDINGPREFIX: app.stringIDToTypeID("PaddingPrefix"),
	BACKGROUND: app.stringIDToTypeID("Background"),
	SORTINGORDER: app.stringIDToTypeID("SortingOrder"),
	CONFIRMOVERWRITE: app.stringIDToTypeID("ConfirmOverwrite"),
	RESIZE: app.stringIDToTypeID("Resize"),
	RESIZEOPTIONS: app.stringIDToTypeID("ResizeOptions"),
	RESIZEVALUES: app.stringIDToTypeID("ResizeValues"),
}

const kResizeOption = 
{
	WIDTH: "Width", // matches width
	HEIGHT: "Height", // matches height
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
	resizeItems: [],
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

	progress(g.targetLayers.length * g.options.resizeItems.length);

	// Confirm overwriting files
	var resizeCount = g.options.resize ? g.options.resizeItems.length : 1;

	for (var n = 0; n < resizeCount; n++)
	{
		if (g.options.confirmOverwrite)
		{
			// Make a dry run to see if any files already exists
			for (var i = 0; i < g.targetLayers.length; i++)
			{
				var result = saveFile(g.doc, outputNames[n][i], true);
				if (result === false)
				{
					// g.doc.close(SaveOptions.DONOTSAVECHANGES);
					progress.close();
					return;
				}
				else if (result === true)
				{
					break;
				}
			}
		}
	}

	// save loop
	for (var n = 0; n < resizeCount; n++)
	{
		var resizedState = g.doc.activeHistoryState;

		// create another resized duplicate
		if (g.options.resize)
		{
			resizeDocument(g.doc, g.options.resizeItems[n].resizeOption, g.options.resizeItems[n].resizeValue);
		}

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
				saveFile(g.doc, outputNames[n][i], false);
			}
			catch (err)
			{
				alert("Save error line: " + err.line + "\n" + err);
				break;
			}

			// Increment progress bar
			progress.increment();

			// Restore history
			g.doc.activeHistoryState = savedState;
		}

		g.doc.activeHistoryState = resizedState;

	} // end of save loop

	// Close the duplicated document
	g.doc.close(SaveOptions.DONOTSAVECHANGES);

	// Close progress bar window
	progress.close();
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

	var resizeCount = g.options.resize ? g.options.resizeItems.length : 1;

	for (var n = 0; n < resizeCount; n++)
	{
		names.push([]);

		for (var i = 0; i < g.targetLayers.length; i++)
		{
			var sizeName = "";
			if (g.options.resize)
			{
				sizeName = g.options.resizeItems[n].resizeOption + "_";
				sizeName += g.options.resizeItems[n].resizeValue + "px/";
			}

			var filename = sizeName + resolveName(g.targetLayers[i]);

			if (nameObj.hasOwnProperty(filename) === false)
			{
				// the name hasn't been used yet, so add it and set count to 0
				nameObj[filename] = 0;
				names[n].push(filename);
			}
			else
			{
				// the name is already used, so increment the count
				nameObj[filename] += 1;
				var num = (pad + nameObj[filename]).slice(-pad.length);
				names[n].push(filename + g.paddingPrefix + num);
			}
		}
	}

	return names;
}

// Resizes a given document (if needed)
function resizeDocument(doc, resizeOption, resizeValue)
{
	var docSize = {
		width: doc.width.as("px"),
		height: doc.height.as("px"),
	};

	if (resizeOption === kResizeOption.WIDTH)
	{
		if (parseInt(resizeValue) === parseInt(docSize.width))
		{
			return;
		}

		var newSize = {
			width: parseInt(resizeValue),
			height: parseInt(Math.round(doc.height * (resizeValue / doc.width)))
		}
	}
	else if (resizeOption === kResizeOption.HEIGHT)
	{
		if (parseInt(resizeValue) === parseInt(docSize.height))
		{
			return;
		}

		var newSize = {
			width: parseInt(Math.round(doc.width * (resizeValue / doc.height))),
			height: parseInt(resizeValue)
		}
	}
	else
	{
		return;
	}

	doc.resizeImage(
		new UnitValue(newSize.width, "px"),
		new UnitValue(newSize.height, "px"),
		doc.resolution,
		ResampleMethod.AUTOMATIC
	);
}

// Hide all layers and groups in the document
function hideLayers(layers)
{
	for (var i = 0; i < layers.length; i++)
	{
		var locked = (g.options.locked && layers[i].pixelsLocked);

		if (layers[i].isBackgroundLayer === false && locked === false)
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
	// background layer cannot have a color
	if (layer.isBackgroundLayer)
	{
		var color = "No Color";
	}
	else
	{
		var color = getLayerColorByID(layer.id);
	}

	for (var j = 0; j < g.layerColors.length; j++)
	{
		if (color === g.layerColors[j])
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
function saveFile(doc, filename, dryrun)
{
	// Check if output folder exists
	var index = filename.lastIndexOf("/");
	if (index !== -1)
	{
		var folder = new Folder(g.outputPath + "/" + filename.substring(0, index));
		if (folder.exists === false)
		{
			if (folder.create() === false)
			{
				return;
			}
		}
	}

	// Create new file object
	var file = new File(g.outputPath + "/" + filename + g.options.format);

	if (dryrun)
	{
		if (file.exists)
		{
			return confirm("One or more files already exists and will be overwritten!\nDo you want to continue?", true, "Overwrite Existing?");
		}

		return;
	}

	var saveOptions = undefined;
	switch (g.options.format)
	{
		case ".png":
			saveOptions = new PNGSaveOptions();
			saveOptions.compression = 3; // 0-9
			saveOptions.interlaced = false;
			break;
		case ".jpg":
			saveOptions = new JPEGSaveOptions();
			saveOptions.embedColorProfile = true;
			saveOptions.quality = 10;
			saveOptions.formatOptions = FormatOptions.STANDARDBASELINE;
			break;
		case ".gif":
			saveOptions = new GIFSaveOptions();
			saveOptions.transparency = true;
			break;
		case ".tif":
			saveOptions = new TiffSaveOptions();
			saveOptions.byteOrder = ByteOrder.IBM;
			saveOptions.embedColorProfile = true;
			saveOptions.imageCompression = TIFFEncoding.TIFFLZW;
			saveOptions.interleaveChannels = true;
			saveOptions.layers = false;
			saveOptions.transparency = true;
			break;
		case ".psd":
			saveOptions = new PhotoshopSaveOptions();
			saveOptions.alphaChannels = true;
			saveOptions.embedColorProfile = true;
			saveOptions.layers = false;
			break;
		case ".pdf":
			saveOptions = new PDFSaveOptions();
			saveOptions.alphaChannels = false;
			saveOptions.embedColorProfile = true;
			saveOptions.jpegQuality = 10;
			saveOptions.layers = false;
			saveOptions.preserveEditing = false;
			saveOptions.optimizeForWeb = true;
	}

	doc.saveAs(file, saveOptions, true);
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
	win.alignment = ["center", "center"];
	win.alignChildren = ["fill", "fill"];

	win.wrapper = win.add("group");
	win.wrapper.orientation = "row";
	win.wrapper.alignChildren = "top";

	win.left = win.wrapper.add("group");
	win.left.orientation = "column";
	win.left.alignChildren = ["fill", "fill"];

	win.right = win.wrapper.add("group");
	win.right.orientation = "column";
	win.right.alignChildren = ["fill", "fill"];

	// filename and format
	win.left.filename = win.left.add("panel", undefined, "Filename");
	win.left.filename.orientation = "column";
	win.left.filename.alignChildren = ["fill", ""];

	win.left.filename.group = win.left.filename.add("group");
	win.left.filename.group.orientation = "row";
	win.left.filename.group.alignChildren = ["fill", "fill"];

	var filename = win.left.filename.group.add("edittext");
	filename.preferredSize.width = 300;
	filename.text = g.options.filename;
	filename.active = true;

	var formats = getFormats();
	var format = win.left.filename.group.add("dropdownlist", undefined, formats);
	format.preferredSize.width = 100;

	format.selection = 0;
	for (var i = 0; i < formats.length; i++)
	{
		if (formats[i] === g.options.format)
		{
			format.selection = i;
		}
	}

	win.left.filename.description = win.left.filename.add("statictext", undefined, "You can use {doc}, {group} and {layer} in the filename.");
	win.left.filename.description.enabled = false;

	// group suffix
	win.left.groupSuffix = win.left.add("panel", undefined, "Group Suffix");
	win.left.groupSuffix.orientation = "row";
	win.left.groupSuffix.alignChildren = "left";

	var suffixes = ["Nothing", "Space", "Dash", "Underscore", "Period"];
	var groupSuffixRadiobuttons = [];

	for (var i = 0; i < suffixes.length;i ++)
	{
		groupSuffixRadiobuttons[i] = win.left.groupSuffix.add("radiobutton", undefined, suffixes[i]);
		if (suffixes[i] === g.options.groupSuffix)
		{
			groupSuffixRadiobuttons[i].value = true;
		}
	}

	// padding
	win.left.numberingPrefix = win.left.add("panel", undefined, "Numbering Prefix");
	win.left.numberingPrefix.orientation = "column";
	win.left.numberingPrefix.alignChildren = ["fill", "fill"];

	win.left.numberingPrefix.group = win.left.numberingPrefix.add("group");
	win.left.numberingPrefix.group.orientation = "row";

	var paddingPrefixRadiobuttons = [];

	for (var i = 0; i < suffixes.length;i ++)
	{
		paddingPrefixRadiobuttons[i] = win.left.numberingPrefix.group.add("radiobutton", undefined, suffixes[i]);
		if (suffixes[i] === g.options.groupSuffix)
		{
			paddingPrefixRadiobuttons[i].value = true;
		}
	}

	win.left.numberingPrefix.description1 = win.left.numberingPrefix.add("statictext", undefined, "Duplicate names are numbered, e.g. \"_0001\"");
	win.left.numberingPrefix.description1.enabled = false;

	// sorting order
	win.left.sortingOrder = win.left.add("panel", undefined, "Sorting Order");
	win.left.sortingOrder.orientation = "column";
	win.left.sortingOrder.alignChildren = ["fill", "fill"];

	win.left.sortingOrder.group = win.left.sortingOrder.add("group");
	win.left.sortingOrder.group.orientation = "row";
	win.left.sortingOrder.group.alignChildren = "left";

	var ascRadiobutton = win.left.sortingOrder.group.add("radiobutton", undefined, "Top to Bottom");
	var descRadiobutton = win.left.sortingOrder.group.add("radiobutton", undefined, "Bottom to Top");

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

	win.left.sortingOrder.description = win.left.sortingOrder.add("statictext", undefined, "Sorting order is mostly relevant in case of duplicate names.");
	win.left.sortingOrder.description.enabled = false;

	// resize
	win.left.resize = win.left.add("panel", undefined, "Resize");
	win.left.resize.orientation = "column";
	win.left.resize.alignChildren = ["fill", "fill"];

	win.left.resize.checkboxGroup = win.left.resize.add("group");
	win.left.resize.checkboxGroup.orientation = "row";
	win.left.resize.checkboxGroup.alignChildren = ["fill", "fill"];

	var docWidth = app.activeDocument.width.as("px");
	var docHeight = app.activeDocument.height.as("px");

	var resize = win.left.resize.checkboxGroup.add("checkbox", undefined, "Resize Image");
	resize.value = g.options.resize;
	resize.onClick = function() 
	{
		win.left.resize.wrapper.enabled = true;
		win.left.resize.wrapper.enabled = this.value;
		win.left.resize.buttonGroup.addButton.enabled = resize.value;
		win.left.resize.buttonGroup.removeAllButton.enabled = resize.value;
	}

	win.left.resize.checkboxGroup.label = win.left.resize.checkboxGroup.add("statictext", undefined, "Document Size: " + docWidth + " x " + docHeight + " px");
	win.left.resize.checkboxGroup.label.enabled = false;
	win.left.resize.checkboxGroup.label.justify = "right";

	win.left.resize.wrapper = win.left.resize.add("group");
	win.left.resize.wrapper.orientation = "column";
	win.left.resize.wrapper.alignChildren = ["fill", "top"];
	win.left.resize.wrapper.spacing = 0;

	var resizeGroups = [];

	var addSize = function(resizeOption, resizeValue)
	{
		var i = resizeGroups.push(win.left.resize.wrapper.add("group")) - 1;
		resizeGroups[i].orientation = "row";
		resizeGroups[i].spacing = 0;

		resizeGroups.resizeOption = resizeOption;
		resizeGroups.resizeValue = resizeValue;

		resizeGroups[i].resizeOptionInput = resizeGroups[i].add("dropdownlist", undefined, [kResizeOption.WIDTH, kResizeOption.HEIGHT]);
		resizeGroups[i].resizeOptionInput.preferredSize.width = 100;
		resizeGroups[i].resizeOptionInput.maximumSize.width = 100;
		if (resizeOption === kResizeOption.WIDTH)
		{
			resizeGroups[i].resizeOptionInput.selection = 0;
		}
		else if (resizeOption === kResizeOption.HEIGHT)
		{
			resizeGroups[i].resizeOptionInput.selection = 1;
		}
		else
		{
			resizeGroups[i].resizeOptionInput.selection = 0;
		}
		
		resizeGroups[i].equalText = resizeGroups[i].add("statictext", undefined, " = ");
		resizeGroups[i].equalText.justify = "center";
		resizeGroups[i].equalText.preferredSize.width = 20;
		resizeGroups[i].equalText.maximumSize.width = 20;

		resizeGroups[i].resizeValueInput = resizeGroups[i].add("edittext", undefined, resizeValue);
		resizeGroups[i].resizeValueInput.justify = "right";
		resizeGroups[i].resizeValueInput.preferredSize.width = 100;
		resizeGroups[i].resizeValueInput.maximumSize.width = 100;
		resizeGroups[i].resizeValueInput.onChanging = function() 
		{ 
			var val = parseInt(this.text);
			this.text = val > 0 ? val : 1;
		}
		
		resizeGroups[i].unitText = resizeGroups[i].add("statictext", undefined, "px");
		resizeGroups[i].unitText.alignment = ["fill", "center"];
		resizeGroups[i].unitText.justify = "left";

		resizeGroups[i].removeButton = resizeGroups[i].add("button", undefined, "Remove");
		resizeGroups[i].removeButton.alignment = "right";
		resizeGroups[i].removeButton.preferredSize.width = 120;
		resizeGroups[i].removeButton.maximumSize.width = 120;
		resizeGroups[i].removeButton.onClick = function()
		{
			win.left.resize.wrapper.remove(this.parent);
			if (win.left.resize.wrapper.children.length === 0)
			{
				addSize(kResizeOption.WIDTH, docWidth);
			}
			win.left.resize.wrapper.enabled = true;
			win.left.resize.wrapper.enabled = resize.value;
			win.layout.layout(true);
		}
	}

	win.left.resize.buttonGroup = win.left.resize.add("group");
	win.left.resize.buttonGroup.orientation = "row";
	win.left.resize.buttonGroup.spacing = 10;

	win.left.resize.buttonGroup.addButton = win.left.resize.buttonGroup.add("button", undefined, "Add");
	win.left.resize.buttonGroup.addButton.alignment = ["fill", "center"];
	win.left.resize.buttonGroup.addButton.preferredSize.width = 100;
	win.left.resize.buttonGroup.addButton.onClick = function()
	{
		if (resizeGroups.length > 0)
		{
			var rg = resizeGroups[resizeGroups.length - 1];
			addSize(rg.resizeOptionInput.selection.text, rg.resizeValueInput.text);
		}
		else
		{
			addSize(kResizeOption.WIDTH, docWidth);
		}
		win.left.resize.wrapper.enabled = true;
		win.left.resize.wrapper.enabled = resize.value;
		win.layout.layout(true);
	}

	win.left.resize.buttonGroup.removeAllButton = win.left.resize.buttonGroup.add("button", undefined, "Remove All");
	win.left.resize.buttonGroup.removeAllButton.alignment = ["right", "center"];
	win.left.resize.buttonGroup.removeAllButton.preferredSize.width = 120;
	win.left.resize.buttonGroup.removeAllButton.maximumSize.width = 120;
	win.left.resize.buttonGroup.removeAllButton.onClick = function()
	{
		for (var i = 0; i < resizeGroups.length; i++)
		{
			win.left.resize.wrapper.remove(resizeGroups[i]);
		}
		resizeGroups = [];
		addSize(kResizeOption.WIDTH, docWidth);
		win.layout.layout(true);
	}

	for (var i = 0; i < g.options.resizeItems.length; i++)
	{
		addSize(g.options.resizeItems[i].resizeOption, g.options.resizeItems[i].resizeValue);
	}

	win.left.resize.wrapper.enabled = resize.value;
	win.left.resize.buttonGroup.addButton.enabled = resize.value;
	win.left.resize.buttonGroup.removeAllButton.enabled = resize.value;

	// export
	win.right.export = win.right.add("panel", undefined, "Export");
	win.right.export.alignChildren = ["fill", "fill"];

	var layers = win.right.export.add("checkbox", undefined, "Layers");
	var groups = win.right.export.add("checkbox", undefined, "Groups");
	// exportSpacer = win.right.export.add("panel"); // spacer
	// exportSpacer.minimumSize.height = exportSpacer.maximumSize.height = 1;
	var children = win.right.export.add("checkbox", undefined, "Child Layers");
	var hidden = win.right.export.add("checkbox", undefined, "Hidden Layers");

	// settings
	win.right.settings = win.right.add("panel", undefined, "Settings");
	win.right.settings.alignChildren = ["fill", "fill"];

	var background = win.right.settings.add("checkbox", undefined, "Keep Background Layer");
	var adjustments = win.right.settings.add("checkbox", undefined, "Keep Adjustment Layers");
	var locked = win.right.settings.add("checkbox", undefined, "Keep Locked Layers");
	var trim = win.right.settings.add("checkbox", undefined, "Trim Layers");

	hidden.value = g.options.hidden;
	children.value = g.options.children;
	layers.value = g.options.layers;
	groups.value = g.options.groups;
	background.value = g.options.background;
	adjustments.value = g.options.adjustments;
	locked.value = g.options.locked;
	trim.value = g.options.trim;

	// layer colors
	win.right.layerColors = win.right.add("panel", undefined, "Layer Colors");
	win.right.layerColors.orientation = "row";
	win.right.layerColors.alignChildren = "top";

	win.right.layerColors.group1 = win.right.layerColors.add("group");
	win.right.layerColors.group1.orientation = "column";
	win.right.layerColors.group1.alignChildren = "left";
	win.right.layerColors.group1.minimumSize = [120, 0];

	win.right.layerColors.group2 = win.right.layerColors.add("group");
	win.right.layerColors.group2.orientation = "column";
	win.right.layerColors.group2.alignChildren = "left";
	win.right.layerColors.group2.minimumSize = [120, 0];

	var noColor = win.right.layerColors.group1.add("checkbox", undefined, "No Color");
	var red = win.right.layerColors.group1.add("checkbox", undefined, "Red");
	var yellow = win.right.layerColors.group1.add("checkbox", undefined, "Yellow");
	var orange = win.right.layerColors.group1.add("checkbox", undefined, "Orange");
	var green = win.right.layerColors.group2.add("checkbox", undefined, "Green");
	var blue = win.right.layerColors.group2.add("checkbox", undefined, "Blue");
	var violet = win.right.layerColors.group2.add("checkbox", undefined, "Violet");
	var gray = win.right.layerColors.group2.add("checkbox", undefined, "Gray");

	noColor.value = g.options.noColor;
	red.value = g.options.red;
	yellow.value = g.options.yellow;
	orange.value = g.options.orange;
	green.value = g.options.green;
	blue.value = g.options.blue;
	violet.value = g.options.violet;
	gray.value = g.options.gray;

	// confirm overwrite
	win.right.other = win.right.add("panel", undefined, "Other");
	win.right.other.alignChildren = "left";

	var confirmOverwrite = win.right.other.add("checkbox", undefined, "Confirm Overwriting Existing Files");
	confirmOverwrite.value = g.options.confirmOverwrite;

	// buttons
	var buttonGroup = win.add("group");
	buttonGroup.orientation = "row";
	buttonGroup.alignment = ["right", "bottom"];

	var saveSettingsAndClose = function()
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

		var sortingOrder = "ASC";
		if (ascRadiobutton.value)
		{
			sortingOrder = "ASC";
		}
		else if (descRadiobutton.value)
		{
			sortingOrder = "DESC";
		}

		var resizeItems = [];
		for (var i = 0; i < resizeGroups.length; i++)
		{
			resizeItems.push(
				{
					resizeOption: resizeGroups[i].resizeOptionInput.selection.text,
					resizeValue: parseInt(resizeGroups[i].resizeValueInput.text),
				}
			);
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
			locked: locked.value,
			children: children.value,
			background: background.value,
			format: format.selection.text,
			groupSuffix: groupSuffix,
			paddingPrefix: paddingPrefix,
			sortingOrder: sortingOrder,
			resize: resize.value,
			resizeItems: resizeItems,
			confirmOverwrite: confirmOverwrite.value,
		};

		try
		{
			saveSettings();
			win.close();
		}
		catch (err)
		{
			alert("Could not save preferences\n" + err);
		}
	}

	var cancelButton = buttonGroup.add("button", undefined, "Cancel", {name: "cancel"});
	cancelButton.minimumSize = [120, 0];
	cancelButton.onClick = function() { saveSettingsAndClose(); }

	var saveButton = buttonGroup.add("button", undefined, "Save", {name: "ok"});
	saveButton.minimumSize = [120, 0];
	saveButton.onClick = function()
	{	
		saveSettingsAndClose();

		try
		{
			main();
		}
		catch (err)
		{
			alert("Error line: " + err.line + "\n" + err);
			if (g.doc !== null)
			{
				g.doc.close(SaveOptions.DONOTSAVECHANGES);
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
			locked: false,
			children: false,
			background: false,
			confirmOverwrite: true,
			format: "",
			groupSuffix: "Underscore",
			paddingPrefix: "Underscore",
			sortingOrder: "ASC",
			resize: false,
			resizeItems: [{resizeOption: kResizeOption.WIDTH, resizeValue: app.activeDocument.width.as("px")}],
		};
	}

	// get resize items
	var resizeOptions = des.getString(kOptions.RESIZEOPTIONS);
	resizeOptions = resizeOptions.split(";");

	var resizeValues = des.getString(kOptions.RESIZEVALUES);
	resizeValues = resizeValues.split(";");

	var resizeItems = [];
	for (var i = 0; i < resizeOptions.length; i++)
	{
		if (resizeOptions[i].length > 0)
		{
			resizeItems.push({
				resizeOption: resizeOptions[i],
				resizeValue: resizeValues[i],
			});
		}
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
		locked: des.getBoolean(kOptions.LOCKED),
		children: des.getBoolean(kOptions.CHILDREN),
		background: des.getBoolean(kOptions.BACKGROUND),
		confirmOverwrite: des.getBoolean(kOptions.CONFIRMOVERWRITE),
		format: des.getString(kOptions.FORMAT),
		groupSuffix: des.getString(kOptions.GROUPSUFFIX),
		paddingPrefix: des.getString(kOptions.PADDINGPREFIX),
		sortingOrder: des.getString(kOptions.SORTINGORDER),
		resize: des.getBoolean(kOptions.RESIZE),
		resizeItems: resizeItems,
	};
}

// Save the window settings
function saveSettings()
{
	var des = new ActionDescriptor();

	// semi-colon separated strings for resize items
	var resizeOptions = "";
	var resizeValues = "";

	for (var i = 0; i < g.options.resizeItems.length; i++)
	{
		resizeOptions += g.options.resizeItems[i].resizeOption + ";";
		resizeValues += g.options.resizeItems[i].resizeValue + ";";
	}

	if (g.options.resizeItems.length > 0)
	{
		// removes the last semi-colon
		resizeOptions = resizeOptions.slice(0, -1);
		resizeValues = resizeValues.slice(0, -1);
	}

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
	des.putBoolean(kOptions.LOCKED, g.options.locked);
	des.putBoolean(kOptions.CHILDREN, g.options.children);
	des.putBoolean(kOptions.BACKGROUND, g.options.background);
	des.putBoolean(kOptions.CONFIRMOVERWRITE, g.options.confirmOverwrite);
	des.putString(kOptions.FORMAT, g.options.format);
	des.putString(kOptions.GROUPSUFFIX, g.options.groupSuffix);
	des.putString(kOptions.PADDINGPREFIX, g.options.paddingPrefix);
	des.putString(kOptions.SORTINGORDER, g.options.sortingOrder);
	des.putBoolean(kOptions.RESIZE, g.options.resize);
	des.putString(kOptions.RESIZEOPTIONS, resizeOptions);
	des.putString(kOptions.RESIZEVALUES, resizeValues);
	app.putCustomOptions(kOptions.UUID, des, true);
}

function getFormats()
{
	// Document Color Mode
	var documentMode = app.activeDocument.mode;
	if (documentMode === DocumentMode.BITMAP || documentMode === DocumentMode.INDEXEDCOLOR)
	{
		return [".png", ".gif", ".tif", ".psd", ".pdf"];
	}
	else if (documentMode === DocumentMode.RGB || documentMode === DocumentMode.GRAYSCALE)
	{
		switch (app.activeDocument.bitsPerChannel)
		{
			case BitsPerChannelType.EIGHT:
				return [".png", ".jpg", ".gif", ".tif", ".psd", ".pdf"];
				break;
			case BitsPerChannelType.SIXTEEN:
				return [".png", ".jpg", ".tif", ".psd", ".pdf"];
				break;
			case BitsPerChannelType.THIRTYTWO:
				return [".tif", ".psd"];
				break;
		}
	} 
	else if (documentMode === DocumentMode.CMYK)
	{
		switch (app.activeDocument.bitsPerChannel)
		{
			case BitsPerChannelType.EIGHT:
				return [".jpg", ".tif", ".psd", ".pdf"];
				break;
			case BitsPerChannelType.SIXTEEN:
				return [".jpg", ".tif", ".psd", ".pdf"];
				break;
		}
	}
	else if (documentMode === DocumentMode.LAB)
	{
		switch (app.activeDocument.bitsPerChannel)
		{
			case BitsPerChannelType.EIGHT:
				return [".tif", ".psd", ".pdf"];
				break;
			case BitsPerChannelType.SIXTEEN:
				return [".tif", ".psd", ".pdf"];
				break;
		}
	}

	return [];
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
