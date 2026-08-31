import { getDb } from "../api/queries/connection";

getDb();
console.log("SQLite database initialized and migrations applied.");
