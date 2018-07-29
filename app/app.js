/* ---- DON'T EDIT BELOW ---- */

var Plume = Plume || {};

Plume = (function () {
    'use strict';

    var config = Plume.config || {};
    var appURL = window.location.origin+window.location.pathname;

    // RDF
    var PROXY = "https://databox.me/,proxy?uri={uri}";
    var TIMEOUT = 5000;

    $rdf.Fetcher.crossSiteProxyTemplate = PROXY;
    // common vocabs
    var RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
    var FOAF = $rdf.Namespace("http://xmlns.com/foaf/0.1/");
    var DCT = $rdf.Namespace("http://purl.org/dc/terms/");
    var LDP = $rdf.Namespace("http://www.w3.org/ns/ldp#");
    var SIOC = $rdf.Namespace("http://rdfs.org/sioc/ns#");
    var SIOC = $rdf.Namespace("http://rdfs.org/sioc/ns#");
    var SOLID = $rdf.Namespace("http://www.w3.org/ns/solid/terms#");

    // init markdown editor
    var editor = new SimpleMDE({
        status: false,
        spellChecker: false
    });
    editor.codemirror.on("change", function(){
        savePendingPost(editor.value());
    });

    // sanitize value to/from markdown editor
    var getBodyValue = function() {
        var val = editor.codemirror.getValue();
        return val.replace('"', '\"');
    };
    var setBodyValue = function(val) {
        editor.value(val);
    }

    // set up markdown parser
    var parseMD = function(data) {
        if (data) {
            return editor.markdown(data);
        }
        return '';
    };

    // Get params from the URL
    var queryVals = (function(a) {
        if (a == "") return {};
        var b = {};
        for (var i = 0; i < a.length; ++i)
        {
            var p=a[i].split('=', 2);
            if (p.length == 1)
                b[p[0]] = "";
            else
                b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
        }
        return b;
    })(window.location.search.substr(1).split('&'));

    var defaultUser = {
        name: "John Doe",
        webid: "https://example.org/user#me",
        picture: "img/icon-blue.svg",
        authenticated: false
    };

    var user = {};
    var posts = {};
    var authors = {};
    var webSockets = {};

    // Initializer
    var init = function(configData) {
        // set config params
        applyConfig(configData);

        // try to load authors
        loadLocalAuthors();

        // Add online/offline events
        Solid.status.onOffline(function(){
            notify('info', "You are no longer connected to the internet.", 3000);
        });
        Solid.status.onOnline(function(){
            notify('info', "And we're back!");
        });
        // Init growl-like notifications
        window.addEventListener('load', function () {
            Notification.requestPermission(function (status) {
                // This allows to use Notification.permission with Chrome/Safari
                if (Notification.permission !== status) {
                    Notification.permission = status;
                }
            });
        });

        // basic app routes
        if (queryVals['post'] && queryVals['post'].length > 0) {
            var url = decodeURIComponent(queryVals['post']);
            showViewer(url);
            return;
        } else if (queryVals['view'] && queryVals['view'].length > 0) {
            // legacy [to be deprecated]
            var url = decodeURIComponent(queryVals['view']);
            showViewer(url);
            return;
        } else if (queryVals['edit'] && queryVals['edit'].length > 0) {
            var url = decodeURIComponent(queryVals['edit']);
            showEditor(url);
            return;
        } else if (queryVals['new'] !== undefined) {
            clearPendingPost();
            showEditor();
            return;
        } else if (queryVals['blog'] && queryVals['blog'].length > 0) {
            config.loadInBg = false;
            showBlog(queryVals['blog']);
            return;
        } else {
            // Load posts or initialize post container
            config.loadInBg = false;
            if (config.postsURL && config.postsURL.length > 0) {
                showBlog(config.postsURL);
            } else {
                showInitDialog();
            }
        }
    };

    // Set default config values
    var applyConfig = function(configData) {
        // loaded config from file
        config.defaultPath = 'posts';
        if (configData) {
            config = configData;
            // append trailing slash to data path if missing
            if (config.defaultPath.lastIndexOf('/') < 0) {
                config.defaultPath += '/';
            }
            config.saveDate = Date.now();
            saveLocalStorage();
        } else {
            // try to load config from localStorage
            console.log("Loading config from localStorage");
            loadLocalStorage();
        }

        document.querySelector('.blog-picture').src = config.picture;
        document.querySelector('.blog-title').innerHTML = config.title;
        document.querySelector('title').innerHTML = config.title;
        document.querySelector('.blog-tagline').innerHTML = config.tagline;
        // set default parent element for posts
        config.postsElement = '.posts';

        if (user.authenticated) {
            hideLogin();
        }

        // append trailing slash to data path if missing
        if (config.defaultPath.lastIndexOf('/') < 0) {
            config.defaultPath += '/';
        }
        if (!config.postsURL || config.postsURL.length === 0) {
            config.postsURL = appURL + config.defaultPath;
        }

        config.loadInBg = true;
    };

    // show a particular blog
    var showBlog = function(url) {
        // show loading
        if (!config.loadInBg) {
            showLoading();
        }
        fetchPosts(url);
    };

    // Init data container
    var initContainer = function(url) {
        Solid.web.head(url).then(
            function(container) {
                // create data container for posts if it doesn't exist
                if (!container.exists && container.xhr.status < 500) {
                    Solid.web.post(appURL, config.defaultPath, null, true).then(
                        function(res) {
                            if (res.url && res.url.length > 0) {
                                config.postsURL = res.url;
                            }
                            // add dummy post
                            var acme = {
                                title: "Welcome to Plume, a Solid blogging platform",
                                author: user.webid,
                                date: "3 Dec 2015",
                                body: "```\nHellowWorld();\n```\n\n**Note!** This is a demo post created under your name. Feel free to remove it whenever you wish.\n\n*Plume* is a 100% client-side application built using [Solid standards](https://github.com/solid/), in which data is decoupled from the application itself. This means that you can host the application on any Web server, without having to install anything -- no database, no messing around with Node.js, it has 0 dependencies! It also means that other similar applications will be able to reuse the data resulting from your posts, without having to go through a complicated API.\n\nPlume uses [Markdown](https://en.wikipedia.org/wiki/Markdown) to provide you with the easiest and fastest experience for writing beautiful articles. Click the *Edit* button below to see this article.\n\nGive it a try, write your first post!",
                                tags: [
                                    { color: "#df2d4f", name: "Decentralization" },
                                    { color: "#4d85d1", name: "Solid" }
                                ]
                            };
                            savePost(acme);
                        }
                    )
                    .catch(
                        function(err) {
                            console.log("Could not create data container for posts.");
                            console.log(err);
                            notify('error', 'Could not create data container');
                        }
                    );
                } else if (container.exists) {
                    config.postsURL = appURL+config.defaultPath;
                    fetchPosts(url);
                }
            }
        );
    }

    // Log user in
    var login = function() {
        // Get the current user
        Solid.auth.login().then(function(webid){
            gotWebID(webid);
        }).catch(function(err) {
            console.log(err);
            notify('error', "Authentication failed");
            showError(err);
        });
    };
    // Signup for a WebID and space
    var signup = function() {
        Solid.auth.signup().then(function(webid) {
            gotWebID(webid);
        }).catch(function(err) {
            console.log("Err", err);
            notify('error', "Authentication failed");
            showError(err);
        });
    };
    // Log user out
    var logout = function() {
        user = defaultUser;
        clearLocalStorage();
        showLogin();
        window.location.reload();
    };

    // set the logged in user
    var gotWebID = function(webid) {
        // set WebID
        user.webid = webid;
        user.authenticated = true;
        hideLogin();
        // fetch and set user profile
        Solid.identity.getProfile(webid).then(function(g) {
            var profile = getUserProfile(webid, g);
            user.name = profile.name;
            user.picture = profile.picture;
            user.date = Date.now();
            // add self to authors list
            authors[webid] = user;
            saveLocalAuthors();
            // add workspaces
            Solid.identity.getWorkspaces(webid, g).then(function(ws){
                user.workspaces = ws;
                // save to local storage and refresh page
                saveLocalStorage();
                window.location.reload();
            }).catch(function(err) {
                showError(err);
                // save to local storage and refresh page
                saveLocalStorage();
                window.location.reload();
            });
        });
    };

    // get profile data for a given user
    // Returns
    // webid: "https://example.org/user#me"
    // name: "John Doe",
    // picture: "https://example.org/profile.png"
    var getUserProfile = function(webid, g) {
        var profile = {};

        if (!g) {
            return profile;
        }

        var webidRes = $rdf.sym(webid);

        // set webid
        profile.webid = webid;

        // set name
        var name = g.any(webidRes, FOAF('name'));
        if (name && name.value.length > 0) {
            profile.name = name.value;
        } else {
            profile.name = '';
            // use familyName and givenName instead of full name
            var givenName = g.any(webidRes, FOAF('familyName'));
            if (givenName) {
                profile.name += givenName.value;
            }
            var familyName = g.any(webidRes, FOAF('familyName'));
            if (familyName) {
                profile.name += (givenName)?' '+familyName.value:familyName.value;
            }
            // use nick
            if (!givenName && !familyName) {
                var nick = g.any(webidRes, FOAF('nick'));
                if (nick) {
                    profile.name = nick.value;
                }
            }
        }

        // set picture
        var pic, img = g.any(webidRes, FOAF('img'));
        if (img) {
            pic = img;
        } else {
            // check if profile uses depic instead
            var depic = g.any(webidRes, FOAF('depiction'));
            if (depic) {
                pic = depic;
            }
        }
        if (pic && pic.uri.length > 0) {
            profile.picture = pic.uri;
        }

        return profile;
    };

    var confirmDelete = function(url) {
        var postTitle = (posts[url].title)?'<br><p><strong>'+posts[url].title+'</strong></p>':'this post';
        var div = document.createElement('div');
        div.id = 'delete';
        div.classList.add('dialog');
        var section = document.createElement('section');
        section.innerHTML = "You are about to delete "+postTitle;
        div.appendChild(section);

        var footer = document.createElement('footer');

        var del = document.createElement('button');
        del.classList.add("button");
        del.classList.add('danger');
        del.classList.add('float-left');
        del.setAttribute('onclick', 'Plume.deletePost(\''+url+'\')');
        del.innerHTML = 'Delete';
        footer.appendChild(del);
        // delete button
        var cancel = document.createElement('button');
        cancel.classList.add('button');
        cancel.classList.add('float-right');
        cancel.setAttribute('onclick', 'Plume.cancelDelete()');
        cancel.innerHTML = 'Cancel';
        footer.appendChild(cancel);
        div.appendChild(footer);

        // append to body
        document.querySelector('body').appendChild(div);
    };

    var cancelDelete = function() {
        document.getElementById('delete').remove();
    };

    var deletePost = function(url) {
        if (url) {
            Solid.web.del(url).then(
                function(done) {
                    if (done) {
                        delete posts[url];
                        document.getElementById(url).remove();
                        document.getElementById('delete').remove();
                        notify('success', 'Successfully deleted post');
                        resetAll(true);
                    }
                }
            )
            .catch(
                function(err) {
                    notify('error', 'Could not delete post');
                    resetAll();
                }
            );
        }
    };

    var showError = function(err) {
        if (!err || !err.xhr) {
            return;
        }
        hideLoading();
        var url = err.xhr.requestedURI;
        var errorText = '';
        if (err.status > 400 && err.status < 500) {
            errorText = "Could not fetch URL";
        }
        document.querySelector('.error-title').innerHTML = errorText + ' - ' + err.status;
        document.querySelector('.error-url').innerHTML = document.querySelector('.error-url').href = url;
        document.querySelector('.error').classList.remove('hidden');
    };

    var showViewer = function(url) {
        window.history.pushState("", document.querySelector('title').value, window.location.pathname+"?post="+encodeURIComponent(url));
        // hide main page
        document.querySelector(config.postsElement).classList.add('hidden');
        var viewer = document.querySelector('.viewer');
        viewer.classList.remove('hidden');

        var article = postToHTML(posts[url]);
        if (!article) {
            showLoading();
            fetchPost(url).then(
                function(post) {
                    // convert post to HTML
                    posts[url] = post;
                    hideLoading();
                    showViewer(url);
                }
            ).catch(
                function(err) {
                    showError(err);
                }
            );
            return;
        }

        // Update document title
        if (posts[url] && posts[url].title) {
            document.querySelector('title').innerHTML += ' - ' + posts[url].title;
        }

        // add last modified date
        if (posts[url].modified && posts[url].modified != posts[url].created) {
            var modDate = document.createElement('p');
            modDate.innerHTML += ' <small class="grey">'+"Last updated "+formatDate(posts[url].modified, 'LLL')+'</small>';
            article.querySelector('section').appendChild(modDate);
        }

        // append article
        viewer.appendChild(article);
        var footer = document.createElement('footer');
        viewer.appendChild(footer);
        // add separator
        var sep = document.createElement('h1');
        sep.classList.add('content-subhead');
        footer.appendChild(sep);
        // create button list
        var buttonList = document.createElement('div');
        // add back button
        var back = document.createElement('a');
        back.classList.add("action-button");
        back.href = window.location.pathname;
        back.innerHTML = '≪ Back to blog';
        buttonList.appendChild(back);
        // add view source
        if (config.showSources) {
            var src = document.createElement('a');
            src.classList.add("action-button");
            src.href = url;
            src.target = '_blank';
            src.innerHTML = 'View data';
            buttonList.appendChild(src);
        }
        // append button list to viewer
        footer.appendChild(buttonList);
    }

    var showEditor = function(url) {
        if (!user.authenticated) {
            notify('all', "You must log in before creating or editing posts.");
            return;
        }

        // make sure we're entering in edit mode
        if (editor.isPreviewActive()) {
            togglePreview();
        }
        // hide nav button
        document.getElementById('menu-button').classList.add('hidden');
        // handle tags
        var tags = document.querySelector('.editor-tags');
        var appendTag = function(name, color) {
            var tagDiv = document.createElement('div');
            tagDiv.classList.add('post-category');
            tagDiv.classList.add('inline-block');
            if (color) {
                tagDiv.setAttribute('style', 'background:'+color+';');
            }
            var span = document.createElement('span');
            span.innerHTML = name;
            tagDiv.appendChild(span);
            var tagLink = document.createElement('a');
            tagLink.setAttribute('onclick', 'this.parentElement.remove()');
            tagLink.innerHTML = 'x';
            tagDiv.appendChild(tagLink);
            tags.appendChild(tagDiv);
            // clear input
            document.querySelector('.editor-add-tag').value = '';
        };

        var loadPost = function(url) {
            var post = posts[url];
            if (post.title) {
                document.querySelector('.editor-title').value = post.title;
                // Also update document title
                document.querySelector('title').innerHTML += ' - Editing - ' + posts[url].title;
            }
            if (post.author) {
                var author = getAuthorByWebID(post.author);
                document.querySelector('.editor-author').innerHTML = author.name;
            }
            if (post.created) {
                document.querySelector('.editor-date').innerHTML = formatDate(post.created);
            }

            // add tags
            if (post.tags && post.tags.length > 0) {
                var tagInput = document.createElement('input');
                for (var i in post.tags) {
                    var tag = post.tags[i];
                    if (tag.name && tag.name.length > 0) {
                        appendTag(tag.name, tag.color);
                    }
                }

            }
            if (post.body) {
                setBodyValue(decodeHTML(post.body));
            }

            document.querySelector('.publish').innerHTML = "Update";
            document.querySelector('.publish').setAttribute('onclick', 'Plume.publishPost(\''+url+'\')');
            window.history.pushState("", document.querySelector('title').value, window.location.pathname+"?edit="+encodeURIComponent(url));
        };

        document.querySelector('.posts').classList.add('hidden');
        document.querySelector('.viewer').classList.add('hidden');
        document.querySelector('.start').classList.add('hidden');
        document.querySelector('.editor').classList.remove('hidden');
        document.querySelector('.editor-title').focus();
        document.querySelector('.editor-author').innerHTML = user.name;
        document.querySelector('.editor-date').innerHTML = formatDate();
        document.querySelector('.editor-tags').innerHTML = '';

        // add event listener and set up tags
        // document.querySelector('.editor-add-tag').value = '';
        // document.querySelector('.editor-add-tag').onkeypress = function(e){
        //     if (!e) e = window.event;
        //     var keyCode = e.keyCode || e.which;
        //     if (keyCode == '13'){
        //         appendTag(document.querySelector('.editor-add-tag').value, document.querySelector('.color-picker').style.background);
        //     }
        // }

        // preload data if updating
        if (url && url.length > 0) {
            if (posts[url]) {
                loadPost(url);
            } else {
                fetchPost(url).then(
                    function(post) {
                        loadPost(url);
                    }
                );
            }
        } else {
            // resume post if we have data
            var post = loadPendingPost();
            if (post) {
                setBodyValue(post.body);
                document.querySelector('.editor-title').value = post.title;
            }
            document.querySelector('.publish').innerHTML = "Publish";
            document.querySelector('.publish').setAttribute('onclick', 'Plume.publishPost()');
        }
    };

    var publishPost = function(url) {
        var post = (url)?posts[url]:{};
        post.title = trim(document.querySelector('.editor-title').value);
        post.body = getBodyValue();
        post.tags = [];
        var allTags = document.querySelectorAll('.editor-tags .post-category');
        for (var i in allTags) {
            if (allTags[i].style) {
                var tag = {};
                tag.name = allTags[i].querySelector('span').innerHTML;
                tag.color = rgbToHex(allTags[i].style.background);
                post.tags.push(tag);
            }
        }

        post.modified = moment().utcOffset('00:00').format("YYYY-MM-DDTHH:mm:ssZ");

        if (!url) {
            post.author = user.webid;
            post.created = post.modified;
        }

        savePost(post, url);
    };

    // save post data to server
    var savePost = function(post, url) {
        //TODO also write tags - use sioc:topic -> uri
        var g = new $rdf.graph();
        g.add($rdf.sym(''), RDF('type'), SIOC('Post'));
        g.add($rdf.sym(''), DCT('title'), $rdf.lit(post.title));
        g.add($rdf.sym(''), SIOC('has_creator'), $rdf.sym('#author'));
        g.add($rdf.sym(''), DCT('created'), $rdf.lit(post.created, '', $rdf.Symbol.prototype.XSDdateTime));
        g.add($rdf.sym(''), DCT('modified'), $rdf.lit(post.modified, '', $rdf.Symbol.prototype.XSDdateTime));
        g.add($rdf.sym(''), SIOC('content'), $rdf.lit(encodeHTML(post.body)));

        g.add($rdf.sym('#author'), RDF('type'), SIOC('UserAccount'));
        g.add($rdf.sym('#author'), SIOC('account_of'), $rdf.sym(post.author));
        g.add($rdf.sym('#author'), FOAF('name'), $rdf.lit(authors[post.author].name));
        g.add($rdf.sym('#author'), SIOC('avatar'), $rdf.sym(authors[post.author].picture));

        var triples = new $rdf.Serializer(g).toN3(g);

        if (url) {
            var writer = Solid.web.put(url, triples);
        } else {
            var slug = makeSlug(post.title);
            var writer = Solid.web.post(config.postsURL, slug, triples);
        }
        writer.then(
            function(res) {
                // all done, clean up and go to initial state
                if (res.url.slice(0,4) !== 'http') {
                    res.url = config.postsURL.slice(0, config.postsURL.lastIndexOf('/') + 1)+slug;
                }
                cancelPost('?post='+encodeURIComponent(res.url));
            }
        )
        .catch(
            function(err) {
                console.log("Could not create post!");
                console.log(err);
                notify('error', 'Could not create post');
                resetAll();
            }
        );
    };

    var fetchPosts = function(url, showGrowl) {
        // select element holding all the posts
        var postsdiv = document.querySelector(config.postsElement);
        // clear previous posts
        postsdiv.innerHTML = '';
        // ask only for sioc:Post resources
        Solid.web.get(url).then(
            function(g) {
                var _posts = [];
                var st = g.statementsMatching(undefined, RDF('type'), SIOC('Post'));
                // fallback to containment triples
                if (st.length === 0) {
                    st = g.statementsMatching($rdf.sym(url), LDP('contains'), undefined);
                    st.forEach(function(s) {
                        _posts.push(s.object.uri);
                    })
                } else {
                    st.forEach(function(s) {
                        _posts.push(s.subject.uri);
                    });
                }

                if (_posts.length === 0) {
                    resetAll();
                    hideLoading();
                    if (user.authenticated) {
                        document.querySelector('.start').classList.remove('hidden');
                    } else {
                        document.querySelector('.init').classList.remove('hidden');
                    }
                }

                var toLoad = _posts.length;
                var isDone = function() {
                    if (toLoad <= 0) {
                        hideLoading();
                        if (showGrowl) {
                            growl("Updating...", "Finished updating your blog");
                        }
                    }
                }

                var sortedPosts = [];
                _posts.forEach(function(url){
                    fetchPost(url).then(
                        function(post) {
                            if (len(post) === 0) {
                                toLoad--;
                                isDone();
                            } else {
                                // convert post to HTML
                                var article = postToHTML(post, true);

                                // sort array and add to dom
                                // TODO improve it later
                                sortedPosts.push({date: post.created, url: post.url});
                                sortedPosts.sort(function(a,b) {
                                    var c = new Date(a.date);
                                    var d = new Date(b.date);
                                    return d-c;
                                });
                                for(var i=0; i<sortedPosts.length; i++) {
                                    var p = sortedPosts[i];
                                    if (p.url == post.url) {
                                        if (i === sortedPosts.length-1) {
                                            postsdiv.appendChild(article);
                                        } else {
                                            postsdiv.insertBefore(article, document.getElementById(sortedPosts[i+1].url));
                                        }
                                        break;
                                    }
                                }

                                // fade long text in article
                                if (config.fadeText) {
                                    addTextFade(post.url);
                                }

                                toLoad--;
                                isDone();
                            }
                        }
                    )
                    .catch(
                        function(err) {
                            showError(err);
                            toLoad--;
                            isDone();
                        }
                    );
                });

                // setup WebSocket listener since we are sure we have posts in this container
                Solid.web.head(url).then(function(meta) {
                    if (meta.websocket.length > 0) {
                        socketSubscribe(meta.websocket, url);
                    }
                }).catch(
                    function(err) {
                        showError(err);
                    }
                );
            }
        )
        .catch(
            function(err) {
                showError(err);
            }
        );
    };

    var fetchPost = function(url) {
        var promise = new Promise(function(resolve, reject){
            Solid.web.get(url).then(
                function(g) {
                    var subject = g.any(undefined, RDF('type'), SIOC('Post'));

                    if (!subject) {
                        subject = g.any(undefined, RDF('type'), SOLID('Notification'));
                    }

                    if (subject) {
                        var post = { url: subject.uri };

                        // add title
                        var title = g.any(subject, DCT('title'));
                        if (title && title.value) {
                            post.title = encodeHTML(title.value);
                        }

                        // add author
                        var author = {};
                        var creator = g.any(subject, SIOC('has_creator'));
                        if (creator) {
                            var accountOf = g.any(creator, SIOC('account_of'));
                            if (accountOf) {
                                post.author = encodeHTML(accountOf.uri);
                                author.webid = post.author;
                            }
                            var name = g.any(creator, FOAF('name'));
                            if (name && name.value && name.value.length > 0) {
                                author.name = encodeHTML(name.value);
                            }
                            var picture = g.any(creator, SIOC('avatar'));
                            if (picture) {
                                author.picture = encodeHTML(picture.uri);
                            }
                        } else {
                            creator = g.any(subject, DCT('creator'));
                            if (creator) {
                                post.author = encodeHTML(creator.uri);
                            }
                        }
                        // add to list of authors if not self
                        if (post.author && post.author != user.webid && !authors[post.author]) {
                            authors[post.author] = author;
                            // save list to localStorage
                            saveLocalAuthors();
                        }
                        // update author info with fresh data
                        if (post.author && post.author.length >0) {
                            updateAuthorInfo(post.author, url);
                        }

                        // add created date
                        var created = g.any(subject, DCT('created'));
                        if (created) {
                            post.created = created.value;
                        }

                        // add modified date
                        var modified = g.any(subject, DCT('modified'));
                        if (modified) {
                            post.modified = modified.value;
                        } else {
                            post.modified = post.created;
                        }

                        // add body
                        var body = g.any(subject, SIOC('content'));
                        if (body) {
                            post.body = body.value;
                        }

                        // add post to local list
                        posts[post.url] = post;
                        resolve(post);
                    } else {
                        resolve({});
                    }
                }
            )
            .catch(
                function(err) {
                    reject(err);
                }
            );
        });

        return promise;
    };

    // update author details with more recent data
    // TODO add date of last update to avoid repeated fetches
    var updateAuthorInfo = function(webid, url) {
        // check if it really needs updating first
        if (webid == user.webid || authors[webid].updated || authors[webid].lock) {
            return;
        }
        authors[webid].lock = true;
        Solid.identity.getProfile(webid).
        then(function(g) {
            var profile = getUserProfile(webid, g);
            if (len(profile) > 0) {
                authors[webid].updated = true;
                authors[webid].name = profile.name;
                authors[webid].picture = profile.picture;
                // save to localStorage
                saveLocalAuthors();
                // release lock
                authors[webid].lock = false;
                if (url && posts[url]) {
                    var postId = document.getElementById(url);
                    if (profile.name && postId) {
                        postId.querySelector('.post-author').innerHTML = profile.name;
                        postId.querySelector('.post-avatar').title = profile.name+"'s picture";
                        postId.querySelector('.post-avatar').alt = profile.name+"'s picture";
                    }
                    if (profile.picture && postId) {
                        postId.querySelector('.post-avatar').src = profile.picture;
                    }
                }
            }
        }).
        catch(function(err) {
            console.log(err);
        });
    };

    var getAuthorByWebID = function(webid) {
        var name = 'Unknown';
        var picture = 'img/icon-blue.svg';
        if (webid && webid.length > 0) {
            var author = authors[webid];
            if (author && author.name) {
                name = author.name;
            }
            if (author && author.picture) {
                picture = author.picture;
            }
        }
        return {name: name, picture: picture};
    };

    var postToHTML = function(post, makeLink) {
        // change separator: <h1 class="content-subhead">Recent Posts</h1>
        if (!post) {
            return;
        }
        var author = getAuthorByWebID(post.author);
        var name = author.name;
        var picture = author.picture;

        // create main post element
        var article = document.createElement('article');
        article.classList.add('post');
        article.id = post.url;

        // create header
        var header = document.createElement('header');
        header.classList.add('post-header');
        // append header to article
        article.appendChild(header);

        // set avatar
        var avatar = document.createElement('img');
        avatar.classList.add('post-avatar');
        avatar.src = picture;
        avatar.alt = avatar.title = name+"'s picture";
        // append picture to header
        var avatarLink = document.createElement('a');
        avatarLink.href = post.author;
        avatarLink.setAttribute('target', '_blank');
        avatarLink.appendChild(avatar);
        header.appendChild(avatarLink);

        // add meta data
        var meta = document.createElement('div');
        meta.classList.add('post-meta');
        // append meta to header
        header.appendChild(meta);

        // create meta author
        var metaAuthor = document.createElement('a');
        metaAuthor.classList.add('post-author');
        metaAuthor.href = post.author;
        metaAuthor.setAttribute('target', '_blank');
        metaAuthor.innerHTML = name;
        // append meta author to meta
        meta.appendChild(metaAuthor);

        // add br
        meta.appendChild(document.createElement('br'));

        // create meta date
        var metaDate = document.createElement('span');
        metaDate.classList.add('post-date');
        metaDate.innerHTML = formatDate(post.created);
        // append meta date to meta
        meta.appendChild(metaDate);

        // create meta tags
        if (post.tags && post.tags.length > 0) {
            var metaTags = document.createElement('span');
            metaTags.classList.add('post-tags');
            metaTags.innerHTML = " under ";
            for (var i in post.tags) {
                var tag = post.tags[i];
                if (tag.name && tag.name.length > 0) {
                    var tagLink = document.createElement('a');
                    tagLink.classList.add('post-category');
                    if (tag.color) {
                        tagLink.setAttribute('style', 'background:'+tag.color+';');
                    }
                    tagLink.innerHTML = tag.name;
                    tagLink.href = "#";
                    tagLink.setAttribute('onclick', 'Plume.sortTag("'+tag.name+'")');
                    metaTags.appendChild(tagLink);
                }
            }

            // append meta tag
            meta.appendChild(metaTags);
        }

        // create title
        var title = document.createElement('h1');
        title.classList.add('post-title');
        title.innerHTML = (post.title)?'<a class="clickable" href="?post='+encodeURIComponent(post.url)+'">'+post.title+'</a>':'';
        // append title to body
        header.appendChild(title);

        // create body
        var section = document.createElement('section');
        section.classList.add('post-body');
        article.appendChild(section);

        var bodyText = parseMD(decodeHTML(post.body));

        // add post body
        if (makeLink) {
            section.classList.add('clickable');
            section.addEventListener('click', function (event) { window.location.replace('?post='+encodeURIComponent(post.url))});
        }
        section.innerHTML += bodyText;

        // add footer with action links
        var footer = document.createElement('footer');

        if (user.webid == post.author) {
            // edit button
            var edit = document.createElement('a');
            edit.classList.add("action-button");
            edit.href = '?edit='+encodeURIComponent(post.url);
            edit.setAttribute('title', 'Edit post');
            edit.innerHTML = '<img src="img/logo.svg" alt="Edit post">Edit';
            footer.appendChild(edit);
            // delete button
            var del = document.createElement('a');
            del.classList.add('action-button');
            del.classList.add('danger-text');
            del.setAttribute('onclick', 'Plume.confirmDelete(\''+post.url+'\')');
            del.innerHTML = 'Delete';
            footer.appendChild(del);
        }

        // append footer to post
        article.appendChild(footer);

        var sep = document.createElement('div');
        sep.classList.add('separator');
        article.appendChild(sep);

        // append article to list of posts
        return article;
    };

    // fade long text in articles
    // TODO fix fade after updating post
    var addTextFade = function(url) {
        // get element current height
        var article = document.getElementById(url);
        if (url && article) {
            var section = article.querySelector('section');
            var height = section.offsetHeight;
            // fade post contents if post is too long
            if (height > 400) {
                section.classList.add('less');
                var fade = document.createElement('div');
                fade.classList.add('fade-bottom');
                fade.classList.add('center-text');
                fade.innerHTML = '<a href="?post='+encodeURIComponent(url)+'" class="no-decoration clickable">&mdash; '+"more &mdash;</a>";
                article.insertBefore(fade, article.querySelector('footer'));
            }
        }
    };

    // Websocket
    var connectToSocket = function(wss, uri) {
        if (!webSockets[wss]) {
            var socket = new WebSocket(wss);
            socket.onopen = function(){
                this.send('sub ' + uri);
                console.log("Connected to WebSocket at", wss);
            }
            socket.onmessage = function(msg){
                if (msg.data && msg.data.slice(0, 3) === 'pub') {
                    // resource updated
                    var res = trim(msg.data.slice(3, msg.data.length));
                    console.log("Got new message: pub", res);
                    fetchPosts(res, true); //refetch posts and notify
                }
            }
            socket.onclose = function() {
                console.log("Websocket connection closed. Restarting...");
                connectToSocket(wss, uri);
            }
            webSockets[wss] = socket;
        }
    };

    // Subscribe to changes to a URL
    var socketSubscribe = function(wss, url) {
        if (webSockets[wss]) {
            webSockets[wss].send('sub '+url);
        } else {
            connectToSocket(wss, url);
        }
    };

    // Misc/helper functions
    var sortTag = function(name) {
        console.log(name);
    };

    var notify = function(ntype, text, timeout) {
        timeout = timeout || 1500;
        var note = document.createElement('div');
        note.classList.add('note');
        note.innerHTML = text;
        note.addEventListener('click', note.remove, false);

        switch (ntype) {
            case 'success':
                note.classList.add('success');
                break;
            case 'error':
                timeout = 3000;
                note.classList.add('danger');
                var tip = document.createElement('small');
                tip.classList.add('small');
                tip.innerHTML = ' Tip: check console for debug information.';
                note.appendChild(tip);
                break;
            case 'sticky':
                timeout = 0;
                note.classList.add('dark');
                note.innerHTML += ' <small>[dismiss]</small>'
                break;
            default:
                note.classList.add('dark');
        }
        document.querySelector('body').appendChild(note);
        if (timeout > 0) {
            setTimeout(function() {
                note.remove();
            }, timeout);
        }
    };

    // Send a browser notification
    var growl = function(type, body, timeout) {
        var icon = 'favicon.png';
        if (!timeout) {
            var timeout = 2000;
        }

        // Let's check if the browser supports notifications
        if (!("Notification" in window)) {
            console.log("This browser does not support desktop notification");
        }

        // At last, if the user already denied any notification, and you
        // want to be respectful there is no need to bother him any more.
        // Let's check if the user is okay to get some notification
        if (Notification.permission === "granted") {
            // If it's okay let's create a notification
            var notification = new Notification(type, {
                dir: "auto",
                lang: "",
                icon: icon,
                body: body,
                tag: "notif"
            });
            setTimeout(function() { notification.close(); }, timeout);
        }
    };
    // Authorize browser notifications
    function authorizeNotifications() {
        var status = getNotifStatus();
        // Let's check if the browser supports notifications
        if (!("Notification" in window)) {
            console.log("This browser does not support desktop notification");
        }

        if (status !== 'granted') {
            Notification.requestPermission(function (permission) {
                // Whatever the user answers, we make sure we store the information
                Notification.permission = permission;
            });
        } else if (status === 'granted') {
            Notification.permission = 'denied';
        }
    };
    // Browser notifications status
    function getNotifStatus() {
        // Let's check if the browser supports notifications
        if (!("Notification" in window)) {
            console.log("This browser does not support desktop notification");
            return undefined
        } else {
            return Notification.permission;
        }
    };

    // Overlay
    var toggleOverlay = function(elem) {
        var overlay = document.querySelector(elem);
        overlay.addEventListener('click', toggleOverlay);
        overlay.style.visibility = (overlay.style.visibility == "visible") ? "hidden" : "visible";
    };

    // Convert rgb() to #hex
    var rgbToHex = function (color) {
        color = color.replace(/\s/g,"");
        var aRGB = color.match(/^rgb\((\d{1,3}[%]?),(\d{1,3}[%]?),(\d{1,3}[%]?)\)$/i);
        if(aRGB)
        {
            color = '';
            for (var i=1;  i<=3; i++) color += Math.round((aRGB[i][aRGB[i].length-1]=="%"?2.55:1)*parseInt(aRGB[i])).toString(16).replace(/^(.)$/,'0$1');
        }
        else color = color.replace(/^#?([\da-f])([\da-f])([\da-f])$/i, '$1$1$2$2$3$3');
        return '#'+color;
    };

    var togglePreview = function() {
        editor.togglePreview();
        var text = document.querySelector('.preview');
        text.innerHTML = (text.innerHTML=="View")?"Edit":"View";
    };

    // check if user is among the owners list
    var isOwner = function() {
        if (config.owners && config.owners.indexOf(user.webid) >= 0) {
            return true;
        }
        return false;
    };

    // formatDate
    var formatDate = function(date, style) {
        style = style || 'LL';
        if (moment().diff(moment(date), 'days') > 1) {
            return moment(date).format(style);
        } else {
            return moment(date).fromNow();
        }
    };

    // sanitize strings
    var trim = function (str) {
        return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    }
    var makeSlug = function (str) {
        // replace white spaces and multiple dashes
        str = str.replace(/\s+/g, '-').
                    replace(/-+/g, '-').
                    replace(/^-+/, '').
                    replace(/-*$/, '').
                    replace(/[^A-Za-z0-9-]/g, '').
                    toLowerCase();
        str += '.ttl';
	return str;
    };

    // escape HTML code
    var encodeHTML = function (html) {
        return html
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    var decodeHTML = function (html) {
        return html
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#039;/g, "'");
    };
    // compute length of objects based on its keys
    var len = function(obj) {
        return Object.keys(obj).length;
    };


    var setColor = function(color) {
        document.querySelector('.color-picker').style.background = window.getComputedStyle(document.querySelector('.'+color), null).backgroundColor;
        document.querySelector('.pure-menu-active').classList.remove('pure-menu-active');
        document.querySelector('.editor-add-tag').focus();
    };

    var cancelPost = function(url) {
        clearPendingPost();
        url = (url)?url:window.location.pathname;
        window.location.replace(url);
    };

    // reset to initial view
    var resetAll = function(refresh) {
        document.getElementById('menu-button').classList.remove('hidden');
        if (isOwner()) {
            showNewPostButton();
        }
        hideLoading();
        document.querySelector('.init').classList.add('hidden');
        document.querySelector('.editor').classList.add('hidden');
        document.querySelector('.viewer').classList.add('hidden');
        document.querySelector('.viewer').innerHTML = '';
        document.querySelector('.posts').classList.remove('hidden');
        // document.querySelector('.editor-add-tag').value = '';
        if (posts && len(posts) === 0) {
            if (user.authenticated) {
                document.querySelector('.start').classList.remove('hidden');
            } else {
                document.querySelector('.init').classList.remove('hidden');
            }
        }
        if (refresh) {
            showBlog(config.postsURL);
        } else {
            window.history.pushState("", document.querySelector('title').value, window.location.pathname);
        }
    };

    // login / logout buttons + new post
    var showLogin = function() {
        document.getElementsByClassName('login')[0].classList.remove('hidden');
        document.getElementsByClassName('logout')[0].classList.add('hidden');
        hideNewPostButton();
    };
    var hideLogin = function() {
        document.getElementsByClassName('login')[0].classList.add('hidden');
        document.getElementsByClassName('logout')[0].classList.remove('hidden');
    };
    // loading animation
    var hideLoading = function() {
        document.querySelector('.loading').classList.add('hidden');
    }
    var showLoading = function() {
        document.querySelector('.loading').classList.remove('hidden');
    }
    // new post button
    var hideNewPostButton = function() {
        document.querySelector('.new').classList.add('hidden');
    };
    var showNewPostButton = function() {
        document.querySelector('.new').classList.remove('hidden');
    };

    // save pending post text to localStorage
    var savePendingPost = function(text) {
        var post = {};
        post.title = trim(document.querySelector('.editor-title').value);
        post.body = text;
        try {
            localStorage.setItem(appURL+'pendingPost', JSON.stringify(post));
        } catch(err) {
            console.log(err);
        }

    };
    // load pending post text from localStorage
    var loadPendingPost = function() {
        try {
            return JSON.parse(localStorage.getItem(appURL+'pendingPost'));
        } catch(err) {
            console.log(err);
        }
    };
    var clearPendingPost = function() {
        setBodyValue('');
        try {
            localStorage.removeItem(appURL+'pendingPost');
        } catch(err) {
            console.log(err);
        }
    }

    // save authors to localStorage
    var saveLocalAuthors = function() {
        try {
            localStorage.setItem(appURL+'authors', JSON.stringify(authors));
        } catch(err) {
            console.log(err);
        }
    };
    // clear localstorage authors data
    var clearLocalAuthors = function() {
        try {
            localStorage.removeItem(appURL+'authors');
        } catch(err) {
            console.log(err);
        }
    };
    // clear localstorage config data
    var loadLocalAuthors = function() {
        try {
            var data = JSON.parse(localStorage.getItem(appURL+'authors'));
            if (data) {
                authors = data;
            }
        } catch(err) {
            console.log(err);
        }
    };

    // save config data to localStorage
    var saveLocalStorage = function() {
        var data = {
            user: user,
            config: config
        };
        try {
            localStorage.setItem(appURL, JSON.stringify(data));
        } catch(err) {
            console.log(err);
        }
    };
    // clear localstorage config data
    var clearLocalStorage = function() {
        try {
            localStorage.removeItem(appURL);
        } catch(err) {
            console.log(err);
        }
    };
    var loadLocalStorage = function() {
        try {
            var data = JSON.parse(localStorage.getItem(appURL));
            if (data) {
                // don't let session data become stale (24h validity)
                var dateValid = data.config.saveDate + 1000 * 60 * 60 * 24;
                if (Date.now() < dateValid) {
                    config = data.config;
                    user = data.user;
                    if (user.authenticated) {
                        hideLogin();
                    }
                    if (isOwner()) {
                        showNewPostButton();
                    }
                } else {
                    console.log("Deleting localStorage data because it expired");
                    localStorage.removeItem(appURL);
                }
            } else {
                // clear sessionStorage in case there was a change to the data structure
                localStorage.removeItem(appURL);
            }
        } catch(err) {
            notify('sticky', 'Persistence functionality is disabled while cookies are disabled.');
            console.log(err);
        }
    };



    // ----- INIT -----
    // start app by loading the config file
    applyConfig();
    var http = new XMLHttpRequest();
    http.open('get', 'config.json');
    http.onreadystatechange = function() {
        if (this.readyState == this.DONE) {
            init(JSON.parse(this.response));
        }
    };
    http.send();



    // return public functions
    return {
        notify: notify,
        user: user,
        posts: posts,
        login: login,
        logout: logout,
        signup: signup,
        resetAll: resetAll,
        cancelPost: cancelPost,
        showEditor: showEditor,
        showViewer: showViewer,
        setColor: setColor,
        publishPost: publishPost,
        confirmDelete: confirmDelete,
        cancelDelete: cancelDelete,
        deletePost: deletePost,
        togglePreview: togglePreview,
        toggleOverlay: toggleOverlay,
        growl: growl
    };
}(this));


Plume.menu = (function() {
    var ESCAPE_CODE = 27;

    var navButton = document.getElementById('menu-button'),
      navMenu = document.getElementById('global-nav'),
      mainDiv = document.getElementById('main');

    var navLinks = navMenu.getElementsByTagName('a');

    function handleKeydown(event) {
        event.preventDefault();
        if (event.keyCode === ESCAPE_CODE) {
              document.body.classList.toggle('active');
              disableNavLinks();
              navButton.focus();
        }
    };
    function handleClick(event) {
        event.preventDefault();
        if (document.body.classList.contains('active')) {
              document.body.classList.remove('active');
              disableNavLinks();
        }
        else {
              document.body.classList.add('active');
              enableNavLinks();
              navLinks[0].focus();
        }
    };
    function forceClose(event) {
        if (document.body.classList.contains('active')) {
              document.body.classList.remove('active');
              disableNavLinks();
        }
    };
    function enableNavLinks() {
        navButton.removeAttribute('aria-label', 'Menu expanded');
        navMenu.removeAttribute('aria-hidden');
        for (var i=0; i<navLinks.length; i++) {
            navLinks[i].setAttribute('tabIndex', i+2);
        }
    };
    function disableNavLinks() {
        navButton.setAttribute('aria-label', 'Menu collapsed');
        navMenu.setAttribute('aria-hidden', 'true');
        for (var i=0; i<navLinks.length; i++) {
            navLinks[i].setAttribute('tabIndex', '-1');
        }
    };

    function init() {
        mainDiv.addEventListener('click', forceClose, false);
        for (var i=0; i<navLinks.length;i++){
            navLinks[i].addEventListener('click', forceClose, false);
        }
        navMenu.addEventListener('keydown', handleKeydown);
        navButton.addEventListener('click', handleClick, false);
        disableNavLinks();
    };

    return {
        init: init,
        forceClose: forceClose
    }
})();
Plume.menu.init();

