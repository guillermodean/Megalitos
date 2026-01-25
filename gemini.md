# Megalitos Navarra - Gemini Context

This project is a web application developed for the SCN Gorosti to disseminate information about megalithic stations in Navarre. It digitizes the legacy of Miguel Ezkurdia.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Frontend:** Handlebars (`express-handlebars`)
- **Styling:** CSS (in `src/public/css`), Bootstrap 4 (implied by `datatables.net-bs4`)
- **Database:** MySQL
- **Authentication:** Passport.js (`passport-local`)
- **Testing:** Mocha, Supertest, Chai
- **Other:** Socket.io (present in dependencies), DataTables

## Project Structure

- `src/index.js`: Main entry point of the application.
- `src/database.js`: Database connection configuration.
- `src/routes/`: Contains Express route definitions (index, information, maps, table).
- `src/views/`: Handlebars templates organized by feature.
  - `layout/`: Main layout files.
  - `partials/`: Reusable template parts (navigation, sidebar).
- `src/public/`: Static files (images, CSS, JS).
- `src/lib/`: Custom libraries, helpers, and authentication configuration. Also contains some Python utility scripts for data cleaning.
- `test/`: API tests.

## Development Guidelines

- **Handlebars:** Follow the established pattern of using partials and layouts.
- **Routing:** New routes should be added to `src/routes/` and registered in `src/index.js`.
- **Database:** Use the pool defined in `src/database.js`. Note that both `mysql` and `mysql2` are in dependencies; prefer `mysql2` if possible as it's more modern, but check `src/database.js` for current usage.
- **Styles:** Custom styles should go into `src/public/css/styles.css`.
- **Testing:** Run tests using `npm test`.

## Deployment

- The project is Dockerized (`Dockerfile` present).
- Historically deployed to Heroku.
- CI/CD workflow defined in `.github/workflows/aws.yml`.

## Important Files

- `package.json`: Dependency list and scripts.
- `src/index.js`: Server setup and middleware.
- `src/lib/passport.js`: Authentication logic.
- `src/database.js`: MySQL connection pool.
