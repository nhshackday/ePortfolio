// Switch off jQuery Mobile routing
$(document).bind("mobileinit", function () {
    $.mobile.ajaxEnabled = false;
    $.mobile.linkBindingEnabled = false;
    $.mobile.hashListeningEnabled = false;
    $.mobile.pushStateEnabled = false;
    $.mobile.page.prototype.options.backBtn = true;

    // Remove page from DOM when it's being replaced
    $('div').on('pagehide', function (event, ui) {
        alert(event);
    });
});

