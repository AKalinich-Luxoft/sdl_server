//load the environment variables from the .env file in the same directory
require('dotenv').config();
//load modules
const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const config = require('./config.js'); //configuration module
//load custom modules described in the config
const log = require(`./custom/loggers/${config.loggerModule}/index.js`);
const db = require(`./custom/databases/${config.dbModule}/index.js`)(log); //pass in the logger module that's loaded

//require an array of modules used to get updated information from sources (ex. SHAID) to the database
const collectors = config.collectors.map(function (module) {
    return require(`./custom/data-collectors/${module}/index.js`)(log);
});

const builder = require(`./custom/policy-builders/${config.builderModule}/index.js`)(log);

const versions = ["1"];
const rootLocation = __dirname + '/../client/public';

let app = express();
app.use(bodyParser.json()); //allow json parsing
app.use(bodyParser.urlencoded({extended: true})); //for parsing application/x-www-form-urlencoded
//TODO: postpone UI until after initial launch
//app.use(express.static(rootLocation)); //expose webpages

//attach custom modules
app.locals.config = config;
app.locals.log = log;
app.locals.db = db;
app.locals.collectors = collectors;
app.locals.builder = builder;
app.locals.events = new EventEmitter();

//load all routes located in the app directory using a v<version number> naming convention
for (let i in versions){
    app.use(["/api/v"+versions[i], "/api/"+versions[i]], require("./app/v" + versions[i] + "/app"));
}

//global routes

//basic health check endpoint
app.get("/health", function (req, res) {
    res.sendStatus(200);
});

//loader.io verification route for load testing
app.get("/loaderio-8e4d80eaf952e3e972feea1072b80f9f", function (req, res) {
    res.send("loaderio-8e4d80eaf952e3e972feea1072b80f9f");
});

//error catcher
app.use(function (err, req, res, next) {
    app.locals.log.error(err);
    res.sendStatus(500);
    return;
});

//404 catch-all
app.use(function (req, res) {
    res.sendStatus(404);
});

//start the server
app.listen(config.policyServerPort, function () {
    log.info(`Policy server started on port ${config.policyServerPort}!`);
    log.info(`Updating database information and generating functional groups...`);
    app.locals.events.emit('update');
});