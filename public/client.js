//check README.md for more information

//VS Code intellisense
/// <reference path="TSDef/p5.global-mode.d.ts" />

/*
The client and server version strings MUST be the same!
If the server gets updated it can be restarted, but if there are active clients (users' open browsers) they could be outdated and create issues.
*/
var VERSION = "1.0";

//for testing purposes I can skip the login phase
//and join with a random avatar
//passed by the settings
var QUICK_LOGIN = false;
var FPS = 60;
var AFK = false;

//the socket connection
var socket;
var SETTINGS;
//generic string container sent by the server
var TEXT;

//default page background 
var PAGE_COLOR = "#000000";

//when the nickName is "" the player is invisible inactive: lurk mode
//for admins it contains the password so it shouldn't be shared
var nickName = "";
var pronoun = "";

//this object keeps track of all the current players in the room, coordinates, bodies and color
var players = {};
//a reference to my player
var me;

//set the time at the beginning of the computing era, the SEVENTIES!
var lastMessage = 0;

//time since the server started
var START_TIME = -1;

var gameState = "";

//client side antispam, avoid repeated messages
var lastAction = "";
var lastChat = "";
//my previous
var previousMessage = "";
var talkPrompt = "";

var messageSound = new sound("chick.mp3");
var actionSound = new sound("blip.mp3");


function setup() {
    console.log("setting up...");

    //make sure there are no existing sockets
    if (socket != null) {
        socket.disconnect();
        socket = null;
    }

    //I create a socket but I wait to assign all the functions before opening a connection
    socket = io({
        autoConnect: false
    });

    //connected
    socket.on("connect", function () {

        if (nickName != "") {
            console.log("Server restarted");
            //location.reload(true);
        }
        else
            console.log("connected to server");


    });//end connect

    //receive first server message with version and game data
    socket.on("serverWelcome",
        function (serverVersion, _START_TIME, SERVERSETTINGS, _TEXT) {
            if (socket.id) {
                console.log("Welcome! Server version: " + serverVersion + " - client version " + VERSION + " started " + _START_TIME);

                //store the unchangeable data locally
                START_TIME = _START_TIME;
                TEXT = _TEXT;
                SETTINGS = SERVERSETTINGS;

                QUICK_LOGIN = SETTINGS.QUICK_LOGIN;

                //clear passage
                var div = document.getElementById('passage');
                div.innerHTML = "";

                div = document.getElementById('title');
                div.innerHTML = "";


                clearChat();

                //check the version
                if (serverVersion != VERSION) {
                    errorMessage = "VERSION MISMATCH: PLEASE HARD REFRESH";
                    document.body.innerHTML = errorMessage;
                    socket.disconnect();
                }




                //for testing purposes just
                if (QUICK_LOGIN) {
                    hideUsername();
                    nickName = "user" + Math.floor(Math.random() * 1000);
                    pronoun = "they";
                    description = "They are very hot and well dressed";

                    //if socket !null the connection has been established ie lurk mode
                    if (socket != null) {
                        socket.emit("login", nickName, pronoun, description);
                    }

                }
                else {
                    //normal start
                    hideChat();
                    showUsername();
                    hideDescription();
                    hidePronouns();

                }
            }
        }
    );

    //...server waits for username, see nameOk

    //server sends out the response to the name submission,
    socket.on("nameResponse",
        function (code) {
            if (socket.id) {

                if (code == 0) {
                    console.log("Username already taken");
                    var e = document.getElementById("username-error");

                    if (e != null)
                        e.innerHTML = "Username already taken";
                }
                else if (code == 3) {

                    var e = document.getElementById("username-error");

                    if (e != null)
                        e.innerHTML = "Sorry, only standard western characters are allowed";
                }
                else {
                    ///////CONTINUE multi step login
                    showPronouns();
                    hideUsername();
                }

            }
        }

    );

    //when I join a room
    socket.on("joinedRoom", function (roomId, roomPlayers) {
        console.log("Room joined");
        gameState = "game";
        showChat();

        //initialize players as object list
        players = {};


        //create/initialize all the players including me
        for (var i = 0; i < roomPlayers.length; i++) {
            var player = roomPlayers[i];

            //initialize player object and add it to the local list
            players[player.id] = player;

            if (socket.id == player.id) {
                console.log("I joined the room " + player.room + " as " + player.nickName);
                me = player;
            }
            else {
                console.log("Player " + player.nickName + " is here too");
            }
        }


    });

    socket.on("changePassage", function (html, closeChat = false) {

        loggedIn = true;

        hideUsername();

        if (closeChat)
            hideChat();
        else
            showChat();

        var div = document.getElementById('passage');
        div.innerHTML = html;
        clearChat();

        talkPrompt = SETTINGS.talkPrompt;
        $('#talk-field').attr('placeholder', talkPrompt);

        //fixing mysterious spaces on external links
        $('.externalLink').each(function () {
            var oldUrl = $(this).attr("href"); // Get current url
            var newUrl = oldUrl.replace(/\s/g, ""); // Create new url
            $(this).attr("href", newUrl); // Set herf value
        });

    });

    socket.on("descriptionReceived", function (description, name) {
        playerDescription(description);
        talkPrompt = SETTINGS.privatePrompt + name;
        $('#talk-field').attr('placeholder', talkPrompt);
        clearChat();
    });

    //when somebody else joins a room
    socket.on("playerJoined",
        function (p) {
            try {
                players[p.id] = p;

                enableNameLinks(p.nickName);
                console.log("There are now " + Object.keys(players).length + " players in this room");

            } catch (e) {
                console.log("Error on playerJoined");
                console.error(e);
            }
        }
    );

    //when somebody disconnects/leaves the room
    socket.on("playerLeft",
        function (pId, disconnect) {
            try {

                var p = players[pId];

                if (p != null) {
                    //if (disconnect)
                    //    chatMessage("<span class='action'>" + p.nickName + " disconnected.</span>");

                    //i don't want to change what's already been written but I want to prevent players from clicking on usernames that 
                    //are not here so I disable the links in the whole page
                    disableNameLinks(p.nickName);

                    //update my local list
                    if (players[pId] != null) {
                        players[pId] = null;

                    }
                }

                console.log("There are now " + Object.keys(players).length + " players in this room");

            } catch (e) {
                console.log("Error on playerLeft");
                console.error(e);
            }
        }
    );

    socket.on("actionMessage",
        function (msg) {

            if (msg != lastAction) {
                //actionSound.play();
                chatMessage("<span class='action'>" + msg + "</span>");
                lastAction = msg;
            }
        }
    );



    //when somebody talks
    socket.on("playerTalked",
        function (msg) {
            try {
                //console.log("new message from " + p.nickName + ": " + p.message);
                if (msg != lastChat) {
                    messageSound.play();
                    chatMessage(msg);
                    lastChat = msg;
                }

            } catch (e) {
                console.log("Error on playerTalked");
                console.error(e);
            }
        }
    );

    //displays an error message
    socket.on("errorMessage",
        function (msg) {
            if (socket.id) {
                alert(msg);
            }
        }
    );

    //player in the room is AFK
    socket.on("playerBlurred", function (nickName) {
        //console.log(nickName + " is AFK");

        $(".nameLink:contains(" + nickName + ")").addClass("afk");


        //$(".nameLink:contains(" + nickName + ")").html(nickName + " (AFK)");

    });

    //player in the room is AFK
    socket.on("playerFocused", function (nickName) {
        //console.log(nickName + " is back on keyboard");

        $(".nameLink:contains(" + nickName + ")").removeClass("afk");
        //$(".nameLink:contains(" + nickName + " (AFK)" + ")").html(nickName);

    });

    //player in the room is AFK
    socket.on("changeTitle", function (title) {

        $("#title").html(title);

    });


    //when the client realizes it's being disconnected
    socket.on("disconnect", function () {
        //console.log("OH NO");
    });

    //server forces refresh (on disconnect or to force load a new version of the client)
    socket.on("refresh", function () {
        socket.disconnect();
        location.reload(true);
    });

    //I can now open the socket
    socket.open();

    //initialize update cycle
    setInterval(function () {
        update();
    }, 1000 / FPS);
}


