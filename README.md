# MUDLIKE

A multiplayer text environment used in [LIKELIKE](http://likelike.org)'s online exhibition *The end of the WORD as we know it*. 

A running (hopefully) instance of this repository can be found at [https://likeliketext.glitch.me/](https://likeliketext.glitch.me/)

MUDLIKE is a mashup of a [Twine](https://twinery.org/) game and a multi room chat. 
Unlike the classic [Multi User Dungeons](https://en.wikipedia.org/wiki/MUD), MUDLIKE doesn't use a parser. Actions and movements are activated through hyperlinks.
MUDLIKE is not a beginner friendly tool like Twine. In order to use this codebase you need to know javascript and node.js.

## Technology
MUDLIKE uses node.js, express, and socket.io on the server side and plain html on the client side. 
It is built to be deployed on [Glitch](https://glitch.com/) but it can be adapted to other node.js enabled platforms.

## Structure

**server.js** is the engine serving all the passages and messages, to create your own story you don't need to know how it works.

**game.js** is where the game settings, variable an logic are stored. Ideally you should be able to make a whole different game by changing game.js and story.tw
For example in *The end of the WORD as we know it* users can contract language viruses that modify their speech. The viruses can be transmitted from player to player and their effect last a couple of minutes. All the virus logic is contained in game.js.
This file also contains a series of functions called upon certain game events, such as player initialization.

**story.tw** (you can change its name in the game settings) is the hypertext part at the top. It's parsed from a twee file which can be exported from [Twine](https://twinery.org/) 1.4.2 (Important: the more recent Twine 2 doesn't have a built-in .tw exporter, so you shouldn't use that).
Each passage can be associated to a chatroom. Multiple passages can share the same chatroom. A chatroom is conceptually a space where users can hear each other.

**client.js, index.html, style.css** only take care of the visual *presentation* of the story, there is almost no content in them. 

# Writing your "stories"

MUDLIKE avoids the parser/command line model of early text games and MUDs in which you have to type things like "examine table" or "go to backyard".
Instead the description text is alway displayed at the top. This structure opens a can of worms in terms of time continuity because the state of a room can change after the description text has been displayed. 
Instead of changing the text in real time, the principle used here is to consider the description as frozen in time and use action updates in the chat section below to display updates.

The foolish idea behind MUDLIKE is to present a "story" with other people in it, rather than a hypertext with a chat at the bottom. So instead of listing all the users in a room, MUDLIKE allows you to integrate their presence and actions depending on the context (ie: the passage they are in).

You can structure the text world with Twine and write all the passages and the links between them. The various Twine macros are dependent on story formats so they won't work. You also won't be able to text MUDLIKE's dynamic features in Twine, you'll have to export the twee file: File > Export > Twee source code.

MUDLIKE uses a variety of custom macros that are used to *narrativize* actions, movements, and room states, to let players know about each other's presence:

## Link between passages with notification
In the example:

`[[vinyl text>>$name reads the wall text|wallText]]` 

**vinyl text** is the text of the link.
What follows **>>** is the message sent to all the other people in the room when the link is clicked. $name will be replaced by the user nickname.
**wallText** is the id of the destination passage

## roomPlayers
In the example:

`{roomPlayers|table|Nobody is here.|$name is perusing the refreshments too.|$list are perusing the refreshments too.}`

**roomPlayers** macro identifier
**table**  the room name
**Nobody is here.** fist member, is the text to display if there's no other player in the room.
**$name is perusing the refreshments too.** Text displayed if there is only one other player.
**$list are perusing the refreshments too.** Text displayed if there are multiple players. $list is replaced with a list of names (a,b,c, and d).

The macro always expects 5 members although some options can be left empty. eg:

`{roomPlayers|likelike|Nobody is in sight.||}`

Only adds a text if the room is empty.

## passagePlayers
As above but only listing players that are in a particular passage.

## function
Calls a custom function in game.js
In the example:

`{function|Pet the dog|pet|parameter}`

Creates a link that triggers a custom function.
**function** macro identifier
**Pet the dog** text of the link
**pet** name of the function in game js (module.exports.pet)
**parameter** string passed as parameter to the function



# Publishing on Glitch

**Glitch** is a community and a suite of online tools to develop web applications.
Glitch provides free hosting for node.js projects. Most web hosts don't give you that degree of access. Another popular platform is heroku.
Glitch offers a code editor, file storage, and an integrated terminal. You can create node applications from scratch via browser.
Glitch allows you to browse and remix other people's projects.

This repository is already structured for glitch deployment with a server.js and a package.json on the root, and a "public" folder.
You can deploy this app to Glitch via github or [other git repositories](https://medium.com/glitch/import-code-from-anywhere-83fb60ea4875)

Alternatively you can follow this process to deploy it starting from a zip of the project folder:

* Create a ZIP file of the project.
* Upload it to the assets folder in your project, click it and click **Copy Url**
* Starting from an empty or existing glitch project, navigate to **Settings > Advance Options > Open Console**
* In the console, pull the zip file from the url (keep file.zip name, it's just a temporary file)  
`wget -O file.zip https:///url-to-your-zip`  

* Extract it to the root folder
`unzip file.zip -d .`  

* Remove the zip file
`rm file.zip`  

* Refresh our app so the new files are shown in the editor and published
`refresh`  

## The .env file

.env is a text file in the root folder that contains private variables, in this case admin usernames and passwords and the port used by the project. It's not published on github and it's not automatically published on glitch so you may have to create it manually and/or copy paste the content in the glitch editor and/or in your code editor if you are running as a local project.

An example of .env file for LIKELIKE online is:

```javascript
ADMINS=adminname1|pass1,adminname2|pass2  
PORT = 3000
```

The admin names are reserved. Logging in as "adminname|pass" (nickname and password separated by a "|") will grant the user admin privileges such as banning IP or sending special messages.

