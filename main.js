/*
 * Copyright (c) 2014, Peter Flynn. All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, regexp: true, continue: true */
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
    
    var _lastOriginNum = 0;
    
    function splitUnit(str) {
        return str.match(/([\d\.\-]+)([^\s]*)/);
    }
    
    var STRIPE_WIDTH = 300;  // TODO: calculate dynamically
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
    
    
    var cssColorNames = "aliceblue,antiquewhite,aqua,aquamarine,azure,beige,bisque,black,blanchedalmond,blue,blueviolet,brown,burlywood,cadetblue,chartreuse,chocolate,coral,cornflowerblue,cornsilk,crimson,cyan,darkblue,darkcyan,darkgoldenrod,darkgray,darkgreen,darkgrey,darkkhaki,darkmagenta,darkolivegreen,darkorange,darkorchid,darkred,darksalmon,darkseagreen,darkslateblue,darkslategray,darkslategrey,darkturquoise,darkviolet,deeppink,deepskyblue,dimgray,dimgrey,dodgerblue,firebrick,floralwhite,forestgreen,fuchsia,gainsboro,ghostwhite,gold,goldenrod,gray,green,greenyellow,grey,honeydew,hotpink,indianred,indigo,ivory,khaki,lavender,lavenderblush,lawngreen,lemonchiffon,lightblue,lightcoral,lightcyan,lightgoldenrodyellow,lightgray,lightgreen,lightgrey,lightpink,lightsalmon,lightseagreen,lightskyblue,lightslategray,lightslategrey,lightsteelblue,lightyellow,lime,limegreen,linen,magenta,maroon,mediumaquamarine,mediumblue,mediumorchid,mediumpurple,mediumseagreen,mediumslateblue,mediumspringgreen,mediumturquoise,mediumvioletred,midnightblue,mintcream,mistyrose,moccasin,navajowhite,navy,oldlace,olive,olivedrab,orange,orangered,orchid,palegoldenrod,palegreen,paleturquoise,palevioletred,papayawhip,peachpuff,peru,pink,plum,powderblue,purple,red,rosybrown,royalblue,saddlebrown,salmon,sandybrown,seagreen,seashell,sienna,silver,skyblue,slateblue,slategray,slategrey,snow,springgreen,steelblue,tan,teal,thistle,tomato,turquoise,violet,wheat,white,whitesmoke,yellow,yellowgreen";
    cssColorNames = cssColorNames.split(",").reduce(function (obj, color) { obj[color] = true; return obj; }, {});
    
    function findGradientNearCursor(editor, pos) {
        var line = editor.document.getLine(pos.line),
            match = line.match(/((-webkit-|-moz-|-ms-|-o-)?linear-gradient)\((.*)\)/); // FIXME: matches too much on lines w/ multiple comma-separated gradients
        
        if (match && match[3]) {
            // Extract array of color stops (color + offset pairs)
            var colors = [], offsets = [], direction;
            var paramsStr = match[3];
            var gradientPartRE = /((?:rgba?|hsla?)\s*\([^\)]+\)|#?[^\s,]+)(?:\s+(\S+))?\s*(,|$)/g,
                stopMatch;
            while ((stopMatch = gradientPartRE.exec(paramsStr)) !== null) {
                // The regex above will collect the optional direction expression as the first color stop - check for that too
                if (direction === undefined) {
                    var colorMatch = stopMatch[1];
                    if (colorMatch[0] !== "#" && colorMatch.indexOf("rgb") !== 0 && colorMatch.indexOf("hsl") !== 0 && !cssColorNames[colorMatch]) {
                        direction = colorMatch;
                        if (stopMatch[2]) {  // a direction like "to left" will land in both regex slots
                            direction += " " + stopMatch[2];
                        }
                        continue;
                    } else {
                        direction = "";
                    }
                }
                colors.push(stopMatch[1]);
                offsets.push(stopMatch[2]); // might be missing - offset is optional; inferred value filled in below
            }
            
            // Fix up missing color stop offsets
            if (!offsets[0]) {
                offsets[0] = "0%";
            }
            if (!offsets[offsets.length - 1]) {
                offsets[offsets.length - 1] = "100%";
            }
            // "for each run of adjacent color-stops without positions, set their positions so that they are evenly spaced between the preceding and following color-stops with positions"
            var i;
            var lastWithPos = -1;
            for (i = 0; i < offsets.length; i++) {
                if (offsets[i]) {
                    // End of a run with no pos? Distribute the rest evenly between them
                    if (lastWithPos !== i - 1) {
                        // numStops is 1 larger than the number of stops missing an offset - the number that the increment is derived from
                        // (e.g. if 2 stops are missing a number, we're incremening in 1/3s of the range between the two specified stops)
                        var numStops = i - lastWithPos,
                            range = parseOffset(offsets[i]) - parseOffset(offsets[lastWithPos]);
                        var k;
                        for (k = lastWithPos + 1; k < i; k++) {
                            var offset = (k - lastWithPos) / numStops * range;
                            offsets[k] = offset + "%";
                        }
                    }
                    lastWithPos = i;
                }
            }
            
            var gradInfo = {
                origPos: {line: pos.line, ch: match.index},
                origText: match[0],
                prefix: match[1],
                // direction is t/l/r/b (with optional "to\s+") prefix, or number with mandatory deg/grad/rad/turn suffix (w/ no space)
                direction: direction, //paramsStr.split(/,\s*/)[0],
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
        this.origin = "+InlineGradientEditor" + (_lastOriginNum++);
        
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
        var inlineWidgetHeight = 260; // TODO: calculate dynamically
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
        
        function toModernDir(dir, gradPrefix) {
            // Modern:
            //  dir = angle | "to " + top/bottom/left/right
            //  "to top" = grad starts at bottom
            //  angle 0deg = North, higher = CW
            // Old syntax:
            //  dir = angle | top/bottom/left/right
            //  "top" = grad starts at top
            //  angle 0deg = East, higher = CCW
            //    (so converting to modern means inverting angle & then rotating 90deg CCW)
            if (!dir) { return dir; }
            if (!gradPrefix || gradPrefix[0] !== "-") { return dir; }  // already modern format
            
            if (isNaN(parseFloat(dir))) {
                // Convert angle names from "from" (implicit) style to "to" (explicit)
                if (dir.indexOf("left") !== -1) {
                    dir = dir.replace("left", "right");
                } else {
                    dir = dir.replace("right", "left");
                }
                if (dir.indexOf("top") !== -1) {
                    dir = dir.replace("top", "bottom");
                } else {
                    dir = dir.replace("bottom", "top");
                }
                return "to " + dir;
            } else {
                // Convert angle numbers from CCW East to CW North
                var numUnit = splitUnit(dir);
                return (-parseFloat(numUnit[1]) + 90) + numUnit[2];
            }
        }
        function optional(part) {
            return part ? part + ", " : "";
        }
        
        var stripeGradient  = "linear-gradient(to right," + stops + ")",                       // grad used in draggable stripe (always left->right)
            previewGradient = "linear-gradient(" + optional(toModernDir(gradInfo.direction, gradInfo.prefix)) + stops + ")", // grad used in large preview rect (uses modern dir form)
            fullGradient    = gradInfo.prefix + "(" + optional(gradInfo.direction) + stops + ")";          // grad written out to code (uses code's prefix's dir form)
        
        this.$htmlContent.find(".stripe-preview").css("background", stripeGradient);
        this.$htmlContent.find(".gradient-preview").css("background", previewGradient);
        
        if (!suppressChange) {
            var gradInCode = findGradientNearCursor(this.hostEditor, this.lastPos);
            this.lastPos = gradInCode.origPos;
            this.hostEditor.document.replaceRange(fullGradient, this.lastPos, { line: this.lastPos.line, ch: this.lastPos.ch + gradInCode.origText.length },
                                                  this.origin);
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
