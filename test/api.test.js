const request = require("supertest");
const expect = require("chai").expect;
const app = require("../src/index");
const chai=require("chai")

/**
 * Testing get all user endpoint
 */
describe("GET /table", () => {
    it("respond with table with all megalitos", async function () {
        const response = await request(app).get("/table");
        expect(response.status).to.eql(304)
        expect(response.body.data.lenght).to.eql(50)

    });
});

/**
 * Testing the same as arriba
 */
describe("GET /table", ()=>{
    it("respond with table with all megalitos", (done)=>{
        request(app)
        .get("/table")
        .end((err,res)=>{
            res.status.to.eql(50);
            should.not.exist(err);
            done();
        })

    })
})

/**
 * Testing user endpoint by giving an existing user
 */
describe("GET table/vista/:ID", () => {
    it("respond with json containing a single user", (done) => {
        request(app)
            .get("/table/vista/264")
            .expect(200, done);
    });

    it("respond with json user not found when the user does not exists", (done) => {
        request(app)
            .get("/table/vista/weba")
            .expect(404)
            .expect('"user not found"')
            .end((err) => {
                if (err) return done(err);
                done();
            });
    });
});
