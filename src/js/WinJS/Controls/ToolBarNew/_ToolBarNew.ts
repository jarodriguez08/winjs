// Copyright (c) Microsoft Corporation.  All Rights Reserved. Licensed under the MIT License. See License.txt in the project root for license information.
/// <reference path="../../Core.d.ts" />
import Animations = require("../../Animations");
import _Base = require("../../Core/_Base");
import _BaseUtils = require("../../Core/_BaseUtils");
import BindingList = require("../../BindingList");
import ControlProcessor = require("../../ControlProcessor");
import _Constants = require("../ToolBarNew/_Constants");
import _Command = require("../AppBar/_Command");
import _CommandingSurface = require("../CommandingSurface");
import _ICommandingSurface = require("../CommandingSurface/_CommandingSurface");
import _Control = require("../../Utilities/_Control");
import _Dispose = require("../../Utilities/_Dispose");
import _ElementUtilities = require("../../Utilities/_ElementUtilities");
import _ErrorFromName = require("../../Core/_ErrorFromName");
import _Events = require('../../Core/_Events');
import _Flyout = require("../../Controls/Flyout");
import _Global = require("../../Core/_Global");
import _Hoverable = require("../../Utilities/_Hoverable");
import _KeyboardBehavior = require("../../Utilities/_KeyboardBehavior");
import Menu = require("../../Controls/Menu");
import _MenuCommand = require("../Menu/_Command");
import Promise = require('../../Promise');
import _Resources = require("../../Core/_Resources");
import Scheduler = require("../../Scheduler");
import _ShowHideMachine = require('../../Utilities/_ShowHideMachine');
import _Signal = require('../../_Signal');
import _WriteProfilerMark = require("../../Core/_WriteProfilerMark");

require(["require-style!less/styles-toolbarnew"]);
require(["require-style!less/colors-toolbarnew"]);

"use strict";

var strings = {
    get ariaLabel() { return _Resources._getWinJSString("ui/toolbarAriaLabel").value; },
    get overflowButtonAriaLabel() { return _Resources._getWinJSString("ui/toolbarOverflowButtonAriaLabel").value; },
    get badData() { return "Invalid argument: The data property must an instance of a WinJS.Binding.List"; },
    get mustContainCommands() { return "The toolbarnew can only contain WinJS.UI.Command or WinJS.UI.AppBarCommand controls"; },
    get duplicateConstruction() { return "Invalid argument: Controls may only be instantiated one time for each DOM element"; }
};

var ClosedDisplayMode = {
    /// <field locid="WinJS.UI.ToolBarNew.ClosedDisplayMode.compact" helpKeyword="WinJS.UI.ToolBarNew.ClosedDisplayMode.compact">
    /// When the ToolBarNew is closed, the height of the actionarea is reduced such that button commands are still visible, but their labels are hidden.
    /// </field>
    compact: "compact",
    /// <field locid="WinJS.UI.ToolBarNew.ClosedDisplayMode.full" helpKeyword="WinJS.UI.ToolBarNew.ClosedDisplayMode.full">
    /// When the ToolBarNew is closed, the height of the actionarea is always sized to content and does not change between opened and closed states.
    /// </field>
    full: "full",
};

var closedDisplayModeClassMap = {};
closedDisplayModeClassMap[ClosedDisplayMode.compact] = _Constants.ClassNames.compactClass;
closedDisplayModeClassMap[ClosedDisplayMode.full] = _Constants.ClassNames.fullClass;

function getVisibleDocTop(): number {
    return _Global.pageYOffset - _Global.document.documentElement.scrollTop;
}

function getVisibleDocBottom(): number {
    return getVisibleDocTop() + _Global.innerHeight;
}

/// <field>
/// <summary locid="WinJS.UI.ToolBarNew">
/// Represents a toolbar for displaying commands.
/// </summary>
/// </field>
/// <icon src="ui_winjs.ui.toolbar.12x12.png" width="12" height="12" />
/// <icon src="ui_winjs.ui.toolbar.16x16.png" width="16" height="16" />
/// <htmlSnippet supportsContent="true"><![CDATA[<div data-win-control="WinJS.UI.ToolBarNew">
/// <button data-win-control="WinJS.UI.Command" data-win-options="{id:'',label:'example',icon:'back',type:'button',onclick:null,section:'primary'}"></button>
/// </div>]]></htmlSnippet>
/// <part name="toolbar" class="win-toolbar" locid="WinJS.UI.ToolBarNew_part:toolbar">The entire ToolBarNew control.</part>
/// <part name="toolbar-overflowbutton" class="win-toolbar-overflowbutton" locid="WinJS.UI.ToolBarNew_part:ToolBarNew-overflowbutton">The toolbar overflow button.</part>
/// <part name="toolbar-overflowarea" class="win-toolbar-overflowarea" locid="WinJS.UI.ToolBarNew_part:ToolBarNew-overflowarea">The container for toolbar commands that overflow.</part>
/// <resource type="javascript" src="//$(TARGET_DESTINATION)/js/WinJS.js" shared="true" />
/// <resource type="css" src="//$(TARGET_DESTINATION)/css/ui-dark.css" shared="true" />
export class ToolBarNew {
    private _id: string;
    private _disposed: boolean;
    private _commandingSurface: _ICommandingSurface._CommandingSurface;
    private _machine: _ShowHideMachine.ShowHideMachine;
    private _placeHolder: HTMLElement;
    private _prevInlineWidth: string; 
    //private _isOpenedMode: boolean;

