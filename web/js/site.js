/* cookie utilities */

function createCookie(name,value,days) {
	if (days) {
		var date = new Date();
		date.setTime(date.getTime()+(days*24*60*60*1000));
		var expires = "; expires="+date.toGMTString();
	}
	else var expires = "";
	document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
	var nameEQ = name + "=";
	var ca = document.cookie.split(';');
	for(var i=0;i < ca.length;i++) {
		var c = ca[i];
		while (c.charAt(0)==' ') c = c.substring(1,c.length);
		if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
	}
	return null;
}

function eraseCookie(name) {
	createCookie(name,"",-1);
}

/* start */

$(document).ready ( function () {
	var client_id = readCookie ( "session" );
	if ( client_id == null ) {
		$.ajax ( "/get_client_id" ).done ( function ( data ) {
			createCookie ( "session", data, "1" );
		} );
	}

	$('#dirchooser').jstree({
		"plugins": [ "checkbox"  ],
		"checkbox": {
			"three_state": false
		},
		'core' : {
			'data' : {
				'url' : "/getdirtree",
				'data' : function (node) {
					return { 'id' : node.id };
				}
			}
		}
	})
});

function start () {
	// clear POST data
	$( '#main input[type="hidden"]' ).remove ();
	// get selected items
	var sel_dirs = $("#dirchooser").jstree ( "get_selected", true );
	//alert ( "sel_dirs: " + JSON.stringify ( sel_dirs ) );
	// fill POST data
	var form = $("#main");
	$.each ( sel_dirs, function () {
		var el = $("<input>");
		el.attr ( "type", "hidden" );
		el.attr ( "name", "dir" );
		el.attr ( "value", this.id );

		form.append ( el );
	} );

	//form.submit ();
	return true;
}

