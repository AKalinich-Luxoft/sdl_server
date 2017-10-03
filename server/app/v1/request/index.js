const async = require('async');
const sql = require('sql-bricks');
let updateData; //to be defined
let app; //to be defined
let updateObjects; //to be defined

module.exports = function (appObj) {
	app = appObj;
    updateData = require('./update-data.js')(app);
    //include all the objects above in an array for future use
    updateObjects = [];
    for (let updateObj in updateData) {
        updateObjects.push(updateData[updateObj]);
    }
	return {
        getAppRequests: getAppRequests,
        //getPendingApps: getPendingApps,
		//denyApp: denyApp,
		evaluateAppRequest: evaluateAppRequest,
        forceUpdate: forceUpdate
	};
}
//TODO: ignore status of incoming apps, set to PRODUCTION
//the difference of the different endpoints comes in here. in a staging API route, approved and pending are given permission
//in a production API route only approved apps are given permission

function getAppRequests (callback) {
    //use the data collectors to get application request data
    //SHAID should be the first module to run for this
    collectData('getAppRequests', function (err, appRequests) {
        callback(appRequests);
    }); 
}

function evaluateAppRequest (appObj, callback) {
    const tasks = updateObjects.map(function (updateObj) {
        return function (next) {
            //update check
            performUpdateCycle(updateObj.getDataFunc(appObj), updateObj.tableName, updateObj.databasePropName, updateObj.moduleFuncName, 
                updateObj.errorCallback, updateObj.transformDataFunc, next);
        }
    });

    async.parallel(tasks, function (err) {
        //database is updated. 
        insertAppRequest(appObj, callback);
    });
}

function forceUpdate (callback) {
    //update each set of data in the database for the objects in updateObjects
    const tasks = updateObjects.map(function (updateObj) {
        return function (next) {
            databaseUpdate(updateObj.tableName, updateObj.databasePropName, updateObj.moduleFuncName, updateObj.transformDataFunc, next);
        }
    });

    async.parallel(tasks, function (err) {
        if (err) {
            app.locals.log.error(err);
        }
        updateFunctionalGroupInfo(callback);
    });
}

function updateFunctionalGroupInfo (callback) {    
    async.waterfall([
        //functional group data update. required if permissions have been added because that means
        //more function groups are possibly needed
        function (next) {
            //store template functional group info in the database
            const groups = app.locals.builder.initiateFunctionalGroups();
            databaseCheckPropMultiInsert('function_group_info', 'property_name', groups, next);
        },
        function (next) {
            //get all the permission data 
            collectData('getPermissions', function (err, permissions) {
                next(err, permissions);
            }); 
        },
        function (permissions, next) {
            //store permission relations in the database. these are separated from function group definitions
            const relations = app.locals.builder.createPermissionRelations(permissions);
            //format into something relational that the DB can accept
            let dbRelations = [];
            for (let i = 0; i < relations.length; i++) {
                const relation = relations[i];
                for (let j = 0; j < relation.parents.length; j++) {
                    dbRelations.push({
                        child_permission_name: relation.permissionName,
                        parent_permission_name: relation.parents[j]
                    });
                }
            }
            databaseCheckMultiInsert('permission_relations', dbRelations, next);
        },
        function (next) {
            async.parallel({
                //make access to this information faster by converting the arrays of data
                //to hashes, so lookup by property is possible
                functionalGroups: function (next) {
                    //get the functional group infos just inserted so we have a reference to their ids
                    //TODO: be able to specify STAGING or PRODUCTION when we add the routing for this
                    const groupedFuncGroupInfoStr = sql.select('property_name', 'status', 'max(id) AS id')
                        .from('function_group_info')
                        .groupBy('property_name', 'status').toString();

                    const fullFuncGroupInfoStr = sql.select('function_group_info.*')
                        .from('(' + groupedFuncGroupInfoStr + ') group_fgi')
                        .join('function_group_info', {'function_group_info.id': 'group_fgi.id'})
                        .where({'group_fgi.status': 'PRODUCTION'}).toString();

                    app.locals.db.sqlCommand(fullFuncGroupInfoStr, function (err, data) {
                        let hash = {};
                        for (let i = 0; i < data.rows.length; i++) {
                            hash[data.rows[i].property_name] = data.rows[i].id;
                        }
                        next(err, hash);
                    });
                }       
            }, function (err, data) {
                next(err, data);
            });
        },
        function (data, next) {
            //create permissions for all the defined functional groups
            const permissions = app.locals.builder.createGroupPermissions();
            const permissionDbObjs = permissions.map(function (permission) {
                return {
                    function_group_id: data.functionalGroups[permission.functionalGroupName],
                    permission_name: permission.permissionName
                };
            });
            //insert the generated permissions
            //databaseCheckPropMultiInsert('function_group_permissions', 'function_group_id', permissionDbObjs, next);
            databaseCheckMultiInsert('function_group_permissions', permissionDbObjs, next);
        }
    ], function (err) {
        if (err) {
            app.locals.log.error(err);
        }
        callback(); //done
    });
}