    private _dom: {
        root: HTMLElement;
        commandingSurfaceEl: HTMLElement;
    }

    // <field locid="WinJS.UI.ToolBarNew.ClosedDisplayMode" helpKeyword="WinJS.UI.ToolBarNew.ClosedDisplayMode">
    /// Display options for the actionarea when the ToolBarNew is closed.
    /// </field>
    static ClosedDisplayMode = ClosedDisplayMode;

    static supportedForProcessing: boolean = true;

    private _element: HTMLElement;
    /// <field type="HTMLElement" domElement="true" hidden="true" locid="WinJS.UI.ToolBarNew.element" helpKeyword="WinJS.UI.ToolBarNew.element">
    /// Gets the DOM element that hosts the ToolBarNew.
    /// </field>
    get element() {
        return this._dom.root;
    }

    /// <field type="WinJS.Binding.List" locid="WinJS.UI.ToolBarNew.data" helpKeyword="WinJS.UI.ToolBarNew.data">
    /// Gets or sets the Binding List of WinJS.UI.Command for the ToolBarNew.
    /// </field>
    get data() {
        return this._commandingSurface.data;
    }
    set data(value: BindingList.List<_Command.ICommand>) {
        this._writeProfilerMark("set_data,info");

        if (value !== this.data) {
            if (!(value instanceof BindingList.List)) {
                throw new _ErrorFromName("WinJS.UI.ToolBarNew.BadData", strings.badData);
            }

            this._commandingSurface.data = value;
        }
    }

    private _closedDisplayMode: string;
    /// <field type="String" locid="WinJS.UI.ToolBarNew.closedDisplayMode" helpKeyword="WinJS.UI.ToolBarNew.closedDisplayMode">
    /// Gets or sets the closedDisplayMode for the ToolBarNew. Values are "compact", and "full".
    /// </field>
    get closedDisplayMode() {
        return this._commandingSurface.closedDisplayMode;
    }
    set closedDisplayMode(value: string) {
        this._writeProfilerMark("set_closedDisplayMode,info");

        var isChangingState = (value !== this._closedDisplayMode);
        if (ClosedDisplayMode[value] && isChangingState) {
            this._commandingSurface.closedDisplayMode = value;
        }
    }

    /// <field type="Boolean" hidden="true" locid="WinJS.UI.ToolBarNew.opened" helpKeyword="WinJS.UI.ToolBarNew.opened">
    /// Gets or sets whether the ToolBarNew is currently opened.
    /// </field>
    get opened(): boolean {
        return !this._machine.hidden;
    }
    set opened(value: boolean) {
        this._machine.hidden = !value;
    }

