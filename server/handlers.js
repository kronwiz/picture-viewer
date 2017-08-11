
var fs = require ( "fs" );
var path = require ( "path" );
var os = require ( "os" );
var path = require ( "path" );
var util = require ( "util" );
var static = require ( "node-static" );
var cookie = require ( "cookie" );
var LineByLineReader = require ( "line-by-line" );
var moment = require ( "moment" );

var config = require ( "./config.js" );

// the %s stands for the client id
var picture_list_file = path.join ( os.tmpdir (), "%s_pictures.txt" )
var picture_position_file = path.join ( os.tmpdir (), "%s_position.txt" )


function response_write_error ( response, err ) {
	if ( typeof err == "string" )
		msg = err;
	else
		msg = err.message;

	console.log ( "ERROR: " + msg );
	if ( err.hasOwnProperty ( "stack" ) ) console.log ( err.stack );

	response.writeHead ( 200, { "Content-type": "text/plain" } );
	response.write ( msg );
}

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
	if ( request.headers.cookie ) {
		var cookies = cookie.parse ( request.headers.cookie );
		var client_id = cookies [ "session" ];
	}

	if ( ! client_id ) throw "Invalid session ID";

	var fout = fs.openSync ( util.format ( picture_list_file, client_id ), "w" );
	var dir_list = parsed_url.query [ "dir" ];

	// if it's a single item cast it into an Array
	if ( ! Array.isArray ( dir_list ) ) var dir_list_array = new Array ();
	// it may be undefined, so it's better check
	if ( dir_list ) dir_list_array.push ( dir_list );
	dir_list = dir_list_array;

	try {
		for ( var i = 0; i < dir_list.length; i++ ) {
			var d = dir_list [ i ];
			find_pictures ( d, fout, "" );
		}

	} finally {
		fs.closeSync ( fout );
	}

	fout = fs.openSync ( util.format ( picture_position_file, client_id ), "w" );
	fs.writeSync ( fout, "-1\n" );
	fs.closeSync ( fout );
}

function view_pictures ( request, response, parsed_url ) {
	// before starting see if there are old temporary files to be removed
	clean_temp_files ();

	//console.log ( "Parsed query:" );
	//console.log ( parsed_url.query );

	var dir_list = parsed_url.query [ "dir" ];
	var delay = parsed_url.query [ "delay" ];

	try {
		if ( dir_list ) build_file_list ( request, response, parsed_url )

		var picture_page = fs.readFileSync ( "../web/picture.html" );
		picture_page = picture_page.toString ().replace ( "__DELAY__", ( delay * 1000 ).toString () );

		response.writeHead ( 200, { "Content-type": "text/html" } );
		response.write ( picture_page );

	} catch ( err ) {

		response_write_error ( response, err );
	}

	response.end ();
}

function get_picture ( request, response, parsed_url ) {
	var params = parsed_url.query;
	var cookies = cookie.parse ( request.headers.cookie );
	var client_id = cookies [ "session" ];

	if ( ! client_id ) {
		response_write_error ( response, "Invalid client ID" );
		response.end ();
		return;
	};

	var stat = fs.statSync ( util.format ( picture_list_file, client_id ) );
	if ( stat.size == 0 ) {
		response_write_error ( response, "Empty pictures list" );
		response.end ();
		return;
	}

	var file_server = new static.Server ( config.BASEDIR );
	var pos = fs.readFileSync ( util.format ( picture_position_file, client_id ) );
	pos = parseInt ( pos ) + 1;
	//console.log ( "newpos: " + pos );
	var lr = new LineByLineReader ( util.format ( picture_list_file, client_id ) );
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

		fout = fs.openSync ( util.format ( picture_position_file, client_id ), "w" );
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

function clean_temp_files () {
	var now = moment ();
	var files = fs.readdirSync ( os.tmpdir () );
	files.forEach ( function ( file ) {
		if ( file.search ( "........-....-4...-....-............_position.txt" ) != -1 ) {
			var fullpath = path.join ( os.tmpdir (), file );
			var stat = fs.statSync ( fullpath );

			// if the position file hasn't been modified for 1 hour then we can assume
			// the client has disconnected and we can safely delete the two files.
			if ( moment ( stat.mtime ).add ( 1, "h" ).isBefore ( now ) ) {
				console.log ( "Removing old temporary file: " + fullpath );
				fs.unlinkSync ( fullpath );
				var picture_list_file = fullpath.replace ( "position", "pictures" );
				console.log ( "Removing old temporary file: " + picture_list_file );
				fs.unlinkSync ( picture_list_file );
		}
	} } );
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

