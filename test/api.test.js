const request = require("supertest");
const expect = require("chai").expect;
const app = require("../src/index");
const chai=require("chai")

/**
 * Testing the same as arriba
 */
describe("GET /table", ()=>{
    it("respond with table with all megalitos", (done)=>{
        request(app)
        .get("/table")
        .expect(200,done)
    })
})
/**
 * Testing user endpoint by giving an existing megalito
 */
describe("GET table/vista/:ID", () => {
    it("respond with megalito data containing a single Megalito", (done) => {
        request(app)
            .get("/table/vista/264")
            .expect(200, done);
    });

    it("respond with page 404 MEgalito not found when the Megalito ID does not exists", (done) => {
        request(app)
            .get("/table/vista/0")
            .expect(404)
            .end((err) => {
                if (err) return done(err);
                done();
            });
    });
});
