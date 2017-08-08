
port = 8888;

var http = require ( "http" );
var url = require ( "url" );
var path = require ( "path" );
var static = require ( "node-static" );
var querystring = require ( "querystring" );
// node built-in extend function
var extend = require ( "util" )._extend;

var handler_module = require ( "./handlers.js" );

var document_root = new static.Server ( "../web" );

function reload ( modname ) {
	abspath = path.resolve ( modname );
	delete require.cache [ abspath ];
	return require ( modname );
}

function call_handler ( request, response, parsed_url ) {
	// this is done not to restart the server each time an handler is modified
	handler_module = reload ( "./handlers.js" )
	var handlers = handler_module.get_handlers ();

	var func = handlers [ parsed_url.pathname ];

	if ( func ) {
		try {
			func ( request, response, parsed_url );

		} catch ( err ) {
			console.log ( "ERROR: " + err.code + " - " + err.message );
			console.log ( err.stack );
		}

	} else {
		document_root.serve ( request, response, function ( err, result ) {
			if ( err ) {
				response.writeHead ( err.status, err.headers );
				response.write ( "Errore nel recuperare il file '" + request.url + "': " + err.message );
				response.end ();
			}
		} );
	}
}

function handle_request ( request, response ) {
	var parsed_url = url.parse ( request.url, true );
	console.log ( "Request for " + parsed_url.pathname + " received." );

	if ( request.method == "POST" ) {
		var body = "";
		request.on ( "data", function ( data ) {
			body += data;
			// 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
			if ( body.length > 1e6 ) {
				// flood attack or faulty client, nuke request
				request.connection.destroy ();
			}
		} );

		request.on ( "end", function () {
			var post_data = querystring.parse ( body );

			// merge POST data with GET data (if any)
			extend ( parsed_url.query, post_data );

			call_handler ( request, response, parsed_url );
		} );

	} else {
		call_handler ( request, response, parsed_url );
	}
}


console.log ( "Starting server on port " + port );

http.createServer ( handle_request ).listen ( port );


