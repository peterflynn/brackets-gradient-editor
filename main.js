/*
 * Copyright (c) 2014 Peter Flynn
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, regexp: true */
/*global define, brackets, $ */

/**
 * Syntax:
 *  https://developer.mozilla.org/en-US/docs/Web/CSS/linear-gradient
 *  https://developer.mozilla.org/en-US/docs/Web/CSS/radial-gradient
 *  https://developer.mozilla.org/en-US/docs/Web/CSS/repeating-linear-gradient
 *  https://developer.mozilla.org/en-US/docs/Web/CSS/repeating-radial-gradient
 */
define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var _                       = brackets.getModule("thirdparty/lodash"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        InlineWidget            = brackets.getModule("editor/InlineWidget").InlineWidget,
        EditorManager           = brackets.getModule("editor/EditorManager");
    
    // Our own modules
    var ColorEditor             = require("ColorEditor").ColorEditor;
    
    // UI templates
    var inlineEditorTemplate    = require("text!gradient-editor-template.html");
    
    var STRIPE_WIDTH = 300;  // FIXME: calculate dynamically
    function triangleLeft(stopOffset) {
        return stopOffset / 100 * STRIPE_WIDTH - 5;
    }
    function stopOffset(triangleLeft) {
        return (triangleLeft + 5) / STRIPE_WIDTH * 100;
    }
    
    function parseOffset(offsetStr) {
        // FIXME: could be a length instead of percent
        // FIXME: could be left unspecified
        return parseFloat(offsetStr);
    }
    
    
    function findGradientNearCursor(editor, pos) {
        var line = editor.document.getLine(pos.line),
            match = line.match(/((-webkit-|-moz-|-ms-|-o-)?linear-gradient)\((.*)\)/); // FIXME: matches too much on lines w/ multiple comma-separated gradients
        
        if (match && match[3]) {
            // FIXME: doesn't work if comma-separated rgba/hsv/etc. used - need to do a regexp-match loop?
            var params = match[3].split(/,\s*/);
            
            var colorStops = params.slice(1);
            var colors = [], offsets = [];
            
            colorStops.forEach(function (stop) {
                var halves = stop.match(/(.+)\s+(\S+)/);
                colors.push(halves[1]);
                offsets.push(halves[2]); // TODO: this is optional
            });
            
            var gradInfo = {
                origPos: {line: pos.line, ch: match.index},
                origText: match[0],
                prefix: match[1],
                // direction is t/l/r/b (with optional "to\s+") prefix, or number with mandatory deg/grad/rad/turn suffix (w/ no space)
                // TODO: direction arg is actually optional
                direction: params[0],
                colors: colors,
                offsets: offsets
            };
            return gradInfo;
        }
    }
    
    
    function GradientInlineEditor(gradInfo, pos) {
        InlineWidget.call(this);
        
        this.gradInfo = gradInfo;
        this.lastPos = gradInfo.origPos;
        
        this.$htmlContent.addClass("inline-gradient-editor");
        $(inlineEditorTemplate).appendTo(this.$htmlContent);
        
        this._handleColorChange = this._handleColorChange.bind(this);
        this._handleTriMouseDown = this._handleTriMouseDown.bind(this);
        this._handleTriDrag = this._handleTriDrag.bind(this);
        this._handleStripeAreaClick = this._handleStripeAreaClick.bind(this);
        
        var stripeWidth = STRIPE_WIDTH, //this.$htmlContent.find(".stripe-bg").innerWidth(),
            $stripeContainer = this.$htmlContent.find(".gradient-stripe");
        gradInfo.offsets.forEach(function (offset) {
            var oNum = parseOffset(offset);
            $stripeContainer.append("<div class='grad-tri' style='left:" + triangleLeft(oNum) + "px'></div>");
        });
        this.colorEditor = new ColorEditor(this.$htmlContent.find(".colorpicker"), gradInfo.colors[0], this._handleColorChange, []);
        
        $stripeContainer.on("mousedown", ".grad-tri", this._handleTriMouseDown);
        
        $stripeContainer.find(".stripe-bg").click(this._handleStripeAreaClick);
    }
    GradientInlineEditor.prototype = Object.create(InlineWidget.prototype);
    GradientInlineEditor.prototype.constructor = GradientInlineEditor;
    GradientInlineEditor.prototype.parentClass = InlineWidget.prototype;
    
    GradientInlineEditor.prototype.colorEditor = null;
    
    GradientInlineEditor.prototype.onAdded = function () {
        GradientInlineEditor.prototype.parentClass.onAdded.apply(this, arguments);
        
        this._updatePreview(true);
        this._setSelected(0);
        
        // Setting initial height is a *required* part of the InlineWidget contract
        this._adjustHeight();
    };
    GradientInlineEditor.prototype._adjustHeight = function () {
        var inlineWidgetHeight = 260; // FIXME: calculate dynamically
        this.hostEditor.setInlineWidgetHeight(this, inlineWidgetHeight);
    };
    
    GradientInlineEditor.prototype._setSelected = function (newSelected) {
        if (this._$selectedTri) {
            this._$selectedTri.removeClass("tri-selected");
        }
        this._selected = newSelected;
        this._$selectedTri = this.$htmlContent.find(".grad-tri").eq(this._selected);
        this._$selectedTri.addClass("tri-selected");
        this.colorEditor.setColorFromString(this.gradInfo.colors[this._selected]);
    };
    
    GradientInlineEditor.prototype._updatePreview = function (suppressChange) {
        var gradInfo = this.gradInfo;
        var stops = gradInfo.colors.map(function (color, i) {
            return color + " " + gradInfo.offsets[i];
        }).join(", ");
        
        var stripeGradient   = "-webkit-linear-gradient(left," + stops + ")",
            previewGraidient = "-webkit-linear-gradient(" + gradInfo.direction + "," + stops + ")",
            fullGradient     = gradInfo.prefix + "(" + gradInfo.direction + ", " + stops + ")";
        
        this.$htmlContent.find(".stripe-preview").css("background", stripeGradient);
        this.$htmlContent.find(".gradient-preview").css("background", previewGraidient);
        
        if (!suppressChange) {
            var gradInCode = findGradientNearCursor(this.hostEditor, this.lastPos);
            this.lastPos = gradInCode.origPos;
            this.hostEditor.document.replaceRange(fullGradient, this.lastPos, { line: this.lastPos.line, ch: this.lastPos.ch + gradInCode.origText.length });
        }
    };
    
    
    GradientInlineEditor.prototype._handleStripeAreaClick = function () {
        // FIXME: insert stop (set to the interpolated color & alpha at that pos)
    };
    GradientInlineEditor.prototype._handleTriMouseDown = function (event) {
        this._setSelected($(event.currentTarget).index() - 1); // index 0 is the .stripe-bg
        
        this._mouseDownX = event.screenX;
        this._mouseDownLeft = parseInt(this._$selectedTri.css("left"), 10);
        
        $(window.document).on("mousemove.gradTriDrag", this._handleTriDrag);
        $(window.document).on("mouseup.gradTriDrag", function () {
            $(window.document).off(".gradTriDrag", this._handleTriDrag);
        });
    };
    GradientInlineEditor.prototype._handleTriDrag = function (event) {
        var delta = event.screenX - this._mouseDownX,
            newLeft = this._mouseDownLeft + delta,
            stripeWidth = STRIPE_WIDTH;
        
        var newOffset = stopOffset(newLeft);
        newOffset = Math.round(newOffset * 10) / 10; // clip to one decimal place
        
        // Clip to range bounded by neighboring stops (or 
        var minOffset = (this._selected === 0) ? 0 : parseOffset(this.gradInfo.offsets[this._selected - 1]);
        var maxOffset = (this._selected === this.gradInfo.offsets.length - 1) ? 100 : parseOffset(this.gradInfo.offsets[this._selected + 1]);
        newOffset = Math.min(maxOffset, Math.max(minOffset, newOffset));
        
        this.gradInfo.offsets[this._selected] = newOffset + "%";
        this._$selectedTri.css("left", triangleLeft(newOffset));
        this._updatePreview();
        
        // FIXME: if drag far awway from stripe, delete stop (unless it's last 1? 2?)
    };
    
    GradientInlineEditor.prototype._handleColorChange = function (colorStr) {
        if (this.gradInfo.colors[this._selected] === colorStr) {
            return;  // ColorEditor fires no-op changes chen you cann setColorFromString()... maybe other times too
        }
        
        this.gradInfo.colors[this._selected] = colorStr;
        this._updatePreview();
    };

    
    /**
     * Provider registered with EditorManager
     *
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {?$.Promise} Promise resolved with a GradientInlineEditor, or null
     */
    function gradientEditorProvider(hostEditor, pos) {
        // Only provide docs when cursor is in CSS-ish content
        var langId = hostEditor.getLanguageForSelection().getId();
        if (langId !== "css" && langId !== "scss" && langId !== "less") {
            return null;
        }
        
        var gradInfo = findGradientNearCursor(hostEditor, pos);
        if (gradInfo) {
            var inlineEditor = new GradientInlineEditor(gradInfo, pos);
            inlineEditor.load(hostEditor);  // only needed to appease weird InlineWidget API

            return new $.Deferred().resolve(inlineEditor);
        }
    }
    
    
    ExtensionUtils.loadStyleSheet(module, "gradient-editor-styles.css");
    
    EditorManager.registerInlineEditProvider(gradientEditorProvider);
});
