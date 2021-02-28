const request = require("supertest");
const expect = require("chai").expect;
const app = require("../src/index");

/**
 * Testing get all user endpoint
 */
describe("GET /list", () => {
    it("respond with table with all megalitos", async function () {
        const response = await request(app).get("/list");
        expect(response.status).to.eql(200)
        expect(response.body.data.lenght).to.eql(50)

    });
});

/**
 * Testing user endpoint by giving an existing user
 */
describe("GET /vista/:ID", () => {
    it("respond with json containing a single user", (done) => {
        request(app)
            .get("/vista/127")
            .expect(200, done);
    });

    it("respond with json user not found when the user does not exists", (done) => {
        request(app)
            .get("/users/nonexistinguser")
            .set("Accept", "application/json")
            .expect("Content-Type", /json/)
            .expect(404)
            .expect('"user not found"')
            .end((err) => {
                if (err) return done(err);
                done();
            });
    });
});
