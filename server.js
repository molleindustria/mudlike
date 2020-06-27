//check README.md

//load secret config vars
require("dotenv").config();
const GAME = require("./game");
var fs = require('fs');
var numberConverter = require('number-to-words');


var Parser = require('expr-eval').Parser;

//.env content
/*
ADMINS=username1|pass1,username2|pass2
PORT = 3000
*/

var port = process.env.PORT || 3000;

//if loading twee story file

if (GAME.SETTINGS.STORY_FILE != "" && GAME.SETTINGS.STORY_FILE != null) {
    fs.readFile(GAME.SETTINGS.STORY_FILE, 'utf8', function (err, data) {
        if (err) throw err;
        GAME.PASSAGES = parseTwee(data);
    });
}
else
    console.log("WARNING: NO STORY FILE " + GAME.SETTINGS.STORY_FILE);

//number of emits per second allowed for each player, after that ban the IP.
//over 30 emits in this game means that the client is hacked and the flooding is malicious
//if you change the game logic make sure this limit is still reasonable
var PACKETS_PER_SECONDS = 30;

/*
The client and server version strings MUST be the same!
They can be used to force clients to hard refresh to load the latest client.
If the server gets updated it can be restarted, but if there are active clients (users' open browsers) they could be outdated and create issues.
If the VERSION vars are mismatched they will send all clients in an infinite refresh loop. Make sure you update sketch.js before restarting server.js
*/
var VERSION = "1.0";

//create a web application that uses the express frameworks and socket.io to communicate via http (the web protocol)
var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var Filter = require("bad-words");

//time before disconnecting (forgot the tab open?)
var ACTIVITY_TIMEOUT = 10 * 60 * 1000;
//should be the same as index maxlength="16"
var MAX_NAME_LENGTH = 16;

//cap the overall players 
var MAX_PLAYERS = -1;
//refuse people when a room is full 
var MAX_PLAYERS_PER_ROOM = 200;

//views since the server started counts relogs
var visits = 0;

/*
A very rudimentary admin system. 
Reserved usernames and admin pass are stored in .env file as
ADMINS=username1|pass1,username2|pass2

Admin logs in as username|password in the normal field
If combo user|password is correct (case insensitive) mark the player as admin on the server side
The "username|password" remains stored on the client as var nickName 
and it's never shared to other clients, unlike player.nickName

admins can call admin commands from the chat like /kick nickName
*/
var admins = [];
if (process.env.ADMINS != null)
    admins = process.env.ADMINS.split(",");

//We want the server to keep track of the whole game state
//in this case the game state are the attributes of each player
var gameState = {
    players: {},
}

//save the server startup time and send it in case the clients need to syncronize something
var START_TIME = Date.now();

//a collection of banned IPs
//not permanent, it lasts until the server restarts
var banned = [];

//when a client connects serve the static files in the public directory ie public/index.html
app.use(express.static("public"));


