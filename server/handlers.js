
var fs = require ( "fs" );
var path = require ( "path" );
var static = require ( "node-static" );
var cookie = require ( "cookie" );
var LineByLineReader = require ( "line-by-line" );
var config = require ( "./config.js" );

function find_pictures ( dir, fout, parent_path ) {
	// console.log ( "find_pictures: " + dir + ", " + parent_path );

	var full_path = path.join ( config.BASEDIR, parent_path, dir );
	var items = fs.readdirSync ( full_path );
	items.forEach ( function ( item ) {
		var stat = fs.statSync ( path.join ( full_path, item ) );
		if ( stat.isFile () ) fs.writeSync ( fout, path.join ( parent_path, dir, item + "\n" ) );
		if ( stat.isDirectory () ) find_pictures ( item, fout, path.join ( parent_path, dir ) );
	} );
}

function build_file_list ( request, response, parsed_url ) {
	var cookies = cookie.parse ( request.headers.cookie );
	var client_id = cookies [ "session" ];

	if ( ! client_id ) throw "Invalid session ID";

	var fout = fs.openSync ( client_id + "_pictures.txt", "w" );
	var dir_list = parsed_url.query [ "dir" ];
	// if it's a single item cast it into an Array
	if ( ! Array.isArray ( dir_list ) ) dir_list = new Array ( dir_list );

	try {
		for ( var i = 0; i < dir_list.length; i++ ) {
			var d = dir_list [ i ];
			find_pictures ( d, fout, "" );
		}

	} finally {
		fs.closeSync ( fout );
	}

	fout = fs.openSync ( client_id + "_position.txt", "w" );
	fs.writeSync ( fout, "-1\n" );
	fs.closeSync ( fout );
}

function view_pictures ( request, response, parsed_url ) {

	console.log ( "Parsed query:" );
	console.log ( parsed_url.query );

	try {
		build_file_list ( request, response, parsed_url )

		response.writeHead ( 200, { "Content-type": "text/html" } );
		response.write ( fs.readFileSync ( "../web/picture.html" ) );

	} catch ( err ) {

		response.writeHead ( 200, { "Content-type": "text/plain" } );
		response.write ( err );
	}

	response.end ();
}

function get_picture ( request, response, parsed_url ) {
	var params = parsed_url.query;
	var cookies = cookie.parse ( request.headers.cookie );
	var client_id = cookies [ "session" ];

	if ( ! client_id ) {
		response.writeHead ( 200, { "Content-type": "text/plain" } );
		response.write ( "Invalid client ID" );
		response.end ();
		return;
	};

	var stat = fs.statSync ( client_id + "_pictures.txt" );
	if ( stat.size == 0 ) {
		console.log ( "Empty pictures list!" );
		response.writeHead ( 200, { "Content-type": "text/plain" } );
		response.write ( "Empty pictures list" );
		response.end ();
		return;
	}

	var file_server = new static.Server ( config.BASEDIR );
	var pos = fs.readFileSync ( client_id + "_position.txt" );
	pos = parseInt ( pos ) + 1;
	console.log ( "newpos: " + pos );
	var lr = new LineByLineReader ( client_id + "_pictures.txt" );
	var count = 0;
	lr.on ( "line", function ( line ) {
		//console.log ( "count: " + count + "; line: " + line );
		if ( count == pos ) {
			lr.close ()
			file_server.serveFile ( line, 200, {}, request, response );
		};
		count += 1;
	} );

	lr.on ( "end", function () {
		// if we got past the end of the file we start from the beginning:
		// 1) set the picture index to -1
		if ( pos >= count ) pos = -1;

		fout = fs.openSync ( client_id + "_position.txt", "w" );
		fs.writeSync ( fout, pos + "\n" );
		fs.closeSync ( fout );

		// 2) call myself to display the first picture immediately
		if ( pos == -1 ) get_picture ( request, response, parsed_url );
	} );
}

function get_dir_tree ( request, response, parsed_url ) {
	var parent_path = parsed_url.query [ "id" ];
	if ( parent_path == "#" ) parent_path = "";

	var res = [];
	var full_path = path.join ( config.BASEDIR, parent_path );
	var items = fs.readdirSync ( full_path );
	items.forEach ( function ( item ) {
		var stat = fs.statSync ( path.join ( full_path, item ) );
		if ( stat.isDirectory () ) res.push ( { text: item, children: true, id: path.join ( parent_path, item ) } );
	} );


	response.writeHead ( 200, { "Content-type": "application/json" } );
	response.write ( JSON.stringify ( res ) );
	response.end ();
}

function get_client_id ( request, response, parsed_url ) {
	response.writeHead ( 200, { "Content-type": "text/plain" } );
	// generate a new (sufficiently) random ID for the session
	response.write ( 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace( /[xy]/g, function ( c ) {
		var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
		return v.toString(16);
	}));
	response.end ();
}

function get_handlers () {
	return {
		"/start": view_pictures,
		"/picture": get_picture,
		"/getdirtree": get_dir_tree,
		"/get_client_id": get_client_id
	}
}


exports.get_handlers = get_handlers;


