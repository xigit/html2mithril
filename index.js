/*
    This gulp plugin converts raw html files into mithril m() syntax.
    The original code is written by Leo Horie (https://github.com/lhorie)
    Original code on a web application can be found here: http://lhorie.github.io/mithril/tools/template-converter.html

*/

// Scripts used
var through = require('through2');
var gutil = require('gulp-util');

var jsdom = require("jsdom").jsdom;

var PluginError = gutil.PluginError;
var path = require('path');

// Consts
const PLUGIN_NAME = 'mithrilify';

function mithrilify(obj, postRender) {

    // Creating a stream through which each file will pass
    var stream = through.obj(function(file, enc, callback) {
        var source = String(file.contents);

        var document = jsdom();

        var templateConverter = {};
        templateConverter.DOMFragment = function(markup) {
            if (markup.indexOf("<!doctype") > -1) return [new DOMParser().parseFromString(markup, "text/html").childNodes[1]]
            var container = document.createElement("div");
            container.innerHTML = markup;
            return container.childNodes;
        }
        templateConverter.VirtualFragment = function recurse(domFragment) {
            var virtualFragment = [];
            for (var i = 0, el; el = domFragment[i]; i++) {
                if (el.nodeType == 3) {
                    virtualFragment.push(el.nodeValue);
                }
                else if (el.nodeType == 1) {
                    var attrs = {};
                    for (var j = 0, attr; attr = el.attributes[j]; j++) {
                        attrs[attr.name] = attr.value;
                    }

                    virtualFragment.push({tag: el.nodeName.toLowerCase(), attrs: attrs, children: recurse(el.childNodes)});
                }
            }
            return virtualFragment;
        }
        templateConverter.Template = function recurse() {
            if (Object.prototype.toString.call(arguments[0]) == "[object String]") {
                return new recurse(new templateConverter.VirtualFragment(new templateConverter.DOMFragment(arguments[0])));
            }

            var virtualFragment = arguments[0], level = arguments[1]
            if (!level) level = 1;

            var tab = "\n" + new Array(level + 1).join("\t");
            var virtuals = [];
            for (var i = 0, el; el = virtualFragment[i]; i++) {
                if (typeof el == "string") {
                    if (el.match(/\t| {2,}/g) && el.trim().length == 0) virtuals.indented = true;
                    else virtuals.push('"' + el.replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"');
                }
                else {
                    var virtual = "";
                    if (el.tag != "div") virtual += el.tag;
                    if (el.attrs["class"]) {
                        virtual += "." + el.attrs["class"].replace(/\t+/g, " ").split(" ").join(".");
                        delete el.attrs["class"];
                    }
                    var attrNames = Object.keys(el.attrs).sort()
                    var isHref = false;
                    for (var j = 0, attrName; attrName = attrNames[j]; j++) {
                        if (attrName != "style") virtual += "[" + attrName + "='" + el.attrs[attrName].replace(/'/g, "\\'") + "']";
                        if (attrName === "href") {
                            isHref = true;
                        }
                    }
                    virtual = '"' + virtual + '"';

                    var style = ""
                    if (el.attrs.style) {
                        virtual += ", {style: " + ("{\"" + el.attrs.style.replace(/:/g, "\": \"").replace(/;/g, "\", \"") + "}").replace(/, "}|"}/, "}") + "}"
                    }

                    if (isHref) {
                        virtual += ", {config: m.route}";
                    }

                    if (el.children.length > 0) {
                        virtual += ", " + recurse(el.children, level + 1);
                    }
                    virtual = "m(" + virtual + ")";
                    virtuals.push(virtual);
                }
            }
            if (!virtuals.indented) tab = "";

            var isInline = virtuals.length == 1 && virtuals[0].charAt(0) == '"';
            var template = isInline ? virtuals.join(", ") : "[" + tab + virtuals.join("," + tab) + tab.slice(0, -1) + "]";
            return new String(template);
        }

        templateConverter.controller = function(source) {
            var template =  new templateConverter.Template(source);
            return template;
        };

        var output = templateConverter.controller(source).toString();
        if(postRender){
            var config = '{ config: ctrl.'+postRender+' },'
        } else {
            var config = "";
        }
        if(obj){
            var objName = obj;
        }else {
            // get objectname from filename
            var filename = path.basename(file.path);
            var objName = filename.substring(0, filename.length - 5);
        }
        var viewjs =  objName + '.view =  function(ctrl){ return m("div",'+config+' ['+output+']) }';

        var outputBuffer = new Buffer(viewjs);
        if (file.isNull()) {
            // Do nothing if no contents
            throw new PluginError(PLUGIN_NAME, "The file is empty or there was no file. ");

        }
        if (file.isBuffer()) {
            file.contents = Buffer.concat([outputBuffer]);
        }

        if (file.isStream()) {
            throw new PluginError(PLUGIN_NAME, "Stream isn't supported yet. ");
        }

        this.push(file);
        return callback();

    });

    return stream;
};

module.exports = mithrilify;