//just an update cycle at 60 FPS
function update() {

}

//request passage from server
function requestPassage(passageId, actionMessage) {

    socket.emit("requestPassage", passageId, actionMessage);
}


function openURL(actionMessage) {
    socket.emit("openURL", actionMessage);
}

function functionLink(aId) {
    socket.emit("requestFunction", aId.replace(" ", ""), arguments);
}

//the description contains secret information that is dynamically generated and related to other currrent players
//so it has to be requested first
function requestPlayerDescription(id) {
    socket.emit("requestDescription", id);
}

function playerDescription(description) {
    var div = document.getElementById('passage');
    div.innerHTML = description;
}

//pupulate the room with gamestate data
//happens once upon entering
function createRoom(roomId, roomState) {

    //initialize players as object list
    players = {};

    chatMessage(roomState);

    showChat();
}

//takes care of scrolling
function chatMessage(msg) {


    //messages.push(msg);

    var overflow = true;

    var container = document.getElementById('container');

    var div = document.getElementById('chat');


    $(div).append("<div class='line'>" + msg + "</div>");

    while (overflow == true) {

        //the div deals with overflow with a bar so scroll down on new message
        //div.scrollTop = div.scrollHeight
        if (container.scrollHeight > container.offsetHeight) {
            overflow = true;

            $(".line").first().remove();
        }
        else
            overflow = false;
    }
}

//creates a clickable link of the name
function nameLink(playerId, subClass = "enabled") {
    var player = players[playerId];
    if (subClass == "enabled")
        return "<a class='nameLink " + subClass + " ' href='#' onclick='requestPlayerDescription(\"" + player.id + "\"); return false; '>" + player.nickName + "</a>";
    else
        return "<span class='nameLink " + subClass + "' >" + player.nickName + "</span>";

}


////UI stuff

