var common = require('../../../common');
var expect = common.expect;
var endpoint = '/api/v1/applications/groups';

common.put(
    'should change functional group selection (selected)',
    endpoint,
    {app_id: 1, property_name: 'Notifications', is_selected: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(200);
        done();
    }
);

common.put(
    'should change functional group selection (unselected)',
    endpoint,
    {app_id: 1, property_name: 'Notifications', is_selected: false},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(200);
        done();
    }
);

common.put(
    'should return 400 when no parameters are provided',
    endpoint,
    {},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.put(
    'should return 400 with missing is_selected',
    endpoint,
    {app_id: 1, property_name: 'Notifications'},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.put(
    'should return 400 with missing property_name',
    endpoint,
    {app_id: 1, is_selected: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.put(
    'should return 400 with missing app_id',
    endpoint,
    {property_name: 'Notifications', is_selected: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.put(
    'should not accept an invalid application id',
    endpoint,
    {app_id: 10000, property_name: 'Notifications', is_selected: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);