
function make_base_auth(user, password) {
  var tok = user + ':' + password;
  var hash = btoa(tok);
  return "Basic " + hash;
}

$(function () {
    $('form').submit(function () {
        var status = $('.status');

        status.text('Contacting server..');

        var username = $("input#username").val();
        var password = $("input#password").val();

        $.ajax({
            type: 'post',
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', make_base_auth(username, password));
                xhr.withCredentials = true;
            },
            url: 'https://api.nhseportfolios.org/Users/' + username,
            crossDomain: true
        })
    .done(function (html) {
        var data = $('li a', $(html));

        status.text('<h2>Roles</h2>');

        var roles = data.each(function () {
            var t = $(this).text();
            status.append(t);
            status.append('<br/>');
        });
    })
    .fail(function (jqXHR, textStatus) {
        status.text("Request failed: " + textStatus + " (" + jqXHR.statusText + ")");
    });

        return false;
    });
});
