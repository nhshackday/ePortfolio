/*
 * NES ePortfolio 2013
 *
 * WHEN MAKING UPDATES YOU NEED TO UPDATE THE REVISION NUMBER IN /cache.manifest 
 */

var app;
var router;
var userNotifiedOfError = false;

var InfoView = Backbone.View.extend({
    template: _.template($('#info-template').html()),
    
    render: function () {
        var html = this.template(null);
        this.$el.html(html);        
        router.stopLoadingAnimation();
        return this;
    }
});
// Model to represent a single ticket request
var Ticket = Backbone.Model.extend({
        
    defaults: {
        Completed: false,
        CreatedDate: null,
        TicketAssessorEmail: null,
        LoginCode: null,
        Comment: null
    },
        
    remove: function() {
        app.log("Ticket.remove");
        // Try to destroy this model and DELETE it from the server
        this.destroy({
            success: this.removeSuccess,
            error: this.removeFail
        });
    },
        
    removeFail: function() {
        app.log("Ticket.removeFail");

        throw "Failed to delete ticket";
    },
        
    // Store the delete request locally
    removeSuccess: function(model) {
        if (!model) throw "Ticket.removeSuccess: model was null";

        var id = model.get('id');

        if (!id) throw "Ticket.removeSuccess: id was null";

        app.log("Ticket.removeSuccess: " + id);        

        var description = "Delete ticket sent to " + model.get('TicketAssessorEmail');

        var data = $('<form><input type="hidden" name="ticketId" value="' + id + '"/></form>').serialize();

        var url = app.fixUrl(app.getRole(), localStorage['ep_ticketsUrl']) + id;

        if (!url) throw "Ticket.removeSuccess: url was null";
        
        app.itemsToSync.create({ method: 'delete', description: description, url: url, data: data });

        router.navigate('', { trigger: true });
    }
});

// Collection of ticket requests
var TicketList = Backbone.Collection.extend({
    url: '', // will be set programatically

    roleId: null,
        
    initialize: function() {
        //app.log("TicketList.initialize");
    },
        
    configureStorage: function(roleId) {
        if (roleId == null) throw "TicketList.configureStorage: roleId was null";

        app.log("TicketList.configureStorage: roleId = " + roleId);

        this.localStorage = new Backbone.LocalStorage("ep_tickets_" + roleId);
    },

    localStorage: new Backbone.LocalStorage("ep_tickets_"),

    model: Ticket
});

// View to represent a single ticket
var TicketView = Backbone.View.extend({
    template: _.template($('#ticket-template').html()),

    events: {
        'click #btnDeleteTicket': 'remove',
        'click #btnSendReminder': 'sendReminder'
    },
    
    sendReminder: function(e) {
        app.log("TicketView.sendReminder");

        e.preventDefault();
        
        var description = "Send reminder for ticket sent to " + this.model.get('TicketAssessorEmail');

        var id = this.model.get('id');

        if (!id) throw "Ticket.sendReminder: id was null";

        var data = $('<form><input type="hidden" name="ticketId" value="' + id + '"/></form>').serialize();

        var url = localStorage['ep_ticketsRemindersUrl'];
        
        if (!url) throw "Ticket.sendReminder: ep_ticketsRemindersUrl was null";
        
        url = app.fixUrl(app.getRole(), url) + id;

        if (!url) throw "Ticket.sendReminder: url was null";

        app.itemsToSync.create({ method: 'post', description: description, url: url, data: data });

        router.navigate('', { trigger: true });
    },
        
    remove: function(e) {
        app.log("TicketView.remove");

        e.preventDefault();

        var confirmed = window.confirm("Delete this ticket?");

        if (!confirmed) {
            return;
        }

        this.model.remove();
    },

    render: function () {

        var html = this.template(this.model.toJSON());
        this.$el.html(html);
        this.$el.attr('data-role', 'collapsible');
        
        this.$el.attr('data-content-theme', 'd');

        var complete = this.model.get('Completed');

        var theme = complete ? 'c' : 'e';
        this.$el.attr('data-theme', theme);
        
        var icon = complete ? 'check' : 'alert';
        this.$el.attr('data-collapsed-icon', icon);
        this.$el.attr('data-expanded-icon', icon);
        
        router.stopLoadingAnimation();
        return this;
    }
});
    
// View of a collection of ticket requests
var TicketsView = Backbone.View.extend({
    template: _.template($('#tickets-template').html()),
        
    initialize: function () {
        app.log("TicketsView.initialize");

        _.bindAll(this, "renderItem");
    },

    // Render a list of ticket requests
    render: function () {
        app.log("TicketsView.render");

        var html = this.template(null);
        this.$el.html(html);

        var ticketsExist = this.collection.length !== 0;

        // If there are no tickets, display a friendly message
        app.toggleElements(ticketsExist, $('.normal', this.$el), $('.exception', this.$el));

        if (ticketsExist) {
            this.collection.each(this.renderItem);
        } else {
            router.stopLoadingAnimation();
        }

        return this;
    },

    renderItem: function (model) {
        if (!model) throw "TicketsView.renderItem: model was null";

        var v = new TicketView({ model: model });
        v.render();
        app.log("TicketsView.renderItem: model id = " + model.get('id'));
            
        // Append rows to the element
        $('.items', this.$el).append(v.el);
    },

    createTicket: function () {
        app.log("TicketsView.createTicket");

        router.navigate('addTicket', { trigger: true });
    }
});
    
// Model representing a Role e.g. Foundation Trainee
var Role = Backbone.Model.extend({
    defaults: {
        title: null
    }
});

