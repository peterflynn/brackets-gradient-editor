Inline Gradient Editor for Brackets
===================================
Put your cursor on a CSS gradient and press Ctrl-E (Quick Edit) to bring up the editor. Also works in LESS & SASS files.

![Screenshot](http://peterflynn.github.io/screenshots/brackets-gradient-editor.png)

### Limitations

* Currently only supports `linear-gradient()` and its vendor-prefix variants - does not yet support `radial-gradient()` & repeating gradients.
* Gradient color stops cannot be added or removed yet - but you can move them and adjust colors.


How to Install
==============
Inline Gradient Editor is an extension for [Brackets](https://github.com/adobe/brackets/), a new open-source code editor for the web.

To install extensions:

1. Choose _File > Extension Manager_ and select the _Available_ tab
2. Search for this extension
3. Click _Install_!


### License
Simplified BSD License -- see `main.js` for details. Note that this license requires a notice or attribution accessible to end users.

The files `ColorEditor.js` and `ColorEditorTemplate.js` are code from Brackets, under its MIT license.
The file `tinycolor-min.js` is also under the MIT license.

### Compatibility
Brackets Sprint 36 or newer (Adobe Edge Code Preview 7 or newer).