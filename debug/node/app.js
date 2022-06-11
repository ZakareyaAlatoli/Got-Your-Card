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
        console.log(`New ID generated: ${gycID}`);
    }
    else{
        console.log(`Current ID: ${gycID}`);
    }
    res.sendFile(__dirname + '/index.html');
});

var idMap = {};

//this sets up a callback when a client connects to the server
io.on('connection', (socket) => {
    socket.emit('get-id');
    socket.on('received-id', (id) => {
        console.log(id);
    })
    console.log('a user connected');
    //Below are a list of callbacks for different events
    //Some have parameters and some don't
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
    socket.on('chat message', (msg) => {
        //This emits to all connected sockets, including the sender
        io.emit('chat message', msg);
        console.log('message: ' + msg);
    });
});

const port = process.env.PORT || 3000;
//this makes the server start listening for incoming requests
server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});