// The global 'app' object is used for any global functionality. 
var AppView = Backbone.View.extend({
    // These are all the URLs used by the application, only the first one is hard coded into this app. The
    // others will be discovered at runtime. This is one of the RESTful constraints.
    ApiStartUrl: '/api/',
    rolesLoadedCount: 0,
    
    // Called every time a view is requested
    viewPreLoad: function(view, callback, fail) {
        if (!view) throw "app.viewPreLoad: view was null";
        if (!callback) throw "app.viewPreLoad: callback was null for view  = " + view;
        //if (!fail) throw "app.viewPreLoad: fail callback was null";
        
        app.log("app.viewPreLoad: " + view);

        userNotifiedOfError = false;

        app.removeCookies();
            
        $('.active').removeClass('active');
        $('.' + view).addClass('active');

        // is the user trying to logout?
        if (view === 'logout') {
            app.log("app.viewPreLoad: user wants to logout");
            app.log("app.viewPreLoad: executing callback");
            callback();
            return;
        }
            
        // accessing a page that required authentication but no credentials?
        if (view != "info" && view !== "login" && !localStorage['ep_username']) {
            app.log("app.viewPreLoad: credentials do not exist, redirecting to logout");
            app.clearLocalStorage();
            router.navigate("logout", { trigger: true });
            return;
        }

        // Credentials exist but roles have not been loaded?
        if (view != "info" && view != "login" && !app.roles && localStorage['ep_username']) {
            app.log("app.viewPreLoad: roles have not been loaded, calling app.login");
            app.login(function () {
                // now the application has been initialized, 
                return app.viewPreLoadCallback(view, callback);
            }, fail);
            return;
        }

        app.viewPreLoadCallback(view, callback);
    },

    loadRoles: function() {
        app.log("app.loadRoles: ");
        
        if (!app.roles) throw "app.loadRoles: app.roles was null";

        var total = app.roles.length;

        if (total === app.rolesLoadedCount) {
            app.log("app.loadRoles: app.roles.length = app.rolesLoadedCount");
            app.trigger('roleLoaded', null);
            return;
        }

        if (total === 0) {
            app.log("app.loadRoles: no roles");
            app.trigger('roleLoaded', null);
            return;
        }

        $.each(app.roles, function(i) {
            var role = app.roles.at(i);

            if (!role) throw "app.loadRoles: role was null";

            var roleId = role.get('id');

            if (roleId == null) throw "app.loadRoles: roleId was null";

            app.log("app.loadRoles: loading " + role.get('title') + " (id = " + roleId + ")");

            app.loadEntireRoleOnline(roleId);        
        });
    },
            
    initTickets: function(role) {
        if (!role) throw "app.initTickets: role was null";

        var roleId = role.get('id');

        app.log("app.initTickets: " + role.get('title') + " (id = " + roleId + ")");
        
        var tickets = new TicketList();
        
        tickets.configureStorage(roleId);

        var template = localStorage['ep_ticketsUrl'];
        if (!template) throw "app.initTickets: template was null";
        
        tickets.url = app.fixUrl(role, template);
        
        if (!app.tickets) {
            app.tickets = new Array();
        }
        
        app.tickets[roleId] = tickets;

        app.log("app.initTickets: app.tickets[roleId].length = " + app.tickets[roleId].length);
    },

    loadTicketsOffline: function(role) {
        app.log("app.loadTicketsOffline");

        var tickets = app.tickets[role.get('id')];
        
        if (!tickets) throw "app.loadTicketsOffline: tickets was null";
        
        tickets.fetch();

        router.stopLoadingAnimation();
    },
        
    // Download JSON tickets from the server
    loadTicketsOnline: function(role, callback) {
        if (!role) throw "app.loadTicketsOnline: roleId was null";
        //if (!callback) throw "app.loadTicketsOnline: callback was null";

        app.log("app.loadTicketsOnline: " + role.get('title'));

        var tickets = app.tickets[role.get('id')];

        //if (!tickets) {
            app.initTickets(role);            
        //}
        
        var ticketsUrl = tickets.url;
        if (!ticketsUrl) throw "app.loadTicketsOnline: ticketsUrl was null";
        
        app.log("app.loadTicketsOnline: loading JSON tickets from " + ticketsUrl + " for " + role.get('title'));
        app.get(ticketsUrl, function(data) {
                
                if (data.length === 0) {
                    if (callback != null) {
                        app.log("app.loadTicketsOnline: no tickets, executing callback");
                        callback();
                    }
                    return;
                }

                $.each(data, function(i) {
                    var ticket = data[i];

                    if (!ticket) throw "app.loadTicketsOnline: ticket was null";
                    
                    app.tickets[role.get('id')].create({
                        id: ticket.id,
                        Completed: ticket.Completed,
                        CreatedDate: ticket.CreatedDate,
                        TicketAssessorEmail: ticket.TicketAssessorEmail,
                        LoginCode: ticket.LoginCode,
                        Comment: ticket.Comment,
                        Title: ticket.Title,
                        IsSendReminder: ticket.IsSendReminder,
                        LastEmailSentDate: null//eval(ticket.LastEmailSentDate.slice(1, -1))
                    });
                    
                    var finalItem = (i === (data.length - 1));
                    
                    if (finalItem) {
                        app.log("app.loadTicketsOnline: found " + data.length + " tickets for " + role.get('title') + " role.");

                        if (callback != null) {
                            app.log("app.loadTicketsOnline: executing callback");
                            callback();
                        }
                    }
                });

        });
    },

    updateBadge: function() {
        return;

        if (!app.itemsToSync) {
            return;
        }
        
        app.log("app.updateBadge: app.itemsToSync.length = " + app.itemsToSync.length);

        var badge = $('.badge .ui-btn-text span');
        var button = $('#btnSync');
        if (app.itemsToSync.length > 0) {
            badge.html('&nbsp;+' + app.itemsToSync.length + '&nbsp;');
            badge.removeClass('hidden');
            button.removeClass('hidden');
            $('.ui-li-count', button).html(app.itemsToSync.length);
        } else {
            badge.text('');
            badge.addClass('hidden');
            button.addClass('hidden');
            $('.ui-li-count', button).html('');
        }
    },

    login: function (callback, fail) {
        app.log("app.login");

        if (!localStorage['ep_rolesUrl']) {
            app.log("app.login: Make first request to API");
            app.getHtml(
                app.ApiStartUrl, 
                app.loadApi(function() { app.apiLoaded(callback); }), fail);
        } else {
            app.apiLoaded(callback);
        }
    },

    loadApi: function (callback) {
        return function (html) {
            if (!html || html.length === 0) {
                throw "AppView.loadApi: Failed to get HTML from API";
            }

            app.log("app.loadApi");

            var doc = $(html);

            var url = $('a.roles', doc).attr('href');

            if (!url) throw "AppView.loadApi: RolesUrl was null";

            localStorage['ep_rolesUrl'] = url.replace('{username}', localStorage["ep_username"]);

            localStorage['ep_ticketsUrl'] = $('a.tickets', doc).attr('href');

            localStorage['ep_ticketsRemindersUrl'] = $('form.tickets.reminders', doc).attr('action');

            localStorage['ep_ticketPostsUrl'] = $('a.posts', doc).attr('href');

            localStorage['ep_ticketFormsUrl'] = $('a.forms', doc).attr('href');

            localStorage['ep_ticketPrefillUrl'] = $('a.prefill', doc).attr('href');

            $('nav a.username').text(localStorage["ep_username"]);

            callback();
        };
    },

    apiLoaded: function(callback, fail) {
        app.log("app.apiLoaded");

        if (!app.roles) app.roles = new RolesList();

        app.roles.fetch({
            success: function() {
                if (app.roles.length > 0) {
                    app.rolesLoaded(callback);
                    return;
                }

                // The local collection of roles is empty so load them from the server
                app.fetchRolesOnline(callback);
            },
            error: function() {
                fail();
            }
        });
    },

    fetchRolesOnline: function(callback) {
        app.log("app.fetchRolesOnline: app.roles.length = " + app.roles.length);

        var url = localStorage['ep_rolesUrl'];
        if (!url) throw "app.fetchRolesOnline: url was null";
        
        app.log("app.fetchRolesOnline: loading roles from " + url);
        app.get(url, function(roles) {
            $.each(roles, function(i) {
                var role = roles[i];

                if (!role) throw "app.fetchRolesOnline: role was null";
                
                app.roles.create({ title: role.title, id: role.id });
            });
            app.rolesLoaded(callback);                    
        });
    },
    
    log: function(message) {
        if (console === undefined || console.log === undefined) {
            return;
        }

        console.log("/" + window.location.hash + " " + message);
    },

    // Called once roles have been loaded
    rolesLoaded: function (callback) {
        app.log("app.rolesLoaded");

        if (app.isRoleSelected()) {
            app.loadEntireRoleOnline(app.selectedRoleId(), callback);
        } else {
            app.log("app.rolesLoaded: executing callback");
            callback();
        }
    },

    // Load everything associated with this role
    loadEntireRoleOnline: function(roleId, callback) {
        if (roleId == null) throw "app.loadEntireRoleOnline: roleId was invalid.";

        var role = app.roles.get(roleId);
        if (!role) throw "loadEntireRoleOnline: role was null.";

        app.log("app.loadEntireRoleOnline: " + role.get('title') + " (id = " + role.get('id') + ")");

        if (!localStorage['ep_ticketPostsUrl']) throw "loadEntireRoleOnline: ticketPostsUrl was null.";

        if (!app.tickets || !app.tickets[roleId]) {
            app.initTickets(role);
        }

        var posts = app.getLocalArray('ep_ticketPosts_' + roleId);
        if (posts != null) {
            app.tickets[roleId].fetch();
            // everything has been loaded for this role, let's not load it again
            if (callback != null) {
                callback();
            } else {
                app.trigger('roleLoaded', roleId);
            }
            return;
        }

        // load the posts for the ticket screen <select> dropdown
        app.log("app.loadEntireRoleOnline: loading posts for " + role.get('title'));
        
        var ticketPostsUrl = app.fixUrl(role, localStorage['ep_ticketPostsUrl']);
                
        app.get(ticketPostsUrl, function(data) {
            app.log("app.loadEntireRoleOnline: loaded " + data.length + " posts for " + role.get('title'));
            
            // save the posts
            posts = app.setLocalArray('ep_ticketPosts_' + roleId, data);

            if (posts.length === 0) {
                app.log("app.loadEntireRoleOnline: no posts for " + role.get('title'));
                app.trigger('roleLoaded', roleId);
                return;
            }

            // for each post..
            $.each(posts, function(i) {
                var post = posts[i];
                if (!post) throw "app.loadEntireRoleOnline: post was null";

                // load the forms that are associated with this post
                app.loadTicketForms(role, post.Value, function() {

                    var finalItem = (i === (posts.length - 1));
                    if (finalItem) {
                        // we have loaded all the posts, now lets get the tickets
                        app.loadTicketsOnline(role, function() {
                            app.trigger('roleLoaded', roleId);
                        });
                    }
                });
            });
            
        });
    },
    
    viewPreLoadCallback: function (view, callback) {
        if (!view) throw "app.viewPreLoadCallback: view was null";
        if (!callback) throw "app.viewPreLoadCallback: callback was null";
        
        app.log("app.viewPreLoadCallback: " + view);

        if (view != "info" && view != "home" && view != "login" && view != "logout" && app.isRoleSelected() === false) {
            app.log("app.viewPreLoadCallback: no role is selected, redirecting to #home");
            router.navigate('home', { trigger: true });
            return;
        }

        if (!app.itemsToSync) {
            app.itemsToSync = new SyncCollection();
        }

        app.itemsToSync.fetch();
        
        app.log("app.viewPreLoadCallback: executing callback");
        callback();
    },

    loadTicketForms: function(role, postId, callback, fail) {
        if (!role) throw "app.loadTicketForms: role was null";
        if (!postId) throw "app.loadTicketForms: postId was null";
        
        app.log("app.loadTicketForms: role = " + role.get('title') + " postId = " + postId);

        var context = this;

        if (!localStorage['ep_ticketFormsUrl']) throw "loadTicketForms: url was null";

        var url = app.fixUrl(role, localStorage['ep_ticketFormsUrl']) + postId;

        app.get(url, function(data) {
            var key = 'ep_ticketForms_' + role.get('id') + '_' + postId;

            // save the list of forms
            app.log("app.loadTicketForms: saving " + data.length + " forms as " + key + " for post " + postId);
            var forms = app.setLocalArray(key, data);

            // Load the prefill questions for each form
            $.each(forms, function(i) {
                var form = forms[i];
                var formCtrlId = form["Value"].split('#')[2];

                var prefillUrl = app.fixUrl(role, localStorage['ep_ticketPrefillUrl']).replace('{formCtrlId}', formCtrlId);

                var finalItem = (i === (forms.length - 1));
                
                if (finalItem) {
                    app.getHtml(prefillUrl, context.loadPrefillQuestions(role, formCtrlId, callback), function () {
                        throw "Failed to load prefill questions";
                    });
                } else {
                    app.getHtml(prefillUrl, context.loadPrefillQuestions(role, formCtrlId, null), function () {
                        throw "Failed to load prefill questions";
                    });
                }
            });

            if (forms.length === 0) {
                if (callback != null) {
                    app.log("app.loadTicketForms: no forms, executing callback");
                    callback();
                }
            }

        }, function() {
            if (fail != null) {
                fail();
            }
        });
    },

    loadPrefillQuestions: function(role, formCtrlId, callback) {
        if (!formCtrlId) throw "app.loadPrefillQuestions: formCtrlId was null";
        
        return function(html) {
            app.log("app.loadPrefillQuestions: formCtrlId = " + formCtrlId + " html.length=" + html.length);

            localStorage['ep_ticket_prefill_' + formCtrlId] = html;

            if (callback != null) {
                app.log("app.loadPrefillQuestions: executing callback for " + role.get('title'));
                callback();
            }
        };
    },

    selectedRoleId: function() {
        app.log("app.selectedRoleId");

        return localStorage["ep_selectedRoleId"];
    },

    isRoleSelected: function() {
        app.log("app.isRoleSelected");

        var id = localStorage["ep_selectedRoleId"];

        var selected = id != null;
        
        app.log("app.isRoleSelected: " + selected);

        return selected;
    },

    getRole: function() {
        app.log("app.getRole");

        var roleId = localStorage['ep_selectedRoleId'];

        if (roleId == null) throw "app.getRole: no role selected";

        if (!app.roles) throw "app.getRole: app.roles was null";

        var role = app.roles.get(roleId);

        if (!role) throw "app.getRole: role was null";

        return role;
    },
        
    fixUrl: function(role, template) {
        if (!role) throw "app.fixUrl: role was null";
        if (!template) throw "app.fixUrl: url was null";

        //app.log("app.fixUrl: " + template);

        var url = template.replace('{username}', localStorage['ep_username']);
            
        var title = role.get('title').toLowerCase().replace(' ', '_');
            
        url = url.replace('{role_name}', title);
            
        return url;
    },

    // Clears everything from localStorage that starts with 'ep_*'
    clearLocalStorage: function() {
        app.log("app.clearLocalStorage");

        Object.keys(localStorage)
            .forEach(function(key) {
                if (/^(ep_)/.test(key)) {
                    localStorage.removeItem(key);
                }
            });
    },

    // Clears everything from localStorage except username, password 
    resetApp: function() {
        app.log("app.reset");

        Object.keys(localStorage)
            .forEach(function(key) {
                if (/^(ep_)/.test(key) && key !== 'ep_username' && key !== 'ep_password') {
                    localStorage.removeItem(key);
                }
            });
    },

    // Toggles element visibility based on a given condition.
    toggleElements: function(condition, elm1, elm2) {
        if (condition) {
            elm1.removeClass('hidden');
            elm2.addClass('hidden');
        } else {
            elm1.addClass('hidden');
            elm2.removeClass('hidden');
        }
    },
        
    isOnline: function (callback, callbackOffline) {
        app.log("app.isOnline");

        if (navigator.onLine === false) {
            app.log("app.isOnline: online = false");
            callbackOffline();
        }

        try {
            $.ajax({ url: app.ApiStartUrl + '?' + Math.random(), dataType: 'html' }
            ).done(function () {
                app.log("app.isOnline: online = true");
                callback();
            }).fail(function () {
                app.log("app.isOnline: online = false");
                callbackOffline();
            });
        } catch (e) {
            app.log("app.isOnline: " + e);
            callbackOffline();
        }
    },

    ajaxFail: function (jqXHR, textStatus) {
        app.log("app.ajaxFail: jqXHR.status = " + jqXHR.status);

        if (jqXHR.status === 401) {
            return; // handled elsewhere
        }

        router.stopLoadingAnimation();
            
        app.isOnline(function() {
            throw "Sorry, request failed (" + textStatus + "/" + jqXHR.statusText + ")";
        }, function() {
            throw "Error: You appear to be offline.";
        });
    },

    removeCookies: function () {
        if (document.cookie) this.log("AppView.removeCookies: document.cookie = " + document.cookie);
            
        var cookies = document.cookie.split(";");
        for (var i = 0; i < cookies.length; i++) {
            var equals = cookies[i].indexOf("=");
            var name = equals > -1 ? cookies[i].substr(0, equals) : cookies[i];
            
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
    },
        
    ajaxBeforeSend: function (xhr) {
        app.removeCookies();

        router.startLoadingAnimation();

        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            
        if (!localStorage["ep_username"] || !localStorage["ep_password"]) {
            return;
        }
            
        var token = localStorage["ep_username"] + ':' + localStorage["ep_password"];
        var hash = $.base64.encode(token);
        var header = "Basic " + hash;

        xhr.setRequestHeader('ePortfolioAuthorization', header);
    },
        
    ajaxComplete: function() {
        app.removeCookies();
    },

    get: function (url, success, fail) {
        if (!url) {
            throw "app.get: url was null";
        }
        app.log("app.get: " + url);
        return this.ajax('get', null, url, success, fail);
    },

    post: function (data, url, success, fail) {
        if (!url) {
            throw "app.post: url was null";
        }
        app.log("app.post: " + url);
        return this.ajax('post', data, url, success, fail);
    },
        
    ajax: function(type, data, url, success, fail) {
        if (!url) {
            throw "app.ajax: url was null";
        }

        app.log("app.ajax: " + url);

        $.ajax({
            url: url,
            type: type,
            data: data,
            crossDomain: true,
        })
            .done(function (html) {
                if (success !== undefined) {
                    success(html);
                }
            })
            .fail(function (jqXHR, textStatus) {
                if (fail !== undefined) {
                    fail(textStatus);
                } else {
                    app.ajaxFail(jqXHR, textStatus);
                }
            });
    },

    getHref: function(url, jQuery, callback) {
        if (!url) throw 'getHref: url was null';
        if (!jQuery) throw 'getHref: jQuery was null';
        if (!callback) throw 'getHref: callback was null';

        app.log("app.getHref: " + url);

        app.getHtml(url, function(html) {
            var anchor = $(jQuery, $(html));

            if (anchor.length === 0) {
                throw 'getHref: Failed to find element: ' + jQuery + ' at url ' + url;
            }

            var href = anchor.attr('href');
                
            callback(href);
        });
    },

    getHtml: function (url, callback, fail) {
        if (!url) throw 'app.getHref: url was null';
        if (!callback) throw 'app.getHref: callback was null';

        app.log("app.getHtml: " + url);

        $.ajax({
            dataType: 'html',
            url: url,
            crossDomain: true
        })
        .done(function (html) {
            callback(html);
        })
        .fail(function (jqXHR, textStatus) {
            console.log("Failed to load " + url);
            if (fail !== undefined) {
                fail();
            } else {
                app.ajaxFail(jqXHR, textStatus);
            }
        });
    },

    getLocalArray: function (key) {
        if (!key) throw 'getLocalArray: key was null';

        var json = localStorage.getItem(key);
        if (!json) {
            return null;
        }
            
        var ar = JSON.parse(json);
        if (!ar) {
            ar = [];
        }
        return ar;
    },

    setLocalArray: function (key, value) {
        if (!key) throw 'setLocalArray: key was null';
        if (!value) throw "setLocalArray: value was null";

        app.log("app.setLocalArray: " + key + " (" + value.length + " items)");

        var json = JSON.stringify(value);
        localStorage.setItem(key, json);
        return app.getLocalArray(key);
    },
        
    loginFailed: function () {
        app.log("app.loginFailed");

        app.clearLocalStorage();
        
        router.stopLoadingAnimation();

        if (location.hash !== "") {
            // failed login from old credentials?
            app.clearLocalStorage();
            window.location = '/';
        }
        alert("Login failed.");
        
        return false;
    },

    ShowBookmarkBubble: function() {
        app.log("app.showBookmarkBubble");

        google.bookmarkbubble.Bubble.prototype.NUMBER_OF_TIMES_TO_DISMISS=3;

        var bubble = new google.bookmarkbubble.Bubble();

        bubble.hasHashParameter = function() {
        };
        bubble.setHashParameter = function() {
        };
            
        if (location.hash !== "") {
            return;
        }

        bubble.showIfAllowed();
    },
        
    initialize: function () {
            
        _.extend(this, Backbone.Events);

        window.onerror = function (msg, url, line) {
            // handle client-side javascript errors
            var errorMsg = msg + ' URL=' + url + ' LINE=' + line;
            
            console.error(errorMsg);

            try {
                var username = 'anonymous';
                if (localStorage['up_username']) {
                    username = localStorage['up_username'];
                }

                // TODO: Store these offline
                var data = {
                    error: errorMsg,
                    username: username
                };
                
                $.post("/Errors/", data);
            } catch(ex) {
                console.error(ex);
            }

            router.stopLoadingAnimation();

            var logout = false;
            
            if (userNotifiedOfError === false) {
                logout = confirm('Sorry there was a problem completing that request. Do you want to logout and retry (you will lose unsaved work)?');
                userNotifiedOfError = true;
            }
            
            if (logout) {
                app.clearLocalStorage();
                window.location = './';
            }
        };

        window.addEventListener('load', function() {
            if (window.applicationCache) {
            window.applicationCache.addEventListener('updateready', function() {
                if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
                    // Browser downloaded a new app cache.
                    // Swap it in and reload the page to get the new hotness.
                    window.applicationCache.swapCache();
                    //if (confirm('A new version of this site is available. Load it?')) {
                        router.startLoadingAnimation();
                        window.location = './';
                    //}
                } else {
                    // Manifest didn't changed. Nothing new to server.
                }
            }, false);
            }
        }, false);

        this.on("offline", function() {
            alert("This operation cannot be performed offline");
        });

        this.on("failedLogin", function() {
            router.navigate('logout', { trigger: true });
        });

        this.on("roleLoaded", function(roleId) {
            app.log("app.onroleLoaded: roleId = " + roleId);

            if (roleId != null) {
                app.rolesLoadedCount++;
            }

            app.log("app.onroleLoaded: app.rolesLoadedCount = " + app.rolesLoadedCount + ", app.roles.length = " + app.roles.length);
            
            if (app.rolesLoadedCount == app.roles.length)
                router.homePostInit();
        });

        $.support.cors = true;
            
        $.fn.enable = function() {
            return $(this).removeAttr('disabled');
        },

        $.fn.disable = function() {
            return $(this).attr('disabled', 'disabled');
        },

        $.ajaxSetup({
            dataType: 'json',
            beforeSend: this.ajaxBeforeSend,
            complete: this.ajaxComplete,
            statusCode: {
                401: this.loginFailed
            }
        });


        this.removeCookies();

        $('a').click(function() {
            if ($(this).hasClass('disabled')) {
                return false;
            }

            return true;
        });
                        
        window.setTimeout(this.ShowBookmarkBubble, 1000);
    }
});
    