//TODO: in the migration script, add views when necessary to easily return most recent information about certain sets of data
function insertAppRequest (appObj, callback) {
    const vendor = {
        vendor_name: appObj.vendor.name,
        vendor_email: appObj.vendor.email
    };

    const newAppObj = {
        app_uuid: appObj.uuid,
        name: appObj.name,
        platform: appObj.platform,
        platform_app_id: appObj.platform_app_id,
        status: appObj.status,
        can_background_alert: appObj.can_background_alert,
        can_steal_focus: appObj.can_steal_focus,
        default_hmi_level: appObj.default_hmi_level,
        tech_email: appObj.tech_email,
        tech_phone: appObj.tech_phone,
        category_id: appObj.category.id
    };

    const vendorInsertStr = sql.insert('vendors', vendor).toString();
    const ERROR_NO_APP_UPDATE = "App received is already updated in the database";

    async.waterfall([
        function (next) {
            //compare timestamps to determine if the app info actually changed before insertion
            const incomingAppTimestamp = appObj.updated_ts;
            const getAppStr = sql.select('max(updated_ts)').from('app_info').where({app_uuid: appObj.uuid}).toString();
            app.locals.db.sqlCommand(getAppStr, function (err, data) {
                const currentTimestamp = data.rows[0].max;
                if (currentTimestamp !== null && currentTimestamp !== undefined) {
                    const incomingDate = new Date(incomingAppTimestamp);
                    const currentDate = new Date(currentTimestamp);
                    if (incomingDate > currentDate) {
                        //the app in the policy server's database is outdated! insert the new data
                        next();
                    }
                    else {
                        next(ERROR_NO_APP_UPDATE);
                    }
                }
                else {
                    next();
                }
            });
        },
        function (next) {
            //insert vendor info
            app.locals.db.sqlCommand(vendorInsertStr, function (err, data) {
                next(err);
            });            
        },
        function (next) {
            //find the vendor ID generated in the database and use that as the reference for the app object
            databaseQuerySelect('max(id)', 'vendors', {'vendor_name': appObj.vendor.name, 'vendor_email': appObj.vendor.email}, function (err, data) {
                next(err, data[0].max);
            });
        },
        function (vendorId, next) {
            newAppObj.vendor_id = vendorId;
            const appInsertStr = sql.insert('app_info', newAppObj).toString();
            app.locals.db.sqlCommand(appInsertStr, function (err, data) {
                next(err);
            });            
        }
    ], function (err, results) {
        if (err) {
            if (err !== ERROR_NO_APP_UPDATE) {
                //error while trying to insert data! there's nothing else that can be done
                app.locals.log.error("App information insert failed!");
                app.locals.log.error(JSON.stringify(newAppObj, null, 4));
                app.locals.log.error(err);
            }
            callback(); //we're done here. no sense in inserting anything else
        }
        else {
            addExtraAppInformation(appObj, callback);
        }
    });
}

