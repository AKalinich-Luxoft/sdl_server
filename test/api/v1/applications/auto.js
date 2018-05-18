var common = require('../../../common');
var expect = common.expect;
var sql = common.sql;
var setupSql = require('../../../../app/v1/app').locals.db.setupSqlCommand;
var endpoint = '/api/v1/applications/auto';

function getAutoApproveByUuid(uuid) {
    return sql.select('*')
        .from('app_auto_approval')
        .where({
            app_uuid: uuid
        })
        .toString();
}

common.post(
    'should add the given uuid to the auto approve table',
    endpoint,
    {uuid: 'dfda5c35-700e-487e-87d2-ea4b2c572802', is_auto_approved_enabled: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(200);
        setupSql(getAutoApproveByUuid('dfda5c35-700e-487e-87d2-ea4b2c572802'), (err, res) => {
            expect(err).to.be.null;
            expect(res).to.have.lengthOf(1);
            done();
        });
    }
);

common.post(
    'should return 400 with only uuid specified',
    endpoint,
    {uuid: 'dfda5c35-700e-487e-87d2-ea4b2c572802'},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.post(
    'should return 400 with only is_auto_approved_enabled specified',
    endpoint,
    {is_auto_approved_enabled: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.post(
    'should not add invalid uuid to the auto approve table',
    endpoint,
    {uuid: 'INVALID', is_auto_approved_enabled: true},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(200);
        setupSql(getAutoApproveByUuid('INVALID'), (err, res) => {
            expect(err).to.be.null;
            expect(res).to.have.lengthOf(0);
            done();
        });
    }
);

common.post(
    'should return 400 with invalid is_auto_approved_enabled',
    endpoint,
    {uuid: 'dfda5c35-700e-487e-87d2-ea4b2c572802', is_auto_approved_enabled: 7},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);

common.post(
    'should return 400 with no body specified',
    endpoint,
    {},
    (err, res, done) => {
        expect(err).to.be.null;
        expect(res).to.have.status(400);
        done();
    }
);