// Represents a collection of Roles
var RolesList = Backbone.Collection.extend({
    url: '', // will be set programatically

    localStorage: new Backbone.LocalStorage("ep_roles"),

    model: Role
});

var RoleModel = Backbone.Model.extend({
    
});
// View for a single Role
var RoleView = Backbone.View.extend({

    tagName: 'div',
    
    //model: RoleModel,

    template: _.template($('#role-template').html()),
        
    initialize: function() {
        _.bindAll(this, "select");
    },

    events: {
        'click button' : 'select'
    },

    select: function(e) {
        e.preventDefault();
        
        var roleId = this.model.get('role').get('id');

        if (roleId === undefined || roleId === null || typeof roleId !== 'number') {
            throw "RoleView.select: roleId was invalid";
        }

        localStorage["ep_selectedRoleId"] = roleId;

        router.navigate("tickets", { trigger: true });
    },
        
    selectPortfolioFailed: function(message) {
        app.log("RoleView.setPortfolioFailed: " + message);

        throw message;
    },

    render: function () {
        var html = this.template(this.model.toJSON());
        $(this.el).html(html);
        
        router.stopLoadingAnimation();
        return this;
    }
});
        
var SyncModel = Backbone.Model.extend({
    defaults: function() {
        var now = new Date();
        var date = now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear() + ' ' + now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
        return {
            date: date,
            description: null,
            url: null,
            data: null,
            status: "Ready to sync"
        };
    },
});
    
