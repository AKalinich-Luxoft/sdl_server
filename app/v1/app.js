const async = require('async');
const sql = require('sql-bricks');
let express = require('express');
let app = express();
const appRequests = require('./request/index.js')(app);
const functionalGroup = require('./policy/functionalGroup.js')(app);
const appPolicy = require('./policy/appPolicy.js')(app);
const consumerMessages = require('./policy/consumerMessages.js')(app)
const moduleConfig = require('./policy/moduleConfig.js')(app)

module.exports = app;

//get locals from the parent app
app.on("mount", function (parent) {
    app.locals.config = parent.locals.config;
    app.locals.log = parent.locals.log;
    app.locals.db = parent.locals.db;
    app.locals.collectors = parent.locals.collectors;
    app.locals.builder = parent.locals.builder;
    app.locals.events = parent.locals.events;

    app.locals.events.on('update', function () {
        async.series([
            function (next) {
                appRequests.forceUpdate(next);
            },
            function (next) {
                //use the updated data to create a new functional group object and save it for later use
                functionalGroup.createFunctionalGroupObject(next);
            },
            function (next) {
                //generate the consumer friendly messages object and the module config object to avoid
                //extra calls to the database and to avoid reconstruction on every policy update request
                moduleConfig.createModuleConfig(next);
            },
            function (next) {
                consumerMessages.createConsumerMessages(next);
            },
            function (next) {
                //auto-call the request function to get potentially updated app information
                updateAppRequestInfo(next);
            },
        ], function (err) {
            app.locals.log.info('Update complete');
            //make the route accessible now
            app.route('/request')
                .get(appRequest);
        });
    });
});

//TODO: need a way to automatically get new SHAID info, whether it's via webhooks or by polling
function appRequest (req, res, next) {
    updateAppRequestInfo(function () {
        res.sendStatus(200);
    });
}

function updateAppRequestInfo (callback) {
    appRequests.getAppRequests(function (requests) {
        if (!requests) {
            return callback();
        }
        //TODO: use a queue for when webhooks come in so that we can still enforce one at a time request handling
        //operate over every app request received
        //the reason this should be serial is that every app coming in has a chance to contain information
        //the policy server doesn't have. the server needs to do an update cycle when it notices information missing.
        //allowing parallel computation will cause duplicate cycles to run when multiple apps come in with missing information,
        //causing lots of unnecessary load on the SHAID server
        const requestTasks = requests.map(function (request) {
            return function (next) {
                //app.locals.log.info(JSON.stringify(request, null, 4));
                appRequests.evaluateAppRequest(request, next);
            }
        });

        async.series(requestTasks, function (err) {
            if (err) {
                app.locals.log.error(err);
            }
            callback();
        });
    });
}

function validatePolicyTable (req, res, next){
    if (req.body.policy_table == null) {
        res.status(400).send("Please provide policy table information");
    } else if (req.body.policy_table.app_policies == null) {
        res.status(400).send("Please provide app policies information");
    } else if (req.body.policy_table.consumer_friendly_messages == null) {
        res.status(400).send("Please provide consumer friendly messages information");
    } else if (req.body.policy_table.device_data == null) {
        res.status(400).send("Please provide device data information");
    } else if (req.body.policy_table.functional_groupings == null) {
        res.status(400).send("Please provide functional groupings information");
    } else if (req.body.policy_table.module_config == null) {
        res.status(400).send("Please provide module config information");
    } else if (req.body.policy_table.usage_and_error_counts == null) {
        res.status(400).send("Please provide usage and error counts information");
    } else {
        next();
    }
}

//TODO: replace all attempts to compile information from multiple table with using INNER JOINs (ex. appPolicy.js)

//a request came from sdl_core!
app.post('/staging/policy', validatePolicyTable, function (req, res, next) {
    async.parallel([
        function (callback) {
            callback(null, moduleConfig.getModuleConfig());
        },
        function (callback){
            callback(null, functionalGroup.getFunctionalGroup());
        },
        function (callback){
            callback(null, consumerMessages.getConsumerMessages());
        },
        function (callback){
            //given an app id, generate a policy table based on the permissions granted to it
            //iterate over the app_policies object. query the database for matching app ids that have been approved

            //for now, auto approve all apps that request permissions
            appPolicy.createPolicyObject(req.body.policy_table.app_policies, function (appPolicyModified) {
                //the original appPolicy object may get modified
                callback(null, appPolicyModified);
            })
        }
    ],
    function (err, done) {
        let policyTable = {"policy_table": {}};
        policyTable.policy_table.module_config = done[0];
        policyTable.policy_table.functional_groupings = done[1];
        policyTable.policy_table.consumer_friendly_messages = done[2];
        policyTable.policy_table.app_policies = done[3];
        let responseJson = {"data": [policyTable]};
        res.json(responseJson);
    });
});

/*
//TODO: postpone UI until after initial launch
//TODO: put these routes and the get webpage route under authentication
app.get('/application', function (req, res, next) {
    appRequests.getPendingApps(function (requests) {
        res.json(requests);
    });
});

app.post('/deny', function (req, res, next) {
    appRequests.denyApp(req.body.id, function () {
        res.sendStatus(200);
    });
});
*/