function addExtraAppInformation (appObj, callback) {
    //get extra id information that we need
    async.parallel({
        appId: function (next) {
            //TODO: make sure you can specify whether you want staging or production version
            const queryStr = sql.select('max(id)').from('app_info').where({app_uuid: appObj.uuid}).toString();
            //get the generated id from the most recent version of this uuid in the database
            app.locals.db.sqlCommand(queryStr, function (err, data) {
                next(err, data.rows[0].max);                
            }); 
        }
    }, function (err, data) {
        if (err) {
            app.locals.log.error(err);
        }
		//insert the extra information about the app

        const appCountries = appObj.countries.map(function (country) {
            return {
                app_id: data.appId,
                country_iso: country.iso
            };
        });
        const displayNames = appObj.display_names.map(function (displayName) {
            return {
                app_id: data.appId,
                display_text: displayName
            };
        });

        const permissions = appObj.permissions.map(function (perm) {
            return {
                app_id: data.appId,
                permission_name: perm.key
            }
        });

        let insertStrings = [];
        if (appCountries.length > 0) {
            insertStrings.push(sql.insert('app_countries').values(appCountries).toString());
        }
        if (displayNames.length > 0) {
            insertStrings.push(sql.insert('display_names').values(displayNames).toString());
        }
        if (permissions.length > 0) {
            insertStrings.push(sql.insert('app_permissions').values(permissions).toString());
        }

        const insertFunctions = insertStrings.map(function (insertStr) {
            return function (next) {
                app.locals.db.sqlCommand(insertStr, function (err, data) {
                    //do not error out if some insert fails for whatever reason. do log it
                    if (err) {
                        app.locals.log.error(err);
                    }                    
                    next(); 
                });                 
            }
        });

        async.parallel(insertFunctions, function (err) {
            callback(); //done
        });
    });         
}

//master function that executes a full check and update cycle for a given set of information
function performUpdateCycle (dataArray, tableName, databasePropName, moduleFuncName, errorCallback, transformDataFunc, callback) {
    const dataChecker = dataArray.map(function (datum) {
        return function (next) {
            databaseQueryPropExists(tableName, databasePropName, datum, function (exists) {
                if (exists) {
                    next();
                }
                else {
                    //value doesn't exist in DB. end the other checks by passing the datum that was missing
                    next(datum);
                }
            });       
        };
    });

    //see if any of the data received has information the policy server doesn't recognize
    async.parallel(dataChecker, function (datum) {
        if (datum) { //missing information
            errorCallback(datum); //let the caller know which data is missing
            //get updated information from collector modules
            databaseUpdate(tableName, databasePropName, moduleFuncName, transformDataFunc, callback);
            //update cycle done
        }
        else { //nothing missing!
            callback();
        }
    });
}

//gets updates from a given set of information
function databaseUpdate (tableName, databasePropName, moduleFuncName, transformDataFunc, callback) {
    //get updated information from collector modules
    collectData(moduleFuncName, function (err, updatedDataArray) {
        if (err) {
            app.locals.log.error(err);
        }
        //send this info back to the caller so the caller can transform the data
        const transformedDataArray = updatedDataArray.map(function (datum) {
            return transformDataFunc(datum);
        });
        //stage two: uses the updated data array and previously known information to check and store
        //data that previously did not exist in the database
        databaseCheckPropMultiInsert(tableName, databasePropName, transformedDataArray, callback);
    });
}

/****** UTILITY FUNCTIONS ******/