//remove links, keep the content
function disableNameLinks(nickName) {
    //disable the links in the document
    $(".nameLink:contains(" + nickName + ")").addClass("disabled");
    $(".nameLink:contains(" + nickName + ")").removeClass("enabled");
}

//enable links in case the user comes back
function enableNameLinks(nickName) {
    //disable the links in the document
    $(".nameLink:contains(" + nickName + ")").removeClass("disabled");
    $(".nameLink:contains(" + nickName + ")").addClass("enabled");
}



//when I hit send
function talk(msg) {

    if (AFK) {
        AFK = false;
        if (socket != null)
            socket.emit("focus");
    }

    //non empty string
    if (msg.replace(/\s/g, "") != "") {
        clearInterval(blinkInterval);
        $('#talk-field').attr('placeholder', talkPrompt);
        socket.emit("talk", msg);
    }
}


//called by the talk button in the html
function getTalkInput() {

    var time = new Date().getTime();

    if (time - lastMessage > SETTINGS.ANTI_SPAM) {

        // Selecting the input element and get its value 
        var inputVal = document.getElementById("talk-field").value;
        //sending it to the talk function in sketch
        talk(inputVal);
        document.getElementById("talk-field").value = "";
        //save time
        lastMessage = time;
        longText = "";
        longTextLink = "";
    }
    //prevent page from refreshing (default form behavior)
    return false;
}

function showUsername() {
    gameState = "username";
    var e = document.getElementById("username-form");
    document.getElementById("username-message").innerHTML = TEXT.introText + TEXT.namePrompt;
    if (e != null)
        e.style.display = "block";
}

function hideUsername() {

    var e = document.getElementById("header");
    if (e != null)
        e.style.display = "none";


    e = document.getElementById("username-form");
    if (e != null)
        e.style.display = "none";
}
//called by the continue button in the html
function nameOk() {
    var v = document.getElementById("username-field").value;

    if (v != "") {
        nickName = v;

        //if socket !null the connection has been established ie lurk mode
        if (socket != null) {
            socket.emit("submitName", v);
        }

        //prevent page from refreshing on enter (default form behavior)
        return false;
    }
}


//enable the chat input when it's time
function showPronouns() {
    gameState = "pronouns";
    var e = document.getElementById("pronouns");
    document.getElementById("pronouns-message").innerHTML = TEXT.pronounPrompt;
    if (e != null)
        e.style.display = "block";

}

function hidePronouns() {
    var e = document.getElementById("pronouns");
    if (e != null)
        e.style.display = "none";
}

function pronounOk(pron) {
    pronoun = pron;
    hidePronouns();
    showDescription();
}


//enable the chat input when it's time
function showDescription() {
    gameState = "description";
    var e = document.getElementById("description-form");
    document.getElementById("description-message").innerHTML = TEXT.descriptionPrompt;
    if (e != null)
        e.style.display = "block";

}



function hideDescription() {
    var e = document.getElementById("description-form");
    if (e != null)
        e.style.display = "none";
}

function descriptionOk() {
    gameState = "waiting";
    description = document.getElementById("description-field").value;

    socket.emit("login", nickName, pronoun, description);
    //prevent page from refreshing on enter (default form behavior)
    hideDescription();
    return false;
}

function clearChat() {
    var div = document.getElementById('chat');
    div.innerHTML = "";

}



//enable the chat input when it's time
function showChat() {
    var e = document.getElementById("talk-form");

    if (e != null)
        e.style.display = "block";

    e = document.getElementById("chat");

    if (e != null)
        e.style.display = "block";
}

function hideChat() {
    var e = document.getElementById("talk-form");
    if (e != null)
        e.style.display = "none";

    e = document.getElementById("chat");

    if (e != null)
        e.style.display = "none";
}

//blinky prompt
function blinker() {

    if ($('#talk-field').attr('placeholder')) {
        // get the placeholder text
        $('#talk-field').attr('placeholder', '');
    } else {
        $('#talk-field').attr('placeholder', talkPrompt);
    }

}

var blinkInterval = setInterval(blinker, 1000);


//p5 style alias
function print(s) { console.log(s); }

//disable scroll on phone
function preventBehavior(e) {
    e.preventDefault();
};

document.addEventListener("touchmove", preventBehavior, { passive: false });

// Active
window.addEventListener("focus", function () {
    if (socket != null)
        socket.emit("focus");
});

// Inactive
window.addEventListener("blur", function () {
    if (socket != null)
        socket.emit("blur");
});


// automatically focus on the textbox
document.addEventListener('keypress', focusOnText);

function focusOnText() {
    if (gameState == "game")
        document.getElementById("talk-field").focus();
    else if (gameState == "username")
        document.getElementById("username-field").focus();
    else if (gameState == "description")
        document.getElementById("description-field").focus();
}

function sound(src) {
    this.sound = document.createElement("audio");
    this.sound.src = src;
    this.sound.setAttribute("preload", "auto");
    this.sound.setAttribute("controls", "none");
    this.sound.style.display = "none";
    document.body.appendChild(this.sound);
    this.play = function () {
        this.sound.play();
    }
    this.stop = function () {
        this.sound.pause();
    }
}


///

setup();