//when a client connects the socket is established and I set up all the functions listening for events
io.on("connection", function (socket) {

    //this bit (middleware?) catches all incoming packets
    //I use to make my own lil rate limiter without unleashing 344525 dependencies
    //a rate limiter prevents malicious flooding from a hacked client
    socket.use((packet, next) => {
        if (gameState.players[socket.id] != null) {
            var p = gameState.players[socket.id];
            p.floodCount++;
            if (p.floodCount > PACKETS_PER_SECONDS) {
                console.log(socket.id + " is flooding! BAN BAN BAN");


                if (p.IP != "") {
                    //comment this if you don't want to ban the IP
                    banned.push(p.IP);
                    socket.emit("errorMessage", "Flooding attempt! You are banned");
                    socket.disconnect();
                }
            }
        }
        next();
    });


    //this appears in the server terminal
    console.log("A user connected");

    //send server data to client
    socket.emit("serverWelcome", VERSION, START_TIME, GAME.SETTINGS, GAME.TEXT);


    //check if the IP is banned and if we reached the maximum number of players on the server
    socket.on("join", function () {


        //if running locally it's not gonna work
        var IP = "";
        //oh look at this beautiful socket.io to get an goddamn ip address
        if (socket.handshake.headers != null)
            if (socket.handshake.headers["x-forwarded-for"] != null) {
                IP = socket.handshake.headers["x-forwarded-for"].split(",")[0];
            }


        var serverPlayers = Object.keys(io.sockets.connected).length + 1;
        var isBanned = false;

        //prevent banned IPs from joining
        if (IP != "") {
            var index = banned.indexOf(IP);
            //found
            if (index > -1) {
                isBanned = true;
            }

        }

        if (isBanned) {
            console.log("ATTENTION: banned " + IP + " is trying to log in again");
            socket.emit("errorMessage", "You have been banned");
            socket.disconnect();
        }
        else if (serverPlayers > MAX_PLAYERS && MAX_PLAYERS > 0) {
            console.log("ATTENTION: reached maximum number of players");
            socket.emit("errorMessage", "Sorry, the server is full");
            socket.disconnect();
        }
        //prevent a hacked client from duplicating players
        else if (gameState.players[socket.id] != null) {
            console.log("ATTENTION: there is already a player associated to the socket " + socket.id);
            socket.disconnect();
        }

    });


    socket.on("submitName", function (nickName) {
        try {
            //if client hacked truncate
            if (nickName.length > MAX_NAME_LENGTH)
                nickName = nickName.substring(0, MAX_NAME_LENGTH);

            //if running locally it's not gonna work
            var IP = "";
            //oh look at this beautiful socket.io to get an goddamn ip address
            if (socket.handshake.headers != null)
                if (socket.handshake.headers["x-forwarded-for"] != null) {
                    IP = socket.handshake.headers["x-forwarded-for"].split(",")[0];
                }

            var val = 1;

            val = validateName(nickName);

            socket.emit("nameResponse", val);
        }
        catch (e) {
            console.log("Error on submitName from " + socket.id);
            console.error(e);
        }

    });


    socket.on("login", function (nickName, pronoun, description) {
        try {

            //if running locally it's not gonna work
            var IP = "";
            //oh look at this beautiful socket.io to get an goddamn ip address
            if (socket.handshake.headers != null)
                if (socket.handshake.headers["x-forwarded-for"] != null) {
                    IP = socket.handshake.headers["x-forwarded-for"].split(",")[0];
                }

            //validate again in case of hacks
            var val = validateName(nickName);

            if (val != 0 && val != 3) {
                //if there is an | strip the after so the password remains in the admin client
                var combo = nickName.split("|");
                nickName = combo[0];



                if (val == 2)
                    console.log(nickName + " joins as admin");
                else
                    print(nickName + " logs in");

                var firstPassage = GAME.SETTINGS.firstPassage;
                var firstRoom = "";


                if (GAME.PASSAGES[firstPassage] != null) {
                    firstPassage = firstPassage;
                }
                else if (GAME.PASSAGES["Start"] != null) {
                    firstPassage = "Start";
                }
                else if (GAME.PASSAGES["start"] != null) {
                    firstPassage = "start";
                }
                else {
                    print("WARNING: No VALID first passage specified, going with the first: " + Object.keys(GAME.PASSAGES)[0]);
                    firstPassage = Object.keys(GAME.PASSAGES)[0];
                }

                if (GAME.PASSAGES[firstPassage].room != null)
                    firstRoom = GAME.PASSAGES[firstPassage].room;

                print("First " + firstPassage);
                //create the player object 
                var p = {};

                p.id = socket.id;
                p.nickName = filter.clean(nickName);
                p.room = firstRoom;
                p.privateChannel = "";
                p.privateChannelName = "";

                p.passage = firstPassage;
                p.previousPassage = "";
                p.recentAction = "";

                p.pronoun = pronoun;
                p.description = description;

                p.randomSeed = randomInt(0, 100);

                //the server keeps track of more variables that are not sent to the client
                p.lastMessage = 0;
                p.admin = (val == 2) ? true : false;
                p.spam = 0;
                p.lastActivity = new Date().getTime();
                p.muted = false;
                p.IP = IP;
                p.floodCount = 0;

                p.afk = false;

                //game custom initialization
                if (GAME.initPlayer != null)
                    GAME.initPlayer(p);

                //save the same information in my game state
                gameState.players[socket.id] = p;

                //send the clients only the useful stuff
                var newPlayer = getPlayer(socket.id);

                //if passage has a room associated send the user there
                if (firstRoom != "") {
                    socket.join(newPlayer.room, function () { });

                    //send all OTHER players information about the new player
                    socket.broadcast.to(newPlayer.room).emit('playerJoined', newPlayer);

                    var roomPlayers = getRoomPlayers(newPlayer.room);
                    //send the player the state of the room, current players and such
                    socket.emit("joinedRoom", newPlayer.room, roomPlayers);

                }

                //parse text
                var html = parseText(GAME.PASSAGES[firstPassage].text, p);
                var closeChat = (GAME.PASSAGES[firstPassage].room == "" || GAME.PASSAGES[firstPassage].room == null);


                if (GAME.passageFilter != null)
                    html = GAME.passageFilter(html, newPlayer, firstPassage);

                socket.emit("changePassage", html, closeChat);

                //socket.emit("changedPassage", GAME.PASSAGES[firstPassage]);


                visits++;

                console.log("There are now " + Object.keys(gameState.players).length + " players on this server. Total visits " + visits);
            }
            else
                print("Warning: " + socket.id + " attempts login with a hacked client");
        }
        catch (e) {
            console.log("Error on submitName from " + socket.id);
            console.error(e);
        }

    });

    //textfield
    //language based 

    socket.on("requestPassage", function (pId, actionMessage) {
        try {

            if (GAME.PASSAGES[pId] == null) {
                print("Error: there is no passage named " + pId);
            }
            else {
                //moving it to a function since it can happen automatically
                changePassage(pId, actionMessage, socket);

            }
        }
        catch (e) {
            console.log("Error on requestPassage from " + socket.id);
            console.error(e);
        }
    });

    //no passage is open just
    socket.on("openURL", function (actionMessage) {
        try {

            var player = gameState.players[socket.id];
            var room = gameState.players[socket.id].room;
            var passageId = gameState.players[socket.id].passage;


            if (actionMessage != "" && room != null) {

                //quick check making sure message is not hacked
                if (GAME.PASSAGES[passageId].text.indexOf(actionMessage) != -1) {

                    var msg = adapt(actionMessage, player, false);
                    socket.broadcast.to(room).emit("actionMessage", msg);
                }
            }
        }
        catch (e) {
            console.log("Error on openURL from " + socket.id);
            console.error(e);
        }
    });

    //a custom description is served
    socket.on("requestDescription", function (playerId) {
        try {
            var target = gameState.players[playerId];
            var requester = gameState.players[socket.id];

            gameState.players[socket.id].lastActivity = new Date().getTime();

            if (target == null || target.room != requester.room) {
                //inquiring about a person who is not here anymore?

            }
            else {
                //add a back
                var linkBack = "<a class='passageLink' href='#' onclick='requestPassage(\"" + requester.passage + "\"); return false; '>" + GAME.TEXT.descriptionBack + " " + adapt("them", target, target.pronoun) + "</a>";

                var afkText = "";
                if (target.afk)
                    afkText = adapt(GAME.TEXT.AFK, [target]);

                var description = GAME.TEXT.descriptionIntro + " " + target.nickName + ".<br/>" + target.description + afkText + "<br/>" + linkBack;

                if (GAME.descriptionFilter != null)
                    description = GAME.descriptionFilter(description, target, requester);

                //set a private channel if in description without leaving the public one
                requester.privateChannel = playerId;
                requester.privateChannelName = target.nickName;


                socket.emit("descriptionReceived", description, target.nickName);

                socket.emit("changeTitle", target.nickName);

                var look = adapt(GAME.TEXT.lookDescription, [requester]);

                //avoid glance spamming
                if (requester.recentAction != look) {
                    io.sockets.sockets[target.id].emit("actionMessage", look);
                    requester.recentAction = look;
                }
            }
        }
        catch (e) {
            console.log("Error on requestDescription from " + socket.id);
            console.error(e);
        }

    });

    //this looks for a function in GAME
    socket.on("requestFunction", function (aId, arguments) {
        try {
            if (GAME[aId] != null) {
                GAME[aId](socket.id, arguments);
            }
            else {
                print("Error: there is no function called " + aId + " in game.js");
            }
        }
        catch (e) {
            console.log("Error on requestFunction from " + socket.id);
            console.error(e);
        }
    });


    //when a client disconnects I have to delete its player object
    //or I would end up with ghost players
    socket.on("disconnect", function () {
        try {

            console.log("Player disconnected " + socket.id);

            var disconnectingPlayer = gameState.players[socket.id];

            //player is null when exits before loggin in
            if (disconnectingPlayer != null) {
                //communicates to all
                io.sockets.emit("playerLeft", socket.id, true);

                //communicates to the room
                if (disconnectingPlayer.room != "") {
                    var msg = adapt(GAME.TEXT.disconnect, [disconnectingPlayer], true);
                    socket.broadcast.to(disconnectingPlayer.room).emit("actionMessage", msg);
                }
                //send the disconnect
                //delete the player object
                disconnectingPlayer = null;
                delete gameState.players[socket.id];

                //gameState.players[socket.id] = null;
                console.log("There are now " + Object.keys(gameState.players).length + " players on this server");
            }
        }
        catch (e) {
            console.log("Error on disconnect from" + socket.id);
            console.error(e);
        }
    });

    //when I receive a talk send it to everybody in the room
    socket.on("talk", function (message) {
        try {

            var time = new Date().getTime();
            var room = gameState.players[socket.id].room;

            //block if spamming

            if (room != "" && time - gameState.players[socket.id].lastMessage > GAME.SETTINGS.ANTI_SPAM && !gameState.players[socket.id].muted) {

                //Admin commands can be typed as messages
                //is this an admin
                if (gameState.players[socket.id].admin && message.charAt(0) == "/") {
                    console.log("Admin " + gameState.players[socket.id].nickName + " attempts command " + message);
                    adminCommand(socket, message);
                }
                else {
                    //normal talk stuff

                    //aphostrophe
                    message = message.replace("’", "'");

                    //replace unmapped characters
                    message = message.replace(/[^A-Za-z0-9_!$%*()@./#&+-|]*$/g, "");

                    //replace html tags
                    message = message.replace(/(<([^>]+)>)/ig, "");

                    //remove leading and trailing whitespaces
                    message = message.replace(/^\s+|\s+$/g, "");
                    //filter bad words
                    message = filter.clean(message);
                    //advanced cleaning

                    //f u c k
                    var test = message.replace(/\s/g, "");
                    //fffffuuuuck
                    var test2 = message.replace(/(.)(?=.*\1)/g, "");
                    //f*u*c*k
                    var test3 = message.replace(/\W/g, "");
                    //spaces
                    var test4 = message.replace(/\s/g, "");

                    if (filter.isProfane(test) || filter.isProfane(test2) || filter.isProfane(test3) || test4 == "") {
                        console.log(socket.id + " is problematic");
                    }
                    else {

                        if (message != "") {

                            var player = gameState.players[socket.id];

                            if (GAME.talkFilter != null) {
                                message = GAME.talkFilter(message, player);
                            }




                            if (player.privateChannel == "" || player.privateChannel == null) {
                                //don't link yourself
                                var htmlMsgMe = "<span class='nameLink me' >" + player.nickName + "</span>: " + message;
                                //for others
                                var htmlMsg = nameLink(player.id) + ": " + message;

                                //send to everybody else
                                socket.broadcast.to(room).emit("playerTalked", htmlMsg);
                                //send to the talker
                                socket.emit("playerTalked", htmlMsgMe);

                                //if talking in an empty room
                                var rp = getRoomPlayers(room, player.id);

                                if (rp.length == 0) {
                                    var msg = randomIn(GAME.TEXT.talkingAlone);
                                    socket.emit("actionMessage", msg);
                                }
                            }
                            else {
                                //private talk

                                //don't link yourself
                                var htmlMsgMe = "<span class='nameLink me' >" + player.nickName + "</span>: " + "<span class='whisper'>(whispering) " + message + "</span>";
                                //for others
                                var htmlMsg = nameLink(player.id) + ": " + "<span class='whisper'>(whispering to you) " + message + "</span>";

                                if (io.sockets.sockets[player.privateChannel] != null) {

                                    io.sockets.sockets[player.privateChannel].emit("playerTalked", htmlMsg);

                                    //send to the talker
                                    socket.emit("playerTalked", htmlMsgMe);
                                }
                                else {
                                    socket.emit("actionMessage", player.privateChannelName + " " + GAME.TEXT.user_left);

                                }
                            }



                        }
                    }
                }

                //update the last message time
                if (gameState.players[socket.id] != null) {
                    gameState.players[socket.id].lastMessage = time;
                    gameState.players[socket.id].lastActivity = time;
                }
            }
        } catch (e) {
            console.log("Error on talk from" + socket.id);
            console.error(e);
        }

    });




    //when I receive a user name validate it
    socket.on("sendName", function (nn) {
        try {

            var res = validateName(nn);

            //send the code 0 no - 1 ok - 2 admin
            socket.emit("nameValidation", res);
        } catch (e) {
            console.log("Error on sendName from " + socket.id);
            console.error(e);
        }
    });


    //user afk
    socket.on("focus", function () {
        try {
            var p = gameState.players[socket.id];


            if (p != null) {
                p.afk = false;
                if (p.room != null)
                    io.to(p.room).emit("playerFocused", p.nickName);
            }
        } catch (e) {
            console.log("Error on playerFocused from " + socket.id);
            console.error(e);
        }
    });

    socket.on("blur", function () {
        try {
            var p = gameState.players[socket.id];

            if (p != null) {
                p.afk = true;
                if (p.room != null)
                    io.to(p.room).emit("playerBlurred", p.nickName)
            }
        } catch (e) {
            console.log("Error on playerBlurred from " + socket.id);
            console.error(e);
        }
    });


    //generic action listener, looks for a function with that id in the mod 
    socket.on("action", function (aId) {
        try {
            io.to(obj.room).emit("playerActed", socket.id, aId);
        } catch (e) {
            console.log("Error on playerActed from " + socket.id);
            console.error(e);
        }
    });

});


//rate limiting - clears the flood count
setInterval(function () {
    for (var id in gameState.players) {
        if (gameState.players.hasOwnProperty(id)) {
            gameState.players[id].floodCount = 0;
        }
    }
}, 1000);

//custom every second function for
setInterval(function () {
    if (GAME.everySecond != null)
        GAME.everySecond();
}, 1000);



function changePassage(pId, actionMessage, socket) {

    ////////////////////////////turn this into a function

    var movingPlayer = gameState.players[socket.id];
    var fromPassage = movingPlayer.previousPassage = movingPlayer.passage;
    movingPlayer.passage = pId;

    gameState.players[socket.id].lastActivity = new Date().getTime();

    //change room
    var toId = GAME.PASSAGES[pId].room || "";
    var fromId = gameState.players[socket.id].room || "";

    //update the server room
    gameState.players[socket.id].room = toId;

    //parse text
    var html = parseText(GAME.PASSAGES[pId].text, gameState.players[socket.id]);

    var closeChat = (GAME.PASSAGES[pId].room == "" || GAME.PASSAGES[pId].room == null);

    if (GAME.passageFilter != null)
        html = GAME.passageFilter(html, movingPlayer, pId);

    socket.emit("changePassage", html, closeChat);

    if (GAME.ROOM_TITLES[toId] != null)
        socket.emit("changeTitle", GAME.ROOM_TITLES[toId]);
    else
        socket.emit("changeTitle", "");


    //no more on a private channel if any
    movingPlayer.privateChannel = "";
    movingPlayer.privateChannelName = "";


    if (actionMessage != "" && (fromId != "" || toId != "")) {

        //quick check making sure message is not hacked
        if (GAME.PASSAGES[fromPassage].text.indexOf(actionMessage) != -1) {

            var noLink = (toId != fromId);
            var msg = adapt(actionMessage, movingPlayer, noLink);

            //send it to the room(s) involved if any
            if (fromId != "")
                socket.broadcast.to(fromId).emit("actionMessage", msg);
            if (toId != fromId && toId != "")
                socket.broadcast.to(toId).emit("actionMessage", msg);
        }
    }


    //if the passage has a room associated and the room is different than the current one join
    if (toId != fromId) {

        console.log("Player " + socket.id + " moved from " + fromId + " to " + toId);

        //if leaving a room broadcast to the players in the room
        if (fromId != "") {
            socket.leave(fromId);

            //broadcast the change to everybody in the current room
            io.to(fromId).emit("playerLeft", socket.id, false);

        }

        //if joining a room broadcast the changes to the current player and send the state to the moving player
        if (toId != "" && toId != fromId) {
            socket.join(toId);

            //send all OTHER players information about the new player
            //upon creation destination and position are the same 
            socket.broadcast.to(toId).emit('playerJoined', movingPlayer);

            //retrieving the state of the current room
            var roomPlayers = getRoomPlayers(toId);
            //send ONLY the new player the state of the room, current players and such
            socket.emit("joinedRoom", toId, roomPlayers);

        }
    }//changing rooms
}

function parseText(txt, player) {
    //1-
    //parse the "links" between rooms, it's a twine-like syntax that gets converted into a link that calls a changePassage function
    var link = txt.match(/\[\[([\s\S]*?)\]\]/);
    var failSafe = 0;

    while (link != null && failSafe < 1000) {
        //found link
        if (link != null) {
            var l = link[1].split("|");

            var linkText = l[0];
            var actionMessage = "";
            //parse the actionMessage associated to the link
            var actionMessageArr = l[0].split(">>");

            if (actionMessageArr.length > 1) {
                actionMessage = actionMessageArr[1];
                //strip action from link text
                linkText = actionMessageArr[0];

                //horrible trick to prevent replacement in inner links
                actionMessage = actionMessage.replace("$", "@@");
            }

            if (l.length == 1) {
                //passage and link text are the same
                var passage = linkText.replace(/^\s+|\s+$/g, "");
                var htmlLink = "<a class='passageLink' href='#' onclick='requestPassage(\"" + + "\", \"" + actionMessage + "\"); return false; '>" + linkText + "</a>";
                txt = txt.replace(link[0], htmlLink);
            }
            else if (l.length == 2) {
                //passage and link text are not the same
                //whitespaces
                var passage = l[1].replace(/^\s+|\s+$/g, "");

                //is it a link
                if (passage.match(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig)) {

                    var urlString = passage;

                    var htmlLink = "<a class=\"externalLink\" target=\"_blank\" href=\"" + urlString + "\" onclick='openURL(\"" + actionMessage + "\");'>" + linkText + "</a>";

                    txt = txt.replace(link[0], htmlLink);
                }
                else {
                    var htmlLink = "<a class='passageLink' href='#' onclick='requestPassage(\"" + passage + "\", \"" + actionMessage + "\"); return false; '>" + linkText + "</a>";
                    txt = txt.replace(link[0], htmlLink);
                }
            }
            else {
                print("Error: Link malformed " + link[0]);
                failSafe = 1000;
            }

        }
        failSafe++;
        if (failSafe > 100) {
            print("Error: infinite parsing loop at " + link);
        }
        //keep replacing until there are no matches
        link = txt.match(/\[\[([\s\S]*?)\]\]/);
    }

    //2-
    //parse the macros to narrativize the current dynamic state (if any)
    var macro = txt.match(/{([\s\S]*?)}/);
    failSafe = 0;

    while (macro != null && failSafe < 1000) {
        failSafe++;

        //found link
        if (macro != null) {
            var m = macro[1].split("|");
            var html = "";

            //remove whitespaces
            m[0] = m[0].replace(/^\s+|\s+$/g, "");


            switch (m[0]) {
                //get all players on a particular state and narrativize them
                case "passagePlayers":
                    if (GAME.PASSAGES[m[1]] != null) {


                        //syntax
                        //{passagePlayers|passageId|Output if no player found|Output if one player found|Output if multiple found}
                        if (m.length == 5) {
                            var playersInPassage = getPlayersByPassage(m[1], player.id);

                            //names are linked only if we are talking about the same room
                            var noLinks = true;

                            //there is a room associated
                            if (GAME.PASSAGES[m[1]] != null) {
                                if (GAME.PASSAGES[m[1]].room != null)
                                    noLinks = (GAME.PASSAGES[m[1]].room != player.room);
                            }

                            //print("Found " + playersInState.length + " doing " + m[1]);
                            if (playersInPassage.length == 0)
                                html = m[2]; //nobody is here
                            if (playersInPassage.length == 1)
                                html = adapt(m[3], playersInPassage, noLinks);
                            if (playersInPassage.length > 1)
                                html = adapt(m[4], playersInPassage, noLinks);

                        }
                        else {
                            print("Error in macro: " + macro[0]);
                        }
                    } else
                        print("Warning: no passage called " + m[1]);

                    break;


                //estimates the number of people in another room and narrativizes it, mapping the number to the available options
                //{roomPlayers|roomId|output for empty|output for one|output for more than one}
                case "roomPlayers":

                    if (m.length == 5) {

                        //names are linked only if we are talking about the same room
                        var noLinks = (player.room != m[1]);

                        var roomPlayers = getRoomPlayers(m[1], player.id);

                        ///print("Found " + player.room + " vs " + m[1]);

                        if (roomPlayers.length == 0)
                            html = m[2]; //nobody is here
                        else if (roomPlayers.length == 1)
                            html = adapt(m[3], roomPlayers, noLinks); //another person is here
                        else
                            html = adapt(m[4], roomPlayers, noLinks);

                    }
                    else {
                        print("Error in macro: " + macro[0]);
                    }
                    break;

                case "back":
                    var linkText = GAME.TEXT.goBack;

                    if (m.length >= 2) {
                        linkText = m[1];
                    }

                    html = "<a class='passageLink' href='#' onclick='requestPassage(\"" + player.previousPassage + "\"); return false; '>" + linkText + "</a>";
                    break;


                //outputs string if the expression is true, variables need to be player properties or prefixed with GLOBAL_ if global
                //{playerCondition|expression|output if true|output if false (optional)}
                //{playerCondition | GLOBAL_test+example>10 | Yes it is greater than 10| no it isn't bigger than 10}
                case "playerCondition":
                    if (m.length >= 3) {

                        //get the expression
                        var expr = Parser.parse(m[1]);

                        //get the variable names referenced in it
                        var variables = expr.variables();

                        //ugly ass way to read global variables
                        //save them into an object
                        var prop = {}
                        //get the corresponding properties of the player
                        for (var i = 0; i < variables.length; i++) {

                            if (variables[i].substr(0, "GLOBAL_".length) == "GLOBAL_") {
                                var name = variables[i].substr("GLOBAL_".length);
                                //fuck yeah javascript create a property in player why not
                                player[variables[i]] = GAME.GLOBAL[name];
                            }
                        }

                        try {
                            if (expr.evaluate(player))
                                html = m[2];
                            else if (m[3] != null)
                                html = m[3];
                            else
                                html = "";
                        }
                        catch (e) {
                            print("Syntax error in expression " + m[1]);
                            html = ""
                        }
                    }
                    else
                        print("Error on playerCondition " + m.join("|") + " wrong number of parameters");

                    break;


                //performs an expression using player variables. Returns nothing
                //It can change player variables but not global ones, it can read global variables with global_ prefix on variable name
                //{playerExpression|example=GLOBAL_test+100}
                case "playerExpression":
                    if (m.length == 2) {

                        //get the expression
                        var expr = Parser.parse(m[1]);
                        //get the variable names referenced in it
                        var variables = expr.variables();

                        //ugly ass way to read global variables
                        //save them into an object
                        var prop = {}
                        //get the corresponding properties of the player
                        for (var i = 0; i < variables.length; i++) {

                            if (variables[i].substr(0, "GLOBAL_".length) == "GLOBAL_") {
                                var name = variables[i].substr("GLOBAL_".length);
                                //fuck yeah javascript create a property in player why not
                                player[variables[i]] = GAME.GLOBAL[name];
                            }
                        }


                        try {
                            html = expr.evaluate(player);
                            html = "";
                        }
                        catch (e) {
                            print("Syntax error in expression " + m[1]);
                            html = ""
                        }
                    }
                    else
                        print("Error on playerExpression " + m.join("|") + " wrong number of parameters");

                    break;

                //outputs string if the expression is true, variables need to be GLOBAL properties
                //{playerCondition|expression|output if true|output if false (optional)}
                case "globalCondition":
                    if (m.length >= 3) {

                        //get the expression
                        var expr = Parser.parse(m[1]);

                        try {
                            if (expr.evaluate(GAME.GLOBAL))
                                html = m[2];
                            else if (m[3] != null)
                                html = m[3];
                            else
                                html = "";
                        }
                        catch (e) {
                            print("Syntax error in expression " + m[1]);
                            html = ""
                        }
                    }
                    else
                        print("Error on globalCondition " + m.join("|") + " wrong number of parameters");

                    break;

                //performs an expression using global variables
                //{globalExpression|example=example+100}
                case "globalExpression":
                    if (m.length == 2) {

                        //get the expression
                        var expr = Parser.parse(m[1]);


                        try {
                            html = expr.evaluate(GAME.GLOBAL);
                            html = "";
                        }
                        catch (e) {
                            print("Syntax error in expression " + m[1]);
                            html = ""
                        }
                    }
                    else
                        print("Error on globalExpression " + m.join("|") + " wrong number of parameters");

                    break;

                //output a variable
                //{globalVariable|varName}
                case "globalVariable":
                    if (m.length == 2) {
                        if (GAME.GLOBAL[m[1]] != null)
                            html = GAME.GLOBAL[m[1]];
                        else
                            html = "";
                    }
                    else
                        print("Error on globalVariable " + m.join("|") + " wrong number of parameters");
                    break;


                //output a variable
                //{playerVariable|varName}
                case "playerVariable":
                    if (m.length == 2) {
                        if (player[m[1]] != null)
                            html = player[m[1]];
                        else
                            html = "";
                    }
                    else
                        print("Error on playerVariable " + m.join("|") + " wrong number of parameters");
                    break;

                case "playerVariableWords":
                    if (m.length == 2) {
                        if (player[m[1]] != null)
                            html = numberConverter.toWords(player[m[1]]);
                        else
                            html = "";
                    }
                    else
                        print("Error on playerVariableWords " + m.join("|") + " wrong number of parameters");
                    break;

                //replace with a reusable text from GAME.TEXT
                //{snippet|
                case "snippet":

                    if (GAME.TEXT[m[1]] != null) {
                        html = GAME.TEXT[m[1]];
                    }
                    else {
                        print("Error on snippet macro " + m.join("|") + " doesn't exist");
                    }
                    break;

                //replace with a passage (parsed etc)
                //{snippet|
                case "passage":

                    if (GAME.PASSAGES[m[1]] != null) {
                        html = parseText(GAME.PASSAGES[m[1]].text, player);
                    }
                    else {
                        print("Error on passage macro " + m.join("|") + " doesn't exist");
                    }
                    break;

                //macro to add comments to the story, they are stripped and ignored when served
                case "comment":

                    html = "";

                    break;

                //placeholder for generic function link called by client
                //{function|linkText|functionName|argument}
                case "function":

                    try {
                        if (m[1] != null && m[2] != null) {

                            var linkText = m[1];

                            var arg = "";
                            if (m[3] != null)
                                arg = m[3];

                            html = "<a class='functionLink' href='#' onclick='functionLink(\"" + m[2] + "\", \"" + arg + "\"); return false; '> " + linkText + "</a>";
                        }
                    }
                    catch (e) {
                        print("Error on function macro " + m.join("|"));
                    }
                    break;


                //server side generic script called with eval whenever a client requests the passage
                case "script":

                    try {
                        if (m[1] != null) {
                            html = eval(m[1]);
                        }
                    }
                    catch (e) {
                        print("Error on script macro " + m.join("|"));
                    }
                    break;

                default:

                    if (GAME.MACROS[m[0]] != null) {
                        //call it!
                        html = GAME.MACROS[m[0]](m, player);

                    }
                    else {
                        print("Warning: macro " + m[0] + " doesn't exist in neither server.js nor game.js")
                    }
                    break;
            }

            var replaceText = macro[0];

            //trim whitespaces
            txt = txt.trim();


            //for legibility macros may be typed with a linebreaks so get rid of the ones immediately preceding and following a macro
            var ind = txt.indexOf(replaceText);
            if (ind > 0) {
                var c = txt.charAt(ind - 1);
                if (c == "\n" || c == "\r") {
                    txt = txt.slice(0, ind - 1) + txt.slice(ind);
                }
            }


            /*
            var ind = txt.indexOf(replaceText) + replaceText.length;
            if (ind < txt.length - 1) {
                var c = txt.charAt(ind);
                if (c == "\n" || c == "\r" || c == " ") {
                    txt = txt.slice(0, ind) + txt.slice(ind);
                }
            }*/


            txt = txt.replace(macro[0], html);
        }//macro non null
        //keep replacing until there are no matches
        macro = txt.match(/{([\s\S]*?)}/);

    }

    //restore the innerlink variable markers
    txt = txt.replace(/@@/g, "$");
    //print(txt);

    //fix the punctuation
    txt = txt.replace(/(\.{3})/g, "…");
    txt = txt.replace(/,(?=[^\s])/g, ", ");
    txt = txt.replace(/\.(?=[^\s])/g, ". ");
    txt = txt.replace(/\s\./g, ".");
    txt = txt.replace(/\s,/g, ",");
    txt = txt.replace(/;(?=[^\s])/g, "; ");
    txt = txt.replace(/:(?=[^\s])/g, ": ");
    //add line breaks
    //txt = txt.replace(/\n\n/g, "");

    txt = txt.replace(/\n/g, "<br/>");

    return "<div class='passageBody'>" + txt + "</div>";

}

function randomIn(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function validateName(nn) {

    var admin = false;
    var duplicate = false;
    var reserved = false;

    //check if the nickname is a name + password combo
    var combo = nn.split("|");

    //it may be
    if (combo.length > 1) {
        var n = combo[0];
        var p = combo[1];

        for (var i = 0; i < admins.length; i++) {
            if (admins[i].toUpperCase() == nn.toUpperCase()) {
                //it is an admin name! check if the password is correct, case insensitive 
                var envCombo = admins[i].split("|");

                if (p == envCombo[1])
                    admin = true;
            }
        }
        //if there is an | just strip the after
        nn = n;
    }

    //if not admin check if the nickname is reserved (case insensitive)
    if (!admin) {
        for (var i = 0; i < admins.length; i++) {
            var combo = admins[i].split("|");
            if (combo[0].toUpperCase() == nn.toUpperCase()) {
                //it is! kill it. Yes, it should be done at login and communicated 
                //but hey I don't have to be nice to users who steal my name
                reserved = true;
            }
        }
    }

    var id = idByName(nn);
    if (id != null) {
        duplicate = true;
        console.log("There is already a player named " + nn);
    }

    //i hate this double negative logic but I hate learning regex more
    var res = nn.match(/^([a-zA-Z0-9 !@#$%&*(),._-]+)$/);


    if (res == null)
        return 3
    else if (duplicate || reserved)
        return 0
    else if (admin) {
        console.log(nn + " logging as admin");
        return 2
    }
    else
        return 1

}

function getRoomPlayers(roomId, excludeId) {
    var roomPlayers = [];

    //create a subset of players currently in this room 
    for (var id in gameState.players) {
        if (gameState.players[id].room == roomId && id != excludeId) {
            //console.log(gameState.players[id].nickName + " is in the room");
            roomPlayers.push(getPlayer(id));
        }
    }

    return roomPlayers;
}

function getPlayersByPassage(passageId, excludeId) {

    var targetPlayers = [];

    //print("Get players for state " + state + " excluding " + excludeId);

    //create a subset of players currently in this room 
    for (var id in gameState.players) {
        if (id != excludeId && gameState.players[id].passage == passageId) {
            targetPlayers.push(getPlayer(id));
        }
    }

    return targetPlayers;
}



//creates a clickable link of the name
function nameLink(id, disabled) {
    player = gameState.players[id];

    if (player != null) {
        var d = (disabled) ? "disabled" : "enabled";
        return "<a class='nameLink " + d + "' href='#' onclick='requestPlayerDescription(\"" + player.id + "\"); return false; '>" + player.nickName + "</a>";
    }
    else return ""
}

//replace parts of the text accoding to players' variables
function adapt(txt, players, noLink = false) {

    //fuck yeah javascript
    if (players.length == null)
        players = [players];

    var pronounId = "theyPlural";
    var adapted = txt;

    //if multiple people are the subject make a list, leave pronoun plural
    if (players.length > 1) {
        var list = "";

        for (var i = 0; i < players.length; i++) {
            list += nameLink(players[i].id, noLink);
            if (i == players.length - 2)
                list += " and ";
            else if (i < players.length - 2)
                list += ", ";
        }

        adapted = txt.replace(/[$]list/g, list);

    }
    else if (players.length == 1) {

        adapted = txt.replace(/[$]name/g, nameLink(players[0].id, noLink));

        pronounId = players[0].pronoun;
    }

    adapted = adaptPronoun(adapted, pronounId)

    return adapted;
}

function adaptPronoun(text, pronId) {
    var pronouns = GAME.PRONOUNS[pronId];

    //adaptPronoun()

    //replacement:
    //they: ["they", "them", "their", "theirs", "themself", "is", "are", "do", "does"],

    //not super elegant but
    text = text.replace(/[$]They/g, pronouns[0]);
    text = text.replace(/[$]they/g, pronouns[0].toLowerCase());

    text = text.replace(/[$]Them/g, pronouns[1]);
    text = text.replace(/[$]them/g, pronouns[1].toLowerCase());

    text = text.replace(/[$]Their/g, pronouns[2]);
    text = text.replace(/[$]their/g, pronouns[2].toLowerCase());

    text = text.replace(/[$]Theirs/g, pronouns[3]);
    text = text.replace(/[$]theirs/g, pronouns[3].toLowerCase());

    text = text.replace(/[$]Themself/g, pronouns[4]);
    text = text.replace(/[$]themself/g, pronouns[4].toLowerCase());

    text = text.replace(/[$]Is/g, pronouns[5]);
    text = text.replace(/[$]is/g, pronouns[5].toLowerCase());

    text = text.replace(/[$]Are/g, pronouns[6]);
    text = text.replace(/[$]are/g, pronouns[6].toLowerCase());

    text = text.replace(/[$]Do/g, pronouns[7]);
    text = text.replace(/[$]do/g, pronouns[7].toLowerCase());

    text = text.replace(/[$]Does/g, pronouns[8]);
    text = text.replace(/[$]does/g, pronouns[8].toLowerCase());

    return text;

}

//convoluted but I don't want to send unnecessary or secret information
//so i create another object with a subset of the properties
function getPlayer(id) {
    var p = gameState.players[id];

    if (p != null) {
        //info about players in the room
        return {
            id: p.id,
            nickName: p.nickName,
            room: p.room,
            passage: p.passage,
            pronoun: p.pronoun,
            description: p.description
        };
    }
    else
        return null;
}


//parse a potential admin command
function adminCommand(adminSocket, str) {
    try {
        //remove /
        str = str.substr(1);
        var cmd = str.split(" ");
        switch (cmd[0]) {
            case "kick":
                var s = socketByName(cmd[1]);
                if (s != null) {
                    //shadow disconnect
                    s.disconnect();
                    delete gameState.players[s.id];
                }
                else {
                    //popup to admin
                    adminSocket.emit("popup", "I can't find a user named " + cmd[1]);
                }
                break;

            case "mute":
                var s = idByName(cmd[1]);
                if (s != null) {
                    gameState.players[s].muted = true;
                }
                else {
                    //popup to admin
                    adminSocket.emit("popup", "I can't find a user named " + cmd[1]);
                }
                break;

            case "unmute":
                var s = idByName(cmd[1]);
                if (s != null) {
                    gameState.players[s].muted = false;
                }
                else {
                    //popup to admin
                    adminSocket.emit("popup", "I can't find a user named " + cmd[1]);
                }
                break;

            //trigger a direct popup
            case "popup":

                var s = socketByName(cmd[1]);
                if (s != null) {
                    //take the rest as string
                    cmd.shift();
                    cmd.shift();
                    var msg = cmd.join(" ");
                    s.emit("popup", msg);
                }
                else {
                    //popup to admin
                    adminSocket.emit("popup", "I can't find a user named " + cmd[1]);
                }
                break;


            //disconnect all sockets
            case "nuke":

                for (var id in io.sockets.sockets) {
                    io.sockets.sockets[id].emit("errorMessage", "Server Restarted\nPlease Refresh");

                    io.sockets.sockets[id].disconnect();
                }

                gameState.players = {};
                break;

            //add to the list of banned IPs
            case "ban":
                var IP = IPByName(cmd[1]);
                var s = socketByName(cmd[1]);
                if (IP != "") {
                    banned.push(IP);
                }

                if (s != null) {
                    s.emit("errorMessage", "You have been banned");
                    s.disconnect();
                    delete gameState.players[s.id];
                }
                else {
                    //popup to admin
                    adminSocket.emit("popup", "I can't find a user named " + cmd[1]);
                }

                break;

            case "unban":
                //releases the ban
                banned = [];
                break;

            //forces a hard refresh - all players disconnect
            //used to load a new version of the client
            case "refresh":
                io.sockets.emit("refresh");
                break;

            default:
                //check if game has a moded admin
                if (GAME.ADMIN[cmd[0]] != null) {
                    //call it!
                    GAME.ADMIN[cmd[0]](cmd, player);

                }
                else {
                    print("No admin command named " + cmd[0]);
                }
                break;

        }
    }
    catch (e) {
        console.log("Error admin command");
        console.error(e);
    }
}

//admin functions, the admin exists in the client frontend so they don't have access to ip and id of other users
function socketByName(nick) {
    var s = null;
    for (var id in gameState.players) {
        if (gameState.players.hasOwnProperty(id)) {
            if (gameState.players[id].nickName.toUpperCase() == nick.toUpperCase()) {
                s = io.sockets.sockets[id];
            }
        }
    }
    return s;
}

function idByName(nick) {
    var i = null;
    for (var id in gameState.players) {
        if (gameState.players.hasOwnProperty(id)) {
            if (gameState.players[id].nickName.toUpperCase() == nick.toUpperCase()) {
                i = id;
            }
        }
    }
    return i;
}

function IPByName(nick) {
    var IP = "";
    for (var id in gameState.players) {
        if (gameState.players.hasOwnProperty(id)) {
            if (gameState.players[id].nickName.toUpperCase() == nick.toUpperCase()) {
                IP = gameState.players[id].IP;
            }
        }
    }
    return IP;
}




//creates a PASSAGE object starting from a twee file, only passages, titles, links, and tags are supported
function parseTwee(data) {
    var OBJ = {};
    var parsingErrors = "";

    //split passages
    var arr = data.split(":: ");

    for (var i = 0; i < arr.length; i++) {
        //print("--" + arr[i]);

        //var header = arr[i].match(/:: (.*?)\n/);

        //header is first line
        var header = arr[i].match(/(.+)/);

        if (header != null) {
            var id = header[1];
            print(">>> " + id);
            //everything outside of the header is body
            var txt = arr[i].replace(header[0], "");

            var room = "";
            //room is in the tag field
            var roomArr = header[1].match(/\[(.*?)\]/);

            if (roomArr != null) {
                //remove leading and trailing spaces
                room = roomArr[1].replace(/^\s+|\s+$/g, "");


                //strip tags from header if any
                id = id.replace(roomArr[0], "");

                if (room.match(/\W/g) != null)
                    parsingErrors += "Room id error: room id must not contain special characters or spaces - triggered by " + room + "\n";
            }

            //remove leading and trailing whitespaces
            id = id.replace(/^\s+|\s+$/g, "");

            if (id.match(/\W/g) != null)
                parsingErrors += "Twee file error: passage title must not contain special characters or spaces - triggered by " + id + "\n";
            else {
                //header non null and valid as id 
                //read the properties of the passage
                OBJ[id] = {};

                //if there is a room associated to a passage
                if (room != null) {
                    OBJ[id].room = room;
                }

                //get rid of twee separator
                //txt = txt.replace(/^(\n)/g, "");
                //txt = txt.replace(/\n\n\n/g, "");
                //txt = txt.replace(/\n\n/g, "");
                //txt = txt.replace(/(\r\n|\n\n|\r)/gm, "");

                OBJ[id].text = txt.trim();

                //print("Text: " + txt);
            }
        }

    }//passage loop

    if (parsingErrors != "") {
        print(parsingErrors);
        return null
    }
    else {
        print("Twee file parsed successfully: " + Object.keys(OBJ).length + " passages");
        return OBJ;
    }
}


//listen to the port 3000 this powers the whole socket.io
http.listen(port, function () {
    console.log("listening on *:3000");
});

//check the last activity and disconnect players that have been idle for too long
setInterval(function () {
    var time = new Date().getTime();

    for (var id in gameState.players) {
        if (gameState.players.hasOwnProperty(id)) {

            if (gameState.players[id].nickName != "" && (time - gameState.players[id].lastActivity) > ACTIVITY_TIMEOUT) {
                console.log(id + " has been idle for more than " + ACTIVITY_TIMEOUT + " disconnecting");
                io.sockets.sockets[id].emit("refresh");
                io.sockets.sockets[id].disconnect();
                delete gameState.players[id];
            }
        }
    }
}, 1000);


//in my gallery people can swear but not use slurs, override bad-words list, and add my own, pardon for my french
let myBadWords = ["chink", "cunt", "cunts", "fag", "fagging", "faggitt", "faggot", "faggs", "fagot", "fagots", "fags", "jap", "homo", "nigger", "niggers", "n1gger", "nigg3r"];
var filter = new Filter({ emptyList: true });
filter.addWords(...myBadWords);

//p5 style alias
function print(s) { console.log(s); }


//initialize the game file, making a bunch of variables and functions visible to the "modules"
if (GAME.initGame != null) {

    var UTILS = {
        adaptPronoun,
        print,
        nameLink,
        adapt,
        randomInt,
        randomIn
    }
    GAME.initGame(io, gameState, GAME, UTILS);
}