function collectData (moduleFunction, callback) {
    //cycle through all the collector modules to retrieve updated info using an implemented function
    const iteratingCollectors = app.locals.collectors.map(function (module) {
        return module[moduleFunction];
    });     

    //invoke array of data collector functions
    async.waterfall(iteratingCollectors, function (err, dataArray) {
        //all data are now aggregated from all data collecting sources
        callback(err, dataArray);
    });     
}

//executes on an array of data to insert into the database
function databaseCheckPropMultiInsert (tableName, databasePropName, dataArray, callback) {
    const dataChecker = dataArray.map(function (datum) {
        let propQuery = {};
        propQuery[databasePropName] = datum[databasePropName];
        return databaseCheckInsert(tableName, propQuery, datum);
    });
    //run the insert functions
    async.parallel(dataChecker, function (err) {
        callback(err);
    });
}

//executes on an array of data to insert into the database
function databaseCheckMultiInsert (tableName, dataArray, callback) {
    const dataChecker = dataArray.map(function (datum) {
        return databaseCheckInsert(tableName, datum, datum);
    });
    //run the insert functions
    async.parallel(dataChecker, function (err) {
        callback(err);
    });
}

function databaseCheckInsert (tableName, propQuery, datum) {
    //check the DB for if the datum exists. use the whole propQuery object for the existence check
    return function (next) {
        databaseQueryExists(tableName, propQuery, function (exists) {
            if (exists) {
                next(); //don't add it
            }
            else {
                //datum doesn't exist in DB. add it!
                databaseInsert(tableName, datum, next);
            }
        });         
    } 
}

//inserts a piece of data in a table in the database
function databaseInsert (tableName, datum, callback) {
    const insertStr = sql.insertInto(tableName, datum).toString();
	app.locals.db.sqlCommand(insertStr, function (err, data) {
	    callback(err);
	}); 
}

//given a table name, a property to query and the value of the query,
//check whether that data exists in the database
function databaseQueryPropExists (tableName, databasePropName, dataPropValue, callback) {
    let propQuery = {};
    propQuery[databasePropName] = dataPropValue;
    databaseQueryExists(tableName, propQuery, callback);
}

//given a table name and a query object,
//check whether that data exists in the database
function databaseQueryExists (tableName, propQuery, callback) {
    databaseQuerySelect('*', tableName, propQuery, function (err, data) {
        //return whether the data doesn't exist in the DB
        callback(data.length !== 0);
    });
}

//gets data from the database based on a selection argument and a matching query
function databaseQuerySelect (selectionString, tableName, matchObj, callback) {
    const queryStr = sql.select(selectionString).from(tableName).where(matchObj).toString();
    app.locals.db.sqlCommand(queryStr, function (err, data) {
        callback(err, data.rows);
    }); 
}