    constructor(element?: HTMLElement, options: any = {}) {
        /// <signature helpKeyword="WinJS.UI.ToolBarNew.ToolBarNew">
        /// <summary locid="WinJS.UI.ToolBarNew.constructor">
        /// Creates a new ToolBarNew control.
        /// </summary>
        /// <param name="element" type="HTMLElement" domElement="true" locid="WinJS.UI.ToolBarNew.constructor_p:element">
        /// The DOM element that will host the control. 
        /// </param>
        /// <param name="options" type="Object" locid="WinJS.UI.ToolBarNew.constructor_p:options">
        /// The set of properties and values to apply to the new ToolBarNew control.
        /// </param>
        /// <returns type="WinJS.UI.ToolBarNew" locid="WinJS.UI.ToolBarNew.constructor_returnValue">
        /// The new ToolBarNew control.
        /// </returns>
        /// </signature>

        this._writeProfilerMark("constructor,StartTM");

        // Check to make sure we weren't duplicated
        if (element && element["winControl"]) {
            throw new _ErrorFromName("WinJS.UI.ToolBarNew.DuplicateConstruction", strings.duplicateConstruction);
        }

        this._initializeDom(element || _Global.document.createElement("div"));
        this._machine = new _ShowHideMachine.ShowHideMachine({
            eventElement: this.element,
            onShow: () => {
                // Measure closed state.
                var closedBoundingRect = this._commandingSurface._getBoundingRects().actionArea;
                this._prevInlineWidth = this._dom.root.style.width;

                // Get replacement element
                var placeHolder = this._placeHolder;
                placeHolder.style.width = closedBoundingRect.width + "px";
                placeHolder.style.height = closedBoundingRect.height + "px";

                // Move ToolBar element to the body and leave ghost element in our place.
                this._dom.root.parentElement.insertBefore(placeHolder, this._dom.root);
                _Global.document.body.appendChild(this._dom.root);

                // Render opened state
                _ElementUtilities.addClass(this._dom.root, _Constants.ClassNames.openedClass);
                _ElementUtilities.removeClass(this._dom.root, _Constants.ClassNames.closedClass);
                this._dom.root.style.width = closedBoundingRect.width + "px";
                this._dom.root.style.left = closedBoundingRect.left + "px";

                this._commandingSurface._renderOpened();

                // Measure opened state
                var openedRects = this._commandingSurface._getBoundingRects();

                //
                // Determine orientation
                //

                function alignTop() {
                    this._commandingSurface.orientation = "top" // TODO: Is it safe to use the static commandingSurface "Orientation" enum for this value? (lazy loading... et al) 
                    this._dom.root.style.top = closedBoundingRect.top + "px";
                    this._dom.root.style.bottom = "auto";
                }
                function alignBottom() {
                    this._commandingSurface.orientation = "bottom" // TODO: Is it safe to use the static commandingSurface "Orientation" enum for this value? (lazy loading... et al) 
                    this._dom.root.style.top = "auto";
                    this._dom.root.style.bottom = (visibleDocBottom - closedBoundingRect.bottom) + "px";
                }

                var visibleDocTop = getVisibleDocTop(),
                    visibleDocBottom = getVisibleDocBottom();

                if (closedBoundingRect.top + openedRects.actionArea.height + openedRects.overflowArea.height <= visibleDocBottom ||
                    Math.abs(closedBoundingRect.top + openedRects.actionArea.height + openedRects.overflowArea.height - visibleDocBottom) < 1) {
                    alignTop.call(this);
                } else if (closedBoundingRect.bottom - openedRects.actionArea.height - openedRects.overflowArea.height >= visibleDocTop ||
                    Math.abs(closedBoundingRect.bottom - openedRects.actionArea.height - openedRects.overflowArea.height - visibleDocTop) < 1) {
                    alignBottom.call(this);
                } else {
                    // TODO, orient ourselves top to bottom and shrink the height of the overflowarea to make us fit within the available space.
                    alignTop.call(this);
                }

                // Animate
                return Promise.wrap();
            },

            onHide: () => {
                // Restore our placement in tbe DOM
                if (this._placeHolder.parentElement) {
                    var placeHolder = this._placeHolder;
                    placeHolder.parentElement.insertBefore(this._dom.root, placeHolder);
                    placeHolder.parentElement.removeChild(placeHolder);
                }

                // Render Closed
                this._dom.root.style.top = "";
                this._dom.root.style.right = "";
                this._dom.root.style.bottom = "";
                this._dom.root.style.left = "";
                this._dom.root.style.width = this._prevInlineWidth;
                _ElementUtilities.addClass(this._dom.root, _Constants.ClassNames.closedClass);
                _ElementUtilities.removeClass(this._dom.root, _Constants.ClassNames.openedClass);
                this._commandingSurface._renderClosed();

                return Promise.wrap();
            },
            onUpdateDom: () => {
                this._commandingSurface._updateDomImpl();
            },
            onUpdateDomWithIsShown: (isShown: boolean) => {
                this._commandingSurface._isOpenedMode = isShown;
                this._commandingSurface._updateDomImpl();
            }
        });
        // Enter the Init state.
        var signal = new _Signal();
        this._machine.initializing(signal.promise);
        
        // Initialize private state.
        this._disposed = false;
        this._commandingSurface = new _CommandingSurface._CommandingSurface(this._dom.commandingSurfaceEl, { _machine: this._machine });
        this._prevInlineWidth = "";
        
        // Initialize public properties.
        this.closedDisplayMode = _Constants.defaultClosedDisplayMode;
        this.opened = _Constants.defaultOpened;
        _Control.setOptions(this, options);
        
        // Exit the Init state.
        _ElementUtilities._inDom(this.element).then(() => {
            signal.complete();
            this._writeProfilerMark("constructor,StopTM");
        });
    }

    /// <field type="Function" locid="WinJS.UI.ToolBarNew.onbeforeopen" helpKeyword="WinJS.UI.ToolBarNew.onbeforeopen">
    /// Occurs immediately before the control is opened.
    /// </field>
    onbeforeshow: (ev: CustomEvent) => void;
    /// <field type="Function" locid="WinJS.UI.ToolBarNew.onafteropen" helpKeyword="WinJS.UI.ToolBarNew.onafteropen">
    /// Occurs immediately after the control is opened.
    /// </field>
    onaftershow: (ev: CustomEvent) => void;
    /// <field type="Function" locid="WinJS.UI.ToolBarNew.onbeforeclose" helpKeyword="WinJS.UI.ToolBarNew.onbeforeclose">
    /// Occurs immediately before the control is closed.
    /// </field>
    onbeforehide: (ev: CustomEvent) => void;
    /// <field type="Function" locid="WinJS.UI.ToolBarNew.onafterclose" helpKeyword="WinJS.UI.ToolBarNew.onafterclose">
    /// Occurs immediately after the control is closed.
    /// </field>
    onafterhide: (ev: CustomEvent) => void;

    open(): void {
        /// <signature helpKeyword="WinJS.UI.ToolBarNew.open">
        /// <summary locid="WinJS.UI.ToolBarNew.open">
        /// Opens the ToolBarNew
        /// </summary>
        /// </signature>
        this._commandingSurface.open();
    }

    close(): void {
        /// <signature helpKeyword="WinJS.UI.ToolBarNew.close">
        /// <summary locid="WinJS.UI.ToolBarNew.close">
        /// Closes the ToolBarNew
        /// </summary>
        /// </signature>
        this._commandingSurface.close();
    }

    dispose() {
        /// <signature helpKeyword="WinJS.UI.ToolBarNew.dispose">
        /// <summary locid="WinJS.UI.ToolBarNew.dispose">
        /// Disposes this ToolBarNew.
        /// </summary>
        /// </signature>
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this._machine.dispose();
        this._commandingSurface.dispose();
        _Dispose.disposeSubTree(this.element);
        if (this._placeHolder.parentElement) {

            //TODO: render the toolbar closed and put it back in the DOM where the the placeHolder is

            this._placeHolder.parentElement.removeChild(this._placeHolder); 
            //TODO: Also, does the placeHolder element need a dispose method on it as well, so that will be called if its parent subtree is disposed?
            // If the placeholder is in the DOM at all, it means the toolbar is temporarily open and absolutely positioned in the docuent.body.
        }
    }

    forceLayout() {
        /// <signature helpKeyword="WinJS.UI.ToolBarNew.forceLayout">
        /// <summary locid="WinJS.UI.ToolBarNew.forceLayout">
        /// Forces the ToolBarNew to update its layout. Use this function when the window did not change size, but the container of the ToolBarNew changed size.
        /// </summary>
        /// </signature>
        this._commandingSurface.forceLayout();
    }

    private _writeProfilerMark(text: string) {
        _WriteProfilerMark("WinJS.UI.ToolBarNew:" + this._id + ":" + text);
    }

    private _initializeDom(root: HTMLElement): void {

        this._writeProfilerMark("_intializeDom,info");

        // Attaching JS control to DOM element
        root["winControl"] = this;

        this._id = root.id || _ElementUtilities._uniqueID(root);

        if (!root.hasAttribute("tabIndex")) {
            root.tabIndex = -1;
        }

        _ElementUtilities.addClass(root, _Constants.ClassNames.controlCssClass);
        _ElementUtilities.addClass(root, _Constants.ClassNames.disposableCssClass);

        // Make sure we have an ARIA role
        var role = root.getAttribute("role");
        if (!role) {
            root.setAttribute("role", "menubar");
        }

        var label = root.getAttribute("aria-label");
        if (!label) {
            root.setAttribute("aria-label", strings.ariaLabel);
        }

        // Create element for commandingSurface. 
        // Its constructor will parse child elements as AppBarCommands
        var commandingSurfaceEl = document.createElement("DIV");
        _ElementUtilities._reparentChildren(root, commandingSurfaceEl);
        root.appendChild(commandingSurfaceEl);

        this._dom = {
            root: root,
            commandingSurfaceEl: commandingSurfaceEl,
        };

        var placeHolder = _Global.document.createElement("DIV");
        _ElementUtilities.addClass(placeHolder, _Constants.ClassNames.placeHolderCssClass);
        this._placeHolder = placeHolder;
    }
}

_Base.Class.mix(ToolBarNew, _Events.createEventProperties(
    _Constants.EventNames.beforeShow,
    _Constants.EventNames.afterShow,
    _Constants.EventNames.beforeHide,
    _Constants.EventNames.afterHide));

// addEventListener, removeEventListener, dispatchEvent
_Base.Class.mix(ToolBarNew, _Control.DOMEventMixin);