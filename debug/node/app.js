//Express is a framework for making web sites
const express = require('express');
//'app' is the Express application which we send data to
const app = express();
//http library contains various tools for setting up a server to receive http requests
const http = require('http');
//this is where the server is created
const server = http.createServer(app);
//we import the 'Server' class from 'socket.io' to upgrade the http connection to websockets
const { Server } = require("socket.io");
//'io' is a websocket server (connect to it with "ws://..." instead of "http://...")
const io = new Server(server);
//this is a middleware to read/write cookies so if players disconnect by accident they
//don't lose all progress
const cookieParser = require('cookie-parser');

const {v4 : uuidv4} = require('uuid');

app.use(cookieParser());

var gycID;
//when a GET http request is sent to root of the website, return an html page
app.get('/', (req, res) => {
    gycID = req.cookies['gycID'];
    if(!gycID){
        gycID = uuidv4();
        res.cookie('gycID', gycID);
    }
    res.sendFile(__dirname + '/index.html');
});

//Keeps track of which players are in a given room
var rooms = {}
//Keeps track of which room a player is in in case they disconnect for a moment
var players = {}
//Keeps track of which game state a given room is in
var gameState = {}
//Valid states:
//LOBBY
//QUESTIONING
//ANSWERING
//MATCHING
//RESULTS

//this sets up a callback when a client connects to the server
io.on('connection', (socket) => {
    //When the client connects, we get an id saved in their cookies. This is so
    //they can reconnect to a game in progress, because reconnecting generates
    //a new websocket id
    socket.emit('get-id');
    //When it is received we check to see if they are already in a lobby, so 
    //we can rejoin them
    socket.on('received-id', (id) => {
        if(players[id]){
            socket.join(players[id]);
            io.to(roomID).emit('joined-room', players[id], rooms[players[id]]);
        }
    })
    //Below are a list of callbacks for different events
    //Some have parameters and some don't
    socket.on('disconnect', () => {
        //console.log('user disconnected');
    });
    socket.on('create-room', (id) => {
        roomID = uuidv4().substring(0,6);
        rooms[roomID] = [id];
        gameState[roomID] = 'LOBBY';
        players[id] = roomID;
        socket.join(roomID);
        io.to(roomID).emit('joined-room', roomID, rooms[roomID]);
    })
    socket.on('join-room', (id, roomID) => {
        if(rooms[roomID]){
            rooms[roomID].push(id);
            players[id] = roomID;
            socket.join(roomID);
            io.to(roomID).emit('joined-room', roomID, rooms[roomID]);
        }
        else{
            socket.emit('error', 'That room does not exist');
        }
    })
});

const port = process.env.PORT || 3000;
//this makes the server start listening for incoming requests
server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});