// A collection of items to sync with the server
var SyncCollection = Backbone.Collection.extend({
    model: SyncModel,
        
    initialize: function() {
        app.log("SyncCollection.initialize");

        this.bind("destroy", app.updateBadge, this);
        this.bind("reset", app.updateBadge, this);
        this.bind("change", app.updateBadge, this);
    },
                
    localStorage: new Backbone.LocalStorage("ep_syncItems")
});
    
var LoginView = Backbone.View.extend({
    template: _.template($('#login-template').html()),

    events: {
        'submit form': 'login'
    },

    initialize: function () {
        app.log("LoginView.initialize");
    },

    login: function (e) {
        app.log("LoginView.login");

        e.preventDefault();

        var username = $('input[name="username"]').val();

        if (!username) {
            alert('Please enter a username.');
            return;
        }

        var password = $('input[name="password"]').val();

        if (!password) {
            alert('Please enter a password.');
            return;
        }

        var radioOptions = $('input[name="device"]:checked');
        if (radioOptions.length === 0) {
            alert('Please indicate whether this is a public computer.');
            return;
        }

        var device = radioOptions.val();

        if (device === "public") {
            localStorage.clear();
            alert( "Currently this site cannot be used on public computers or devices.");
            return;
        }

        localStorage["ep_username"] = username;
        localStorage["ep_password"] = password;

        app.isOnline(function() {
            app.login(function() {
                router.navigate('home', { trigger: true });
            }, function() {
                router.stopLoadingAnimation();
                throw "Failed to load your eportfolio";
            });
        }, function() {
            alert('Unable to login, you appear to be offline.');
            router.stopLoadingAnimation();
        });
        
    },

    render: function () {
        app.log("LoginView.render");

        //if (!localStorage['ep_username']) 
            app.clearLocalStorage();

        var html = this.template(null);
        this.$el.html(html);
        router.stopLoadingAnimation();
            
        return this;
    }
});

var UserModel = Backbone.Model.extend({
        
});
    
var HomeView = Backbone.View.extend({
    template: _.template($('#user-template').html()),
    itemTemplate: _.template($('#syncItem-template').html()),

    model: UserModel,

    events: {
        'click #btnSync': 'startSync'
    },
    
    initialize: function () {
        _.bindAll(this, "render");
        _.bindAll(this, "startSync");
        _.bindAll(this, "syncCallback");
        _.bindAll(this, "renderSyncItem");
        _.bindAll(this, "renderRoleItem");
        app.itemsToSync.bind("reset", app.updateBadge, this);
        app.itemsToSync.bind("change", app.updateBadge, this);
        app.itemsToSync.bind("destroy", app.updateBadge, this);
    },
        
    render: function() {
        app.log("HomeView.render");

        var html = this.template(this.model.toJSON());
        this.$el.html(html);

        var context = this;
        app.itemsToSync.each(context.renderSyncItem);

        var rolesExist = app.roles.length !== 0;
            
        app.toggleElements(rolesExist, $('.normal', this.$el), $('.exception', this.$el));

        $.each(app.roles.models, function(i) {
            var role = app.roles.at(i);
            
            context.renderRoleItem(role);

            var finalItem = (i === (app.roles.length - 1));

            if (finalItem) {
                router.stopLoadingAnimation();
            }
        });
            
        return this;
    },
    
    renderSyncItem: function(model) {
        app.log("HomeView.renderItem");

        var html = this.itemTemplate(model.toJSON());
        $('.syncItems', this.$el).append(html);
    },

    renderRoleItem: function (role) {
        app.log("SelectRoleView.renderItem " + role.get('title') + " (id = " + role.get('id') + ")");

        var tickets = app.tickets[role.get('id')];

        var model = new RoleModel();
        model.set('role', role);
        model.set('tickets', tickets);

        var roleView = new RoleView({ model: model });
        roleView.render();
        $('.roleItems', this.el).append(roleView.el);
    },
    startSync: function (e) {
        app.log("HomeView.startSync");

        e.preventDefault();

        var context = this;
        app.isOnline(function() {
            router.startLoadingAnimation();
            context.countSuccess = 0;
            context.count = 0;
            var total = app.itemsToSync.length;
            context.synced = new Array();
            $.each(app.itemsToSync.models, function (i) {
                var item = app.itemsToSync.at(i);

                app.ajax(item.get('method'), item.get('data'), item.get('url'), context.syncCallback(item, total), context.syncFail(item, total));
            });
                
            return context;
        }, function() {
            alert("Unable to contact server, please try later.");
            router.stopLoadingAnimation();
            return context;
        });
    },
        
    syncFail: function(model, total) {
        app.log("HomeView.syncFail");

        var context = this;
        return function() {
            context.count++;
            model.set('status', 'Failed to sync');
            model.save();
            if (context.count === total) {
                context.syncComplete(total);
            }
        };
    },
        
    syncCallback: function(item, total) {
        app.log("HomeView.syncCallback");

        var context = this;
        return function() {
            context.count++;
            context.countSuccess++;
            context.synced.push(item.get('id'));

            if (context.count === total) {
                context.syncComplete(total);
            }
        };
    },
        
    syncComplete: function(total) {
        app.log("HomeView.syncComplete");

        // Remove the items that have been sent to the server
        var context = this;
        $.each(context.synced, function(i) {
            var id = context.synced[i];
            var model = app.itemsToSync.get(id);
            if (!model) {
                throw "syncComplete: model was null";
            }
            model.destroy();
        });

        if (context.synced.length === 0) {
            alert("Error: None of the items could be synchronised. Please try again later.");

            router.stopLoadingAnimation();
        } else {
            var failed = total - context.synced.length;

            if (failed === 0) {
                alert("All items have been sent successfully.");
            } else {
                alert(context.synced.length + " items have been sent successfully but " + failed + " items failed. Please try again later.");
            }

            router.navigate('', { trigger: true });
        }
    }
});
    
var AddTicketView = Backbone.View.extend({
    template: _.template($('#addTicket-template').html()),

    events: {
        'submit form.tickets': 'addTicket'
    },

    initialize: function () {
        app.log("AddTicketView.initialize");

        _.bindAll(this, "render");
    },

    render: function () {
        app.log("AddTicketView.render");

        var html = this.template(null);
        this.$el.html(html);

        var form = $('form.tickets', this.$el);

        if (form.length === 0) {
            throw "AddTicketView.render: Failed to find form";
        }

        var context = this;
        $('select[name="postId"]', form).change(function () {
            context.loadForms();
        });


        $('form.tickets .forms').addClass('hidden');
        var select = $('form.tickets select[name="postId"]', this.$el);

        if (select.length === 0) {
            throw "AddTicketView.render: Failed to find posts <select> element";
        }

        var any = false;
        var data = app.getLocalArray('ep_ticketPosts_' + app.selectedRoleId());
        if (!data) {
            throw "AddTicketView.render: Posts have not been loaded";
        }
        $.each(data, function (i) {
            any = true;
            var post = data[i];

            var val = post["Value"];
            var text = post["Text"];
            var option = '<option value="' + val + '">' + text + "</option>";
            select.append(option);
        });
            
        if (any === false) {
            alert("You don't have any post that you can use to create tickets");
            return this;
        }
        if (any === true) {
            select.enable();
            
            if (data.length === 1) {
                select.closest('div[data-role="fieldcontain"]').addClass('hidden');
            }
            $('input[type="submit"]').enable();

            //this.loadForms();
        }

        return this;
    },

    addTicket: function (e) {
        app.log("AddTicketView.addTicket");

        e.preventDefault();
        var form = $('form', this.$el);

        var input = $('input[name="assessorName"]', form);
        
        if (input.val() === '') {
            input.focus();
            alert('Please enter the name of the assessor.');
            return;
        }

        input = $('input[name="assessorEmail"]', form);
        if (input.val() === '') {
            input.focus();
            alert('Please enter the email address.');
            return;
        }

        input = $('input[name="assessorDesignation"]', form);
        if (input.val() === '') {
            input.focus();
            alert('Please enter the designation of the assessor.');
            return;
        }

        input = $('input[name="assessorLocation"]', form);
        if (input.val() === '') {
            input.focus();
            alert('Please enter the location of the assessor.');
            return;
        }

        input = $('input[name="assessorComment"]', form);
        if (input.val() === '') {
            input.focus();
            alert('Please enter some comments.');
            return;
        }

        input = $('input[type="checkbox"]:checked', form);
        if (input.length === 0) {
            alert('Please select at least one form.');
            return;
        }

        var email = $('input[name="assessorEmail"]', form).val();
        var description = 'New ticket request for ';

        var delim = '';
        $.each(input, function(i) {
            var checkbox = $(input[i]);
            var nameAttr = checkbox.attr('name');
            var title = $('label[for="' + nameAttr + '"]').text().trim();
            description += delim + '"' + title + '"';
            delim = ', ';
        });
        
        description += ' to ' + email;
            
        app.itemsToSync.create({
             method: form.attr('method'), 
             description: description, 
             url: app.fixUrl(app.getRole(), localStorage['ep_ticketsUrl']), 
             data: form.serialize()
        });
                        
        router.navigate('home', { trigger: true });
    },
        
    loadForms: function () {
        app.log("AddTicketView.loadForms");

        var elm = $('form.tickets .forms');
        elm.html('');
        $('form.tickets .forms').removeClass('hidden');

        $('form.tickets input').removeAttr('disabled');
        $('form.tickets button').removeAttr('disabled');

        var postId = $('form.tickets select[name="postId"]').val();

        if (!postId) {
            $('form.tickets .forms').addClass('hidden');
            $('form.tickets input').attr('disabled', 'disabled');
            $('form.tickets button').attr('disabled', 'disabled');
            router.stopLoadingAnimation();
            return;
            //throw "loadForms: postId was null";
        }

        var ticketFormsKey = 'ep_ticketForms_' + app.selectedRoleId() + '_' + postId;
        var data = app.getLocalArray(ticketFormsKey);

        if (!data) {
            $('form.tickets .forms').addClass('hidden');
            $('form.tickets input').attr('disabled', 'disabled');
            $('form.tickets button').attr('disabled', 'disabled');
            router.stopLoadingAnimation();
            return;
            //throw "loadForms: Failed to load Forms for post ";
        }

        $.each(data, function (i) {
            var form = data[i];
            var nameAttr = 'form_' + form["Value"];
            var option = '<label for="' + nameAttr + '"><input type="checkbox" name="' + nameAttr + '" id="' + nameAttr + '"/>' + form["Text"] + '</label>';
            elm.append(option);

            var prefill = '<div id="' + nameAttr + '_prefill" class="prefill accent indent"></div>';
            elm.append(prefill);

            //var formCtrlId = nameAttr.replace('form_', '').split('#')[2];
        });

        elm.trigger("create");
        elm.removeClass('hidden');

        // when someone clicks one of these checkboxes
        $('input[type="checkbox"]', elm).click(function() {
            $('div.prefill').html('');
                
            // find all of the ones that are checked
            var forms = $('form.tickets .forms input[type="checkbox"]:checked');
                
            // for each checked checkbox
            $.each(forms, function (i) {
                // find the formCtrlId
                var nameAttr = $(forms[i]).attr('name');
                var formCtrlId = nameAttr.replace('form_', '').split('#')[2];

                // load up the prefill questions HTML
                var html = localStorage['ep_ticket_prefill_' + formCtrlId];

                // and append that HTML to the prefill questions box
                var selector = '#' + nameAttr.replace(/#/g, '\\#') + '_prefill';
                var container = $(selector);

                if (container.length === 0) {
                    throw "failed to find prefill container using selector" + selector;
                }

                var html2 = html.replace(/\<td\>/g, '').replace(/\<\/td\>/g, '').replace(/\<tr\>/g, '').replace(/\<\/tr\>/g, '');
                container.html(html2);
                container.trigger("create");
            });
        });

        router.stopLoadingAnimation();
    }
});
        
var Router = Backbone.Router.extend({
    initialize: function() {
        //app.log("Router.initialize");

        // Handle back button throughout the application
        $('.back').on('click', function() {
            app.backButton = true;
            window.history.back();
            return false;
        });
        this.firstPage = true;
    },

    routes: {
        '': 'loginInit',
        'info' : 'infoInit',
        'home': 'homeInit',
        'tickets': 'ticketsInit',
        'addTicket': 'addTicketInit',
        'logout': 'logoutInit',
        '*path': 'loginInit'
    },
        
    // Login page requested
    loginInit: function() {
        app = new AppView();
        
        app.log("Router.login");

        router.loginPostInit();
        //app.viewPreLoad('login', router.loginPostInit);
    },
    
    loginPostInit: function() {
        app.log("Router.loginPostInit");
        if (localStorage['ep_username']) {
            app.log("Router.loginPostInit: username exists, redirect to #home");
            router.navigate('home', { trigger: true });
            return this;
        }

        //if (!app.loginView) {
            app.loginView = new LoginView({ model: null });
        //}

        router.changePage('login', app.loginView);

        return this;
    },
    
    infoInit: function() {
        app.log("Router.infoInit");

        app.viewPreLoad('info', router.infoPostInit);
    },
        
    infoPostInit: function() {
        app.log("Router.infoPostInit");

        var view = new InfoView({ model: null });

        router.changePage('info', view);
    },
        
    homeInit: function() {
        app.log("Router.homeInit");

        var username = localStorage['ep_username'];
        
        if (!username) {
            router.navigate('logout', { trigger: true });
            return;
        }

        app.viewPreLoad('home', function() {
            app.log("Router.homeInit: calling app.loadRoles");
            app.loadRoles();
        });
    },
        
    homePostInit: function() {
        app.log("Router.homePostInit");
            
        var model = new UserModel();
        model.set('username', localStorage["ep_username"]);
        model.set('roleItems', app.roles);
        model.set('syncItems', app.itemsToSync);       
        
        var view = new HomeView({ model: model });

        router.changePage('home', view);
        
        router.stopLoadingAnimation();
    },
                
    ticketsInit: function() {
        app.log("Router.tickets");

        app.viewPreLoad('tickets', router.ticketsPostInit);
    },
        
    ticketsPostInit: function() {
        app.log("Router.ticketsPostInit");

        var role = app.getRole();

        var roleId = role.get('id');

        if (!app.ticketsViews) app.ticketsViews = new Array();
        
        //if (!app.ticketsViews[roleId]) {
            app.ticketsViews[roleId] = new TicketsView({ collection: app.tickets[roleId] });
        //}

        app.loadTicketsOffline(role);

        // TODO Load tickets on the #home page instead            
        app.isOnline(function() {
            app.loadTicketsOnline(role, function() {
                app.ticketsViews[roleId] = new TicketsView({ collection: app.tickets[roleId] });

                router.changePage('tickets', app.ticketsViews[roleId]);
    
                router.stopLoadingAnimation();
            });
        }, function() {
            app.ticketsViews[roleId] = new TicketsView({ collection: app.tickets[roleId] });
            
            router.changePage('tickets', app.ticketsViews[roleId]);
            
            router.stopLoadingAnimation();
        });
            
    },
        
    addTicketInit: function() {
        app.log("Router.addTicket");

        app.viewPreLoad('tickets', function() {
            //if (!app.addTicketView) {
                app.addTicketView = new AddTicketView({ model: null });
            //}

            router.changePage('addTicket', app.addTicketView);

            app.addTicketView.loadForms();
        });
    },

    logoutInit: function() {
        app.log("Router.logout");

        if (app.itemsToSync) {
            var itemCount = app.itemsToSync.length;
            if (itemCount > 0) {
                var confirm = window.confirm("You still have " + itemCount + " to sync, these will be lost if you logout. Continue?");
                if (!confirm) {
                    return;
                }
            }
        }

        app.clearLocalStorage();
        
        router.navigate('', { trigger: true });
    },
                        
    // This is where we deal with jQuery Mobile page changes    
    changePage: function(view, page) {
        app.log("Router.changePage: #" + view);

        $('div.ui-page').not('.ui-page-active').remove();

        var el = $(page.el);
            
        if (el.length === 0) {
            throw "changePage: Failed to find page element";
        }
            
        page.render();
        el.attr('data-role', 'page');
            
        $('body').append(el);

        var transition = 'slide';
        
        if (app.previousView === view) {
            transition = 'fade';            
        }
        if (this.firstPage) {
            transition = 'none';
            this.firstPage = false;
        }

        var reverse = false;
        
        if (app.backButton || view === 'login' || (view === 'home' && app.previousView !== 'login')) {
            reverse = true;
        }

        $.mobile.changePage(el, { changeHash: false, transition: transition, reverse: reverse });
        app.backButton = false;
        app.previousView = view;
        
        app.updateBadge();

        app.log("leave Router.changePage for #" + view);
    },
        
    startLoadingAnimation: function() {
        $.mobile.loading('show', {});
    },

    stopLoadingAnimation: function() {
        $.mobile.loading('hide', {});
    }
});

$(document).ready(function () {
    // If someone tries to manually reload the page at a random address (/#somePage) then it will 
    // probably break. Send them to the root / instead.
    if (location.hash !== '') {
        location.href = './';
        return;
    }

    router = new Router();
    Backbone.history.start();    
});
