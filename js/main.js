
var API = {
	Url : 'https://api2.nhseportfolios.org',
	
	make_base_auth : function(user, password) {
	  var tok = user + ':' + password;
	  var hash = btoa(tok);
	  return "Basic " + hash;
	},
};

$(function () {
    $('form').submit(function () {
		var listRoles = function(html){
	        var data = $('li a', $(html));
	
	        var status = $('.status');
	        status.html('<h2>Roles</h2>');
	
	        var roles = data.each(function () {
	            var t = $(this).text();
	            status.append(t);
	            status.append('<br/>');
	        });
		};
		var fail = function(jqXHR, textStatus){
            var status = $('.status');

	        status.text("Request failed: " + textStatus + " (" + jqXHR.statusText + ")");
		};

		var homepage = function(html){
			var next = $("a[rel='next']", $(html)).attr('href');
	    	
	    	var url = API.Url + next;
	    	
	    	$('.status').load(url);
	    	return;
		    $.ajax({
		        url: url,
		        crossDomain: true,
				beforeSend: function (xhr){ 
					//xhr.setRequestHeader('Authorization', make_base_auth()); 
				},
    		    })
		    .done(function(data) { 
		    	listRoles(data); 
		    })
		    .fail(function (jqXHR, textStatus) {
		    	fail(jqXHR, textStatus);
		    });
		};
        var status = $('.status');
        status.text('Contacting server..');
		
	    $.ajax({
	        url: API.Url,
	        crossDomain: true
	    })
	    .done(function(data) { 
	    	homepage(data);
	    })
	    .fail(function (jqXHR, textStatus) {
	    	fail(jqXHR, textStatus);
	    });
				
	    
	    return false;
	});

});