/*
//TODO: postpone UI until after initial launch

function denyApp (appId, callback) {
    const updateAppStr = sql.update('app_info', {approval_status: 'DENIED'}).where({id: appId}).toString();
    app.locals.db.sqlCommand(updateAppStr, function (err) {
        callback();
    });  
}

//TODO: avoid repetition with the function in app/v1/policy/appPolicy.js
function getPendingApps (callback) {
    const ERROR_NO_PERMITTED_APPS = "No permitted app ids";
    //query the database for all the most recent versions of app requests that are pending
    async.waterfall([
        function (next) {
            //get the latest versions of the app ids that aren't denied
            const groupedAppInfoStr = sql.select('app_uuid', 'approval_status', 'max(id) AS id')
                .from('app_info')
                .groupBy('app_uuid', 'approval_status').toString();

            const fullAppInfoStr = sql.select('app_info.*')
                .from('(' + groupedAppInfoStr + ') group_ai') 
                .join('app_info', {'app_info.id': 'group_ai.id'})
                .where(sql.in('app_info.approval_status', ['PENDING']))
                //additional where statement where we check against the appPolicy IDs
                .toString();

            app.locals.db.sqlCommand(fullAppInfoStr, function (err, appInfo) {
                if (appInfo.rows.length === 0) {
                    //there's no app ids. exit out early
                    return next(ERROR_NO_PERMITTED_APPS);
                }
                let appInfoRows = appInfo.rows;
                //assign empty arrays that will be used to put information in later
                for (let i = 0; i < appInfoRows.length; i++) {
                    appInfoRows[i].display_names = [];
                    appInfoRows[i].vehiclePermissions = [];
                    appInfoRows[i].rpcPermissions = [];
                }
                next(err, appInfoRows);
            });
        },
        function (appInfo, next) {
            const appInfoIds = appInfo.map(function (oneApp) {
                return oneApp.id;
            });
            //get the display names whose ids only match those from the ids in appInfo
            const displayNameFilterStr = sql.select('*').from('display_names')
                .where(sql.in('app_id', appInfoIds))
                .toString();

            app.locals.db.sqlCommand(displayNameFilterStr, function (err, data) {
                //associate the display names with the correct appInfo
                const displayNamesTasks = data.rows.map(function (displayName) {
                    return function (next) {
                        let appObj = findObjByProperty(appInfo, 'id', displayName.app_id);
                        appObj.display_names.push(displayName.display_text);
                        next();
                    }
                });
                async.parallel(displayNamesTasks, function (err) {                    
                    next(err, appInfo, appInfoIds);
                }); 
            });   
        },
        function (appInfo, appInfoIds, next) {            
            //we need permission associations for each app in appInfo and the permissions' full names
            const vehiclePermsFilterStr = sql.select('*').from('app_vehicle_permissions')
                .where(sql.in('app_id', appInfoIds))
                .toString();

            const fullVehiclePermsFilterStr = sql.select('*')
                .from('(' + vehiclePermsFilterStr + ') group_vp')
                .innerJoin('vehicle_data', {'group_vp.vehicle_id': 'vehicle_data.id'})
                .toString();

            app.locals.db.sqlCommand(fullVehiclePermsFilterStr, function (err, data) {
                const vehiclePermsTasks = data.rows.map(function (vehiclePerm) {
                    return function (next) {
                        let appObj = findObjByProperty(appInfo, 'id', vehiclePerm.app_id);
                        appObj.vehiclePermissions.push(vehiclePerm.component_name);
                        next();
                    }
                });
                async.parallel(vehiclePermsTasks, function (err) {
                    next(err, appInfo, appInfoIds);
                }); 
            });
        },
        function (appInfo, appInfoIds, next) {            
            const rpcPermsFilterStr = sql.select('*').from('app_rpc_permissions')
                .where(sql.in('app_id', appInfoIds))
                .toString();

            const fullRpcPermsFilterStr = sql.select('*')
                .from('(' + rpcPermsFilterStr + ') group_rp')
                .innerJoin('rpc_names', {'group_rp.rpc_id': 'rpc_names.id'})
                .toString();
            
            app.locals.db.sqlCommand(fullRpcPermsFilterStr, function (err, data) {
                const rpcPermsTasks = data.rows.map(function (rpcPerm) {
                    return function (next) {
                        let appObj = findObjByProperty(appInfo, 'id', rpcPerm.app_id);
                        appObj.rpcPermissions.push(rpcPerm.rpc_name);
                        next();
                    }
                });
                async.parallel(rpcPermsTasks, function (err) {
                    next(err, appInfo);
                }); 
            });
        }
    ], function (err, appInfo) {       
        if (err) {
            //it's not technically an error if the cause was because there were no app ids
            if (err !== ERROR_NO_PERMITTED_APPS) {
                app.locals.log.error(err);
            }
        }
        if (appInfo === null || appInfo === undefined) {
            appInfo = [];
        }
        callback(appInfo);
    });
    function findObjByProperty (array, propName, value) {
        for (let i = 0; i < array.length; i++) {
            if (array[i][propName] === value) {
                return array[i];
            }
        }
        return null;
    }
}
*/