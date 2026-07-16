const { google } = require("googleapis");

// Load dotenv to access environment variables from .env / .env.local
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

async function run() {
  if (!credentialsJson) {
    console.error("Error: GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set.");
    console.error("Please add it to your .env or .env.local file first.");
    process.exit(1);
  }

  let credentials;
  try {
    credentials = credentialsJson.startsWith("{") 
      ? JSON.parse(credentialsJson) 
      : require(credentialsJson); // load from file path
  } catch (err) {
    console.error("Error parsing GOOGLE_APPLICATION_CREDENTIALS_JSON:", err.message);
    process.exit(1);
  }

  console.log("Initializing jwtClient for email:", credentials.client_email);
  const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/webmasters"]
  );

  try {
    console.log("Authorizing credentials...");
    await jwtClient.authorize();
    console.log("Authentication successful!");

    const client = google.searchconsole({
      version: "v1",
      auth: jwtClient,
    });

    console.log("Fetching site list...");
    const res = await client.sites.list();
    const siteEntries = res.data.siteEntry || [];
    
    console.log(`\nFound ${siteEntries.length} verified site entries:`);
    siteEntries.forEach((entry, idx) => {
      console.log(`[${idx + 1}] Site URL: "${entry.siteUrl}", Permission: "${entry.permissionLevel}"`);
    });
    console.log("\nIf your site (e.g. http://www.halajets.com) is not in this list, the service account has NOT been added to it in Google Search Console.");
  } catch (err) {
    console.error("\nError verifying GSC credentials:");
    if (err.response && err.response.data && err.response.data.error) {
      console.error(JSON.stringify(err.response.data.error, null, 2));
    } else {
      console.error(err);
    }
  }
}

run();
