"use strict";

var http            = require("http"),
    https           = require("https"),
    express         = require("express"),
    bodyParser      = require("body-parser"),
    cookieParser    = require("cookie-parser"),
    methodOverride  = require("method-override"),
    serveStatic     = require("serve-static"),
    favicon         = require("static-favicon"),
    exphbs          = require("express3-handlebars"),
    path            = require("path"),
    url             = require("url"),
    fs              = require("fs"),
    async           = require("async"),
    auth            = require("./auth"),
    pckg            = require("../package.json"),
    controllers     = require("./controllers"),
    rest_api        = require("./rest-api"),
    ignorePaths     = new RegExp("^/public/|/content/|/client/", "i"),
    resourcesRoot   = "/res/" + pckg.version,
    servers         = [],
    session,
    hbs;

function dummyCb(err) {
    if (err) {
        throw err;
    }
}

function sessionHandler(req, res, next) {
    if (ignorePaths.test(req.url)) {
        return next();
    }
    session(req, res, next);
}

hbs = exphbs.create({
    layoutsDir: path.resolve("server", "views", "layouts"),
    defaultLayout: "main",
    extname: ".html",
    helpers: {
        version: function () {
            return pckg.version;
        },
        resources: function () {
            return resourcesRoot;
        }
    }
});

function addServer(opts, app, callback) {
    var srv, cred;
    if (opts.protocol === "https") {
        cred = {};
        if (opts.pfx) {
            cred.pfx = fs.readFileSync(opts.pfx);
        } else {
            cred.key = fs.readFileSync(opts.key);
            cred.cert = fs.readFileSync(opts.cert);
        }
        srv = https.createServer(cred, app);
    } else {
        srv = http.createServer(app);
    }
    srv.listen(opts.port, function () {
        console.log("listening on ", url.format(opts));
        callback(null, srv);
    });
    srv._inst_opts = opts;
    servers.push(srv);
}

function init(opts, callback) {
    if (typeof opts === "function") {
        callback = opts;
        opts = null;
    }

    if (!callback) {
        callback = dummyCb;
    }

    if (servers.length) {
        return callback(new Error("Server is already running."));
    }

    if (!opts) {
        opts = require("./config");
    } else if (typeof opts === "number") {
        opts = { instances: [{ port: opts, hostname: "localhsot", protocol: "http" }] };
    }

    var app = express();
        app.set("swaggerUrl", url.format(opts.instances[opts.swaggerInst || 0]));
        app.set("views", path.resolve("server", "views"));
        app.engine("html", hbs.engine);
        app.set("view engine", "html");

        app.use(favicon())
            .use(bodyParser())
            .use(methodOverride())
// FIXME: Change the key below with randomly generated number. You could use (http://randomkeygen.com).
            .use(cookieParser("95DA438DE3A81"))
            .use(resourcesRoot, serveStatic(path.resolve("client")));

    async.series(
        [
            function (done) {
                auth.init(app, done);
            },
            function (done) {
                rest_api.init(app, done);
            },
            function (done) {
                controllers.init(app, done);
            }
        ], function (err) {
            if (err) {
                return callback(err);
            }
            callback(null, app, opts);
        }
    );
}

function start(opts, callback) {
    if (typeof port === "function") {
        callback = opts;
        opts = null;
    }

    if (!callback) {
        callback = dummyCb;
    }

    init(opts, function (err, app, opts) {
        if (err) {
            return callback(err);
        }

        async.each(opts.instances, function (inst, done) {
            addServer(inst, app, done);
        }, function () {
            exports.app = app;
            exports.servers = servers;
            callback();
        });
    });
}

function stop(callback) {
    if (servers.length) {
        async.each(servers, function (srv, done) {
            console.log("stopping on ", url.format(srv._inst_opts));
            srv.close(done);
        }, function (err) {
            exports.app = null;
            exports.servers = null;
            servers.length = 0;
            if (callback) {
                callback(err);
            }
        });
    } else if (callback) {
        callback();
    }
}

exports.init = init;
exports.start = start;
exports.stop = stop;
