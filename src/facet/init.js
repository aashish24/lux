(function() {

function initialize_context_globals(gl)
{
    gl._facet_globals = {};

    // when Facet.init is called with a display callback, that gets stored in
    // gl._globals.display_callback
    gl._facet_globals.display_callback = Facet.Scene.render;

    // Objects stored in the scene are automatically drawn
    gl._facet_globals.scene = [];

    // batches can currently be rendered in "draw" or "pick" mode.
    // draw: 0
    // pick: 1
    // these are indices into an array defined inside Facet.bake
    // For legibility, they should be strings, but for speed, they'll be integers.
    gl._facet_globals.batch_render_mode = 0;

    // epoch is the initial time being tracked by the context.
    // It's updated every time the scene draws.
    gl._facet_globals.epoch = new Date().getTime() / 1000;

    // pre and post_display_list are callback lists managed by Facet.Scene.invalidate
    // to avoid multiple invocations of requestAnimFrame in the same frame (which will
    // guarantee that multiple invocations of Facet.Scene.invalidate will be triggered
    // on the very next requestAnimFrame issued)

    gl._facet_globals.pre_display_list = [];
    gl._facet_globals.post_display_list = [];

    gl._facet_globals.devicePixelRatio = undefined;
}

////////////////////////////////////////////////////////////////////////////////

Facet.init = function(canvas, opts)
{
    canvas.unselectable = true;
    canvas.onselectstart = function() { return false; };
    var gl;
    var clearColor, clearDepth;
    opts = _.defaults(opts || {}, { clearColor: [1,1,1,0],
                                    clearDepth: 1.0,
                                    attributes: {
                                        alpha: true,
                                        depth: true
                                    },
                                    highDPS: true
                                  });
    if (Facet.is_shade_expression(opts.clearColor)) {
        if (!opts.clearColor.is_constant())
            throw "clearColor must be constant expression";
        if (!opts.clearColor.type.equals(Shade.Types.vec4))
            throw "clearColor must be vec4";
        clearColor = _.toArray(opts.clearColor.constant_value());
    } else
        clearColor = opts.clearColor;

    // FIXME This should be a "is Shade expression" check
    if (Facet.is_shade_expression(opts.clearDepth)) {
        if (!opts.clearDepth.is_constant())
            throw "clearDepth must be constant expression";
        if (!opts.clearDepth.type.equals(Shade.Types.float_t))
            throw "clearDepth must be float";
        clearDepth = opts.clearDepth.constant_value();
    } else
        clearDepth = opts.clearDepth;

    var devicePixelRatio = 1;
    if (opts.highDPS) {
        devicePixelRatio = window.devicePixelRatio || 1;
        canvas.style.width = canvas.width;
        canvas.style.height = canvas.height;
        canvas.width = canvas.clientWidth * devicePixelRatio;
        canvas.height = canvas.clientHeight * devicePixelRatio;
    }

    try {
        if ("attributes" in opts) {
            gl = WebGLUtils.setupWebGL(canvas, opts.attributes);
            var x = gl.getContextAttributes();
            for (var key in opts.attributes) {
                if (opts.attributes[key] !== x[key]) {
                    throw ("requested attribute " + 
                           key + ": " + opts.attributes[key] +
                           " could not be satisfied");
                }
            }
        } else
            gl = WebGLUtils.setupWebGL(canvas);
        if (!gl)
            throw "failed context creation";
        if ("interactor" in opts) {
            for (var key in opts.interactor.events) {
                if (opts[key]) {
                    opts[key] = (function(handler, interactor_handler) {
                        return function(event) {
                            var v = handler(event);
                            return v && interactor_handler(event);
                        };
                    })(opts[key], opts.interactor.events[key]);
                } else {
                    opts[key] = opts.interactor.events[key];
                }
            }
        }
        
        if (opts.debugging) {
            var throwOnGLError = function(err, funcName, args) {
                throw WebGLDebugUtils.glEnumToString(err) + 
                    " was caused by call to " + funcName;
            };
            gl = WebGLDebugUtils.makeDebugContext(gl, throwOnGLError, opts.tracing);
        }
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;
        var canvas_events = ["mouseover", "mousemove", "mousedown", "mouseout", "mouseup"];
        for (var i=0; i<canvas_events.length; ++i) {
            var ename = canvas_events[i];
            var listener = opts[ename];
            if (!_.isUndefined(listener)) {
                (function(listener) {
                    function internal_listener(event) {
                        if (_.isUndefined(event.offsetX)) {
			    event.offsetX = event.pageX - event.target.offsetLeft;
			    event.offsetY = event.pageY - event.target.offsetTop;
                        }
                        event.facetX = event.offsetX * gl._facet_globals.devicePixelRatio;
                        event.facetY = gl.viewportHeight - event.offsetY * gl._facet_globals.devicePixelRatio;
                        return listener(event);
                    }
                    canvas.addEventListener(ename, Facet.on_context(gl, internal_listener), false);
                })(listener);
            }
        }
        if (!_.isUndefined(opts.mousewheel)) {
            $(canvas).bind('mousewheel', opts.mousewheel);
        };

        var ext;
        var exts = gl.getSupportedExtensions(); // _.map(gl.getSupportedExtensions(), function (x) { 
        //     return x.toLowerCase();
        // });
        _.each(["OES_texture_float", "OES_standard_derivatives"], function(ext) {
            if (exts.indexOf(ext) === -1) {
                alert(ext + " is not available on your browser/computer! " +
                      "Facet will not work, sorry.");
                throw "insufficient GPU support";
            } else {
                console.log(ext, gl.getExtension(ext));
            }
        });
    } catch(e) {
        alert(e);
    }
    if (!gl) {
        alert("Could not initialise WebGL, sorry :-(");
        throw "failed initalization";
    }

    initialize_context_globals(gl);
    gl._facet_globals.devicePixelRatio = devicePixelRatio;

    Facet.set_context(gl);

    if (opts.display) {
        gl._facet_globals.display_callback = opts.display;
    }

    gl.display = function() {
        this.viewport(0, 0, this.viewportWidth, this.viewportHeight);
        this.clearDepth(clearDepth);
        this.clearColor.apply(this, clearColor);
        this.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        var raw_t = new Date().getTime() / 1000;
        var new_t = raw_t - this._facet_globals.epoch;
        var old_t = this.parameters.now.get();
        this.parameters.frame_duration.set(new_t - old_t);
        this.parameters.now.set(new_t);
        this._facet_globals.display_callback();
    };
    gl.resize = function(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.parameters.width.set(width);
        this.parameters.height.set(height);
        this.canvas.width = width;
        this.canvas.height = height;
        this.display();
    };
    gl.parameters = {};
    gl.parameters.width = Shade.parameter("float", gl.viewportWidth);
    gl.parameters.height = Shade.parameter("float", gl.viewportHeight);
    gl.parameters.now = Shade.parameter("float", gl._facet_globals.epoch);
    gl.parameters.frame_duration = Shade.parameter("float", 0);

    return gl;